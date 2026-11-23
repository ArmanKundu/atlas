import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import { AtlasError } from '@shared/errors'
import { APP_ORIGIN } from '@shared/constants'
import type { Logger } from './log'

/** Size of an exported video. The stage is laid out at 1600 × 900 and scaled to this. */
export const VIDEO_W = 1280
export const VIDEO_H = 720

interface Job {
  window: BrowserWindow
  lessonId: string
  resolve: (bytes: Uint8Array) => void
  reject: (error: Error) => void
}

/**
 * Turns a lesson into an MP4 without recording the screen (no Screen Recording permission):
 * a hidden offscreen window draws the lesson one frame at a time, Atlas copies each frame, and
 * that window encodes the frames and the narration with WebCodecs.
 */
export class VideoExporter {
  private job: Job | null = null

  constructor(
    private readonly deps: {
      devServerUrl?: string
      log: Logger
      emitProgress: (payload: { lessonId: string; done: number; total: number }) => void
    },
  ) {}

  /** The pixels of the recorder's current frame, as BGRA. */
  async frame(): Promise<Uint8Array<ArrayBuffer>> {
    const window = this.job?.window
    if (!window || window.isDestroyed())
      throw new AtlasError('not_found', 'No video is being made.')
    const image = await window.webContents.capturePage()
    const size = image.getSize()
    const resized =
      size.width === VIDEO_W && size.height === VIDEO_H
        ? image
        : image.resize({ width: VIDEO_W, height: VIDEO_H, quality: 'best' })
    const bitmap = resized.toBitmap()
    const out = new Uint8Array(new ArrayBuffer(bitmap.byteLength))
    out.set(bitmap)
    return out
  }

  private started = 0

  progress(done: number, total: number): void {
    if (!this.job) return
    if (total === 0) this.deps.log.info('video: narration ready, drawing frames')
    if (done <= 15) this.started = Date.now()
    else if (done % 300 === 0 || done === total) {
      const fps = (done - 15) / Math.max(0.001, (Date.now() - this.started) / 1000)
      this.deps.log.info(`video: ${done}/${total} frames, ${fps.toFixed(1)} frames a second`)
    }
    this.deps.emitProgress({ lessonId: this.job.lessonId, done, total })
  }

  finished(bytes: Uint8Array): void {
    this.job?.resolve(bytes)
  }

  failed(message: string): void {
    this.job?.reject(new Error(message))
  }

  cancel(): void {
    this.job?.reject(new Error('cancelled'))
  }

  /** Makes the video, then asks where to save it. False if the student cancels the save. */
  async export(input: {
    lessonId: string
    title: string
    parent: BrowserWindow | null
  }): Promise<boolean> {
    if (this.job) throw new AtlasError('conflict', 'A video is already being made.')
    const window = new BrowserWindow({
      show: false,
      width: VIDEO_W,
      height: VIDEO_H,
      useContentSize: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        offscreen: true,
        backgroundThrottling: false,
      },
    })
    window.webContents.setAudioMuted(true)
    window.webContents.setFrameRate(60)
    let timer: NodeJS.Timeout | undefined
    try {
      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        this.job = { window, lessonId: input.lessonId, resolve, reject }
        // A generous ceiling: long lessons take a few minutes to draw and encode.
        timer = setTimeout(() => reject(new Error('Making the video took too long.')), 20 * 60_000)
        window.webContents.on('render-process-gone', () =>
          reject(new Error('The video maker stopped unexpectedly.')),
        )
        const base = this.deps.devServerUrl ?? `${APP_ORIGIN}/index.html`
        window.loadURL(`${base}#/record/${encodeURIComponent(input.lessonId)}`).catch(reject)
      })
      // End-to-end tests write the video straight to a file instead of asking.
      const testOut = process.env['ATLAS_USER_DATA'] && process.env['ATLAS_TEST_VIDEO_OUT']
      if (testOut) {
        await writeFile(testOut, bytes)
        return true
      }
      const safe =
        input.title
          .replace(/[\\/:*?"<>|]+/g, ' ')
          .trim()
          .slice(0, 80) || 'Atlas lesson'
      const options = {
        title: 'Save video',
        defaultPath: join(app.getPath('downloads'), `${safe}.mp4`),
        filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
      }
      const picked = input.parent
        ? await dialog.showSaveDialog(input.parent, options)
        : await dialog.showSaveDialog(options)
      if (picked.canceled || !picked.filePath) return false
      await writeFile(picked.filePath, bytes)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message === 'cancelled') return false
      this.deps.log.warn(`video export failed: ${message}`)
      throw new AtlasError('unavailable', `Could not make the video: ${message}`)
    } finally {
      clearTimeout(timer)
      this.job = null
      if (!window.isDestroyed()) window.destroy()
    }
  }
}

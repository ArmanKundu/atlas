import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
  BrowserWindow,
  ClipboardItem,
  app,
  clipboard,
  desktopCapturer,
  dialog,
  session,
} from 'electron'
import { AtlasError } from '@shared/errors'

/** Screenshots and recordings for bug reports live in a temp folder, never in the library. */
function folder(): string {
  return join(app.getPath('temp'), 'atlas-reports')
}

/** Only files Atlas itself wrote for a report can be copied or saved. */
function own(path: string): string {
  if (!path.startsWith(folder()))
    throw new AtlasError('forbidden', 'That file is not a report capture.')
  return path
}

export async function captureWindow(): Promise<{ path: string; dataUrl: string }> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) throw new AtlasError('unavailable', 'No Atlas window to capture.')
  const image = await win.webContents.capturePage()
  await mkdir(folder(), { recursive: true })
  const path = join(folder(), `screenshot-${Date.now()}.png`)
  await writeFile(path, image.toPNG())
  const preview = image.resize({ width: Math.min(1200, image.getSize().width) })
  return { path, dataUrl: preview.toDataURL() }
}

export async function saveRecording(input: {
  bytes: Uint8Array
  mime: string
}): Promise<{ path: string }> {
  await mkdir(folder(), { recursive: true })
  const ext = input.mime.includes('mp4') ? '.mp4' : '.webm'
  const path = join(folder(), `recording-${Date.now()}${ext}`)
  await writeFile(path, input.bytes)
  return { path }
}

export async function copyImage(path: string): Promise<void> {
  if (!own(path).endsWith('.png'))
    throw new AtlasError('bad_request', 'Only screenshots can be copied.')
  const bytes = await readFile(path)
  await clipboard.write([
    new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) }),
  ])
}

export async function saveAs(path: string): Promise<boolean> {
  const source = own(path)
  const win = BrowserWindow.getFocusedWindow()
  const options = { defaultPath: join(app.getPath('downloads'), basename(source)) }
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return false
  await copyFile(source, result.filePath)
  return true
}

/**
 * Lets the renderer call getDisplayMedia for screen recordings. Atlas records its own
 * window when it can, or the whole screen when the student picks that.
 */
export function allowScreenRecording(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      void desktopCapturer
        .getSources({ types: ['window', 'screen'] })
        .then((sources) => {
          const pick =
            sources.find((s) => s.name === 'Atlas') ??
            sources.find((s) => s.id.startsWith('screen'))
          callback(pick ? { video: pick } : {})
        })
        .catch(() => callback({}))
      void request
    },
    { useSystemPicker: true },
  )
}

/** Saves bytes the student made in Atlas (a whiteboard image or video) where they choose. */
export async function saveBytes(input: { bytes: Uint8Array; name: string }): Promise<boolean> {
  const win = BrowserWindow.getFocusedWindow()
  const safe = input.name.replace(/[^\w .()-]+/g, '').slice(0, 80) || 'Atlas'
  const options = { defaultPath: join(app.getPath('downloads'), safe) }
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return false
  await writeFile(result.filePath, input.bytes)
  return true
}

/** Writes bytes to a temporary file so they can be imported to the library or shared. */
export async function stashBytes(input: { bytes: Uint8Array; name: string }): Promise<string> {
  const dir = join(folder(), `board-${Date.now()}`)
  await mkdir(dir, { recursive: true })
  const safe = input.name.replace(/[^\w .()-]+/g, '').slice(0, 80) || 'Atlas.png'
  const path = join(dir, safe)
  await writeFile(path, input.bytes)
  return path
}

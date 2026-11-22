import { join } from 'node:path'
import { app } from 'electron'
import { AtlasError } from '@shared/errors'
import type { Logger } from './log'

/**
 * Narration for the whiteboard with Kokoro, an open-source (Apache 2.0) text-to-speech model.
 * It runs on this computer. The model (about 90 MB) downloads from Hugging Face the first time
 * and is cached in Atlas's own folder; nothing you type is sent anywhere.
 */
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'

export const VOICES = [
  { id: 'af_heart', name: 'Heart', accent: 'American' },
  { id: 'af_bella', name: 'Bella', accent: 'American' },
  { id: 'am_michael', name: 'Michael', accent: 'American' },
  { id: 'bf_emma', name: 'Emma', accent: 'British' },
  { id: 'bm_george', name: 'George', accent: 'British' },
] as const

interface Tts {
  generate(
    text: string,
    options: { voice: string; speed?: number },
  ): Promise<{
    audio: Float32Array
    sampling_rate: number
    toWav(): ArrayBuffer
  }>
}

export type VoiceState = 'missing' | 'downloading' | 'ready' | 'error'

export class Voice {
  private tts: Promise<Tts> | null = null
  state: VoiceState = 'missing'
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly deps: {
      log: Logger
      progress: (p: { id: string; state: VoiceState; loaded: number; total: number }) => void
    },
  ) {}

  private load(): Promise<Tts> {
    if (this.tts) return this.tts
    this.state = 'downloading'
    const files = new Map<string, { loaded: number; total: number }>()
    const report = (): void => {
      let loaded = 0
      let total = 0
      for (const f of files.values()) {
        loaded += f.loaded
        total += f.total
      }
      this.deps.progress({ id: 'voice', state: this.state, loaded, total })
    }
    this.tts = (async () => {
      const transformers = await import('@huggingface/transformers')
      transformers.env.cacheDir = join(app.getPath('userData'), 'models')
      transformers.env.allowLocalModels = false
      const { KokoroTTS } = await import('kokoro-js')
      const tts = await KokoroTTS.from_pretrained(MODEL, {
        dtype: 'q8',
        device: 'cpu',
        progress_callback: (info: {
          status: string
          file?: string
          loaded?: number
          total?: number
        }) => {
          if (info.status === 'progress' && info.file) {
            files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 })
            report()
          }
        },
      })
      this.state = 'ready'
      report()
      return tts as unknown as Tts
    })().catch((cause: unknown) => {
      this.tts = null
      this.state = 'error'
      report()
      this.deps.log.warn(`voice failed to load: ${String(cause)}`)
      throw new AtlasError(
        'unavailable',
        'The voice could not be downloaded. Check the internet and try again.',
      )
    })
    return this.tts
  }

  async prepare(): Promise<VoiceState> {
    await this.load()
    return this.state
  }

  /** Speaks `text` and returns a WAV file. Requests run one at a time. */
  speak(input: {
    text: string
    voice?: string
    speed?: number
  }): Promise<{ wav: Uint8Array<ArrayBuffer>; seconds: number }> {
    const run = async (): Promise<{ wav: Uint8Array<ArrayBuffer>; seconds: number }> => {
      const tts = await this.load()
      const text = input.text.replace(/\s+/g, ' ').trim().slice(0, 1200)
      if (!text) return { wav: new Uint8Array(), seconds: 0 }
      const audio = await tts.generate(text, {
        voice: input.voice ?? 'af_heart',
        speed: input.speed ?? 1,
      })
      return {
        wav: new Uint8Array(audio.toWav()),
        seconds: audio.audio.length / audio.sampling_rate,
      }
    }
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => undefined)
    return next
  }
}

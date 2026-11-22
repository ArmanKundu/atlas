import { parentPort, workerData } from 'node:worker_threads'

/**
 * Runs Kokoro on its own thread so speech generation never blocks Atlas's main process.
 * Messages in: { id, text, voice, speed } or { id, prepare: true }. Messages out: progress,
 * results and errors, matched by id.
 */
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'

interface Tts {
  generate(
    text: string,
    options: { voice: string; speed?: number },
  ): Promise<{ audio: Float32Array; sampling_rate: number; toWav(): ArrayBuffer }>
}

let tts: Promise<Tts> | null = null
const port = parentPort

function load(): Promise<Tts> {
  if (tts) return tts
  const files = new Map<string, { loaded: number; total: number }>()
  tts = (async () => {
    const transformers = await import('@huggingface/transformers')
    transformers.env.cacheDir = String((workerData as { cacheDir: string }).cacheDir)
    transformers.env.allowLocalModels = false
    const { KokoroTTS } = await import('kokoro-js')
    const model = await KokoroTTS.from_pretrained(MODEL, {
      dtype: 'q8',
      device: 'cpu',
      progress_callback: (info: {
        status: string
        file?: string
        loaded?: number
        total?: number
      }) => {
        if (info.status !== 'progress' || !info.file) return
        files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 })
        let loaded = 0
        let total = 0
        for (const f of files.values()) {
          loaded += f.loaded
          total += f.total
        }
        port?.postMessage({ type: 'progress', loaded, total })
      },
    })
    return model as unknown as Tts
  })()
  tts.catch(() => {
    tts = null
  })
  return tts
}

port?.on(
  'message',
  (msg: { id: number; prepare?: boolean; text?: string; voice?: string; speed?: number }) => {
    void (async () => {
      try {
        const model = await load()
        if (msg.prepare) {
          port.postMessage({ type: 'done', id: msg.id })
          return
        }
        const text = (msg.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 1200)
        if (!text) {
          port.postMessage({ type: 'done', id: msg.id, wav: new Uint8Array(), seconds: 0 })
          return
        }
        const audio = await model.generate(text, {
          voice: msg.voice ?? 'af_heart',
          speed: msg.speed ?? 1,
        })
        const wav = new Uint8Array(audio.toWav())
        port.postMessage(
          {
            type: 'done',
            id: msg.id,
            wav,
            seconds: audio.audio.length / audio.sampling_rate,
          },
          [wav.buffer],
        )
      } catch (cause) {
        port.postMessage({ type: 'error', id: msg.id, message: String(cause) })
      }
    })()
  },
)

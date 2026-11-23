import { parentPort, workerData } from 'node:worker_threads'

/**
 * Runs Whisper on its own thread to turn the student's speech into text, on this computer.
 * Messages in: { id, pcm } (16 kHz mono Float32) or { id, prepare: true }.
 */
const MODEL = 'onnx-community/whisper-base.en'

type Asr = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string }>

let asr: Promise<Asr> | null = null
const port = parentPort

function load(): Promise<Asr> {
  if (asr) return asr
  const files = new Map<string, { loaded: number; total: number }>()
  asr = (async () => {
    const transformers = await import('@huggingface/transformers')
    transformers.env.cacheDir = String((workerData as { cacheDir: string }).cacheDir)
    transformers.env.allowLocalModels = false
    const pipe = await transformers.pipeline('automatic-speech-recognition', MODEL, {
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
    return pipe as unknown as Asr
  })()
  asr.catch(() => {
    asr = null
  })
  return asr
}

port?.on('message', (msg: { id: number; prepare?: boolean; pcm?: Float32Array }) => {
  void (async () => {
    try {
      const model = await load()
      if (msg.prepare || !msg.pcm || msg.pcm.length < 1600) {
        port.postMessage({ type: 'done', id: msg.id, text: '' })
        return
      }
      const out = await model(msg.pcm, { chunk_length_s: 30, stride_length_s: 5 })
      port.postMessage({ type: 'done', id: msg.id, text: out.text.trim() })
    } catch (error) {
      port.postMessage({ type: 'error', id: msg.id, message: String(error) })
    }
  })()
})

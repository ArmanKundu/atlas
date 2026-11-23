import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { app } from 'electron'
import { AtlasError } from '@shared/errors'
import type { Logger } from './log'

/**
 * Narration for the whiteboard with Kokoro, an open-source (Apache 2.0) text-to-speech model.
 * It runs on this computer in a worker thread. The model (about 90 MB) downloads from Hugging
 * Face the first time and is cached in Atlas's own folder; nothing you type is sent anywhere.
 */
export type VoiceState = 'missing' | 'downloading' | 'ready' | 'error'

type Reply =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'done'; id: number; wav?: Uint8Array; seconds?: number }
  | { type: 'error'; id: number; message: string }
type Done = Extract<Reply, { type: 'done' }>

export class Voice {
  state: VoiceState = 'missing'
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (r: Done) => void; reject: (e: Error) => void }>()

  constructor(
    private readonly deps: {
      log: Logger
      progress: (p: { id: string; state: VoiceState; loaded: number; total: number }) => void
    },
  ) {}

  private thread(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(join(__dirname, 'voice-worker.js'), {
      workerData: { cacheDir: join(app.getPath('userData'), 'models') },
    })
    worker.on('message', (reply: Reply) => {
      if (reply.type === 'progress') {
        this.deps.progress({ id: 'voice', state: 'downloading', ...reply })
        return
      }
      const job = this.pending.get(reply.id)
      if (!job) return
      this.pending.delete(reply.id)
      if (reply.type === 'done') {
        if (this.state !== 'ready') {
          this.state = 'ready'
          this.deps.progress({ id: 'voice', state: 'ready', loaded: 0, total: 0 })
        }
        job.resolve(reply)
        return
      }
      this.state = 'error'
      this.deps.progress({ id: 'voice', state: 'error', loaded: 0, total: 0 })
      this.deps.log.warn(`voice failed: ${reply.message}`)
      job.reject(
        new AtlasError(
          'unavailable',
          'The voice could not be downloaded. Check the internet and try again.',
        ),
      )
    })
    worker.on('error', (err) => {
      this.deps.log.warn(`voice worker stopped: ${String(err)}`)
      for (const job of this.pending.values())
        job.reject(new AtlasError('unavailable', 'The voice stopped. Try again.'))
      this.pending.clear()
      this.worker = null
      this.state = 'error'
    })
    this.worker = worker
    return worker
  }

  private send(msg: Record<string, unknown>): Promise<Done> {
    const id = this.nextId++
    if (this.state !== 'ready') this.state = 'downloading'
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.thread().postMessage({ id, ...msg })
    })
  }

  async prepare(): Promise<VoiceState> {
    await this.send({ prepare: true })
    return this.state
  }

  /** Speaks `text` and returns a WAV file. */
  async speak(input: {
    text: string
    voice?: string
    speed?: number
  }): Promise<{ wav: Uint8Array<ArrayBuffer>; seconds: number }> {
    const t0 = Date.now()
    const reply = await this.send(input)
    this.deps.log.info(
      `voice: ${(reply.seconds ?? 0).toFixed(1)} s of speech in ${((Date.now() - t0) / 1000).toFixed(1)} s`,
    )
    return { wav: new Uint8Array(reply.wav ?? new Uint8Array()), seconds: reply.seconds ?? 0 }
  }

  stop(): void {
    void this.worker?.terminate()
    this.worker = null
  }
}

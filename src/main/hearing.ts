import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { app } from 'electron'
import { AtlasError } from '@shared/errors'
import type { Logger } from './log'
import type { VoiceState } from './voice'

type Reply =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'done'; id: number; text: string }
  | { type: 'error'; id: number; message: string }

/**
 * Speech to text with Whisper (base, English, MIT licence), on this computer in a worker thread.
 * The model (about 80 MB) downloads from Hugging Face once; recordings never leave the laptop.
 */
export class Hearing {
  state: VoiceState = 'missing'
  private worker: Worker | null = null
  private nextId = 1
  private pending = new Map<
    number,
    { resolve: (text: string) => void; reject: (e: Error) => void }
  >()

  constructor(
    private readonly deps: {
      log: Logger
      progress: (p: { id: string; state: VoiceState; loaded: number; total: number }) => void
    },
  ) {}

  private thread(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(join(__dirname, 'hear-worker.js'), {
      workerData: { cacheDir: join(app.getPath('userData'), 'models') },
    })
    worker.on('message', (reply: Reply) => {
      if (reply.type === 'progress') {
        this.deps.progress({ id: 'hearing', state: 'downloading', ...reply })
        return
      }
      const job = this.pending.get(reply.id)
      if (!job) return
      this.pending.delete(reply.id)
      if (reply.type === 'done') {
        if (this.state !== 'ready') {
          this.state = 'ready'
          this.deps.progress({ id: 'hearing', state: 'ready', loaded: 0, total: 0 })
        }
        job.resolve(reply.text)
        return
      }
      this.state = 'error'
      this.deps.progress({ id: 'hearing', state: 'error', loaded: 0, total: 0 })
      this.deps.log.warn(`speech recognition failed: ${reply.message}`)
      job.reject(
        new AtlasError(
          'unavailable',
          'Speech recognition could not start. Check the internet and try again.',
        ),
      )
    })
    worker.on('error', (err) => {
      this.deps.log.warn(`speech worker stopped: ${String(err)}`)
      for (const job of this.pending.values())
        job.reject(new AtlasError('unavailable', 'Speech recognition stopped. Try again.'))
      this.pending.clear()
      this.worker = null
      this.state = 'error'
    })
    this.worker = worker
    return worker
  }

  private send(msg: { prepare?: boolean; pcm?: Float32Array }): Promise<string> {
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

  /** Text from 16 kHz mono audio. */
  transcribe(pcm: Float32Array): Promise<string> {
    return this.send({ pcm })
  }

  stop(): void {
    void this.worker?.terminate()
    this.worker = null
  }
}

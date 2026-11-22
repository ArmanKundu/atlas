import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { LocalModelInfo } from '@shared/models'
import type { getLlama } from 'node-llama-cpp'
import { AiError } from './errors'

/**
 * Atlas's built-in AI: a small open model that runs on this computer with llama.cpp. No
 * account, no limits, no internet once it is downloaded. Answers are weaker than Claude's but
 * free and private.
 */
export const LOCAL_MODELS = [
  {
    id: 'qwen3-1.7b',
    name: 'Light',
    detail: 'Qwen3 1.7B. For older or low-memory laptops (4 GB RAM)',
    uri: 'hf:unsloth/Qwen3-1.7B-GGUF:Q4_K_M',
    size: 1_110_000_000,
  },
  {
    id: 'qwen3-4b',
    name: 'Standard',
    detail: 'Qwen3 4B Instruct. Better answers; needs 8 GB RAM',
    uri: 'hf:unsloth/Qwen3-4B-Instruct-2507-GGUF:Q4_K_M',
    size: 2_500_000_000,
  },
] as const

type Llama = Awaited<ReturnType<typeof getLlama>>
type Model = Awaited<ReturnType<Llama['loadModel']>>

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

class LocalModels {
  private llama: Promise<Llama> | null = null
  private loaded: { id: string; model: Promise<Model> } | null = null
  private downloads = new Map<string, { loaded: number; total: number; abort: AbortController }>()
  private progress: (p: {
    id: string
    loaded: number
    total: number
    done: boolean
    failed?: boolean
  }) => void = () => undefined

  onProgress(fn: typeof this.progress): void {
    this.progress = fn
  }

  private dir(id: string): string {
    return join(app.getPath('userData'), 'models', 'llm', id)
  }

  private async file(id: string): Promise<string | null> {
    try {
      const names = await readdir(this.dir(id))
      const gguf = names.find((n) => n.endsWith('.gguf') && !n.endsWith('.ipull'))
      return gguf ? join(this.dir(id), gguf) : null
    } catch {
      return null
    }
  }

  async list(): Promise<LocalModelInfo[]> {
    return Promise.all(
      LOCAL_MODELS.map(async (m) => {
        const path = await this.file(m.id)
        const download = this.downloads.get(m.id)
        let size: number = m.size
        if (path) size = (await stat(path)).size
        return {
          id: m.id,
          name: m.name,
          detail: m.detail,
          size,
          installed: Boolean(path) && !download,
          downloading: download ? { loaded: download.loaded, total: download.total } : null,
        }
      }),
    )
  }

  async installed(): Promise<string[]> {
    return (await this.list()).filter((m) => m.installed).map((m) => m.id)
  }

  async download(id: string): Promise<void> {
    const def = LOCAL_MODELS.find((m) => m.id === id)
    if (!def) throw new AiError('unsupported', 'unknown model')
    if (this.downloads.has(id)) return
    const abort = new AbortController()
    const entry: { loaded: number; total: number; abort: AbortController } = {
      loaded: 0,
      total: def.size,
      abort,
    }
    this.downloads.set(id, entry)
    try {
      await mkdir(this.dir(id), { recursive: true })
      const { createModelDownloader } = await import('node-llama-cpp')
      const downloader = await createModelDownloader({
        modelUri: def.uri,
        dirPath: this.dir(id),
        onProgress: ({ totalSize, downloadedSize }) => {
          entry.loaded = downloadedSize
          entry.total = totalSize
          this.progress({ id, loaded: downloadedSize, total: totalSize, done: false })
        },
      })
      abort.signal.addEventListener('abort', () => void downloader.cancel())
      await downloader.download()
      this.downloads.delete(id)
      this.progress({ id, loaded: entry.total, total: entry.total, done: true })
    } catch (cause) {
      this.downloads.delete(id)
      this.progress({ id, loaded: 0, total: def.size, done: true, failed: true })
      if (abort.signal.aborted) return
      throw new AiError('network', cause instanceof Error ? cause.message : String(cause))
    }
  }

  cancel(id: string): void {
    this.downloads.get(id)?.abort.abort()
  }

  async remove(id: string): Promise<void> {
    if (this.loaded?.id === id) {
      const model = await this.loaded.model.catch(() => null)
      await model?.dispose()
      this.loaded = null
    }
    await rm(this.dir(id), { recursive: true, force: true })
  }

  private async model(id: string): Promise<Model> {
    if (this.loaded?.id === id) return this.loaded.model
    if (this.loaded) {
      const old = await this.loaded.model.catch(() => null)
      await old?.dispose()
    }
    const path = await this.file(id)
    if (!path)
      throw new AiError('not_installed', 'Download the built-in model in Settings, AI first.')
    const llamaCpp = await import('node-llama-cpp')
    this.llama ??= llamaCpp.getLlama()
    const llama = await this.llama
    const model = llama.loadModel({ modelPath: path })
    this.loaded = { id, model }
    model.catch(() => {
      if (this.loaded?.model === model) this.loaded = null
    })
    return model
  }

  /** Streams an answer from the built-in model. */
  async stream(input: {
    id: string
    system: string
    messages: Turn[]
    signal: AbortSignal
    maxTokens?: number
    onText: (text: string) => void
  }): Promise<string> {
    const model = await this.model(input.id)
    const { LlamaChatSession, QwenChatWrapper } = await import('node-llama-cpp')
    const context = await model.createContext({ contextSize: { min: 4096, max: 16384 } })
    try {
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: input.system,
        // Thinking out loud makes small models slow; ask for the answer directly.
        chatWrapper: new QwenChatWrapper({ thoughts: 'discourage' }),
      })
      const history = input.messages.slice(0, -1)
      const last = input.messages.at(-1)
      if (!last || last.role !== 'user') throw new AiError('bad_output', 'nothing to answer')
      session.setChatHistory([
        { type: 'system', text: input.system },
        ...history.map((t) =>
          t.role === 'user'
            ? { type: 'user' as const, text: t.content }
            : { type: 'model' as const, response: [t.content] },
        ),
      ])
      let text = ''
      await session.prompt(last.content, {
        signal: input.signal,
        stopOnAbortSignal: true,
        maxTokens: input.maxTokens ?? 4096,
        temperature: 0.6,
        onTextChunk: (chunk) => {
          text += chunk
          input.onText(chunk)
        },
      })
      if (input.signal.aborted) throw new AiError('cancelled')
      return text
    } finally {
      await context.dispose()
    }
  }
}

export const localModels = new LocalModels()

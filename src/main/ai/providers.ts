import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { ProviderId, ProviderStatus } from '@shared/models'
import * as claudeCli from './adapters/claude-code/cli'
import {
  classifyCliFailure,
  cliVersion,
  findBinary,
  flattenConversation,
  runCli,
} from './adapters/cli-runner'
import * as codexCli from './adapters/codex/cli'
import * as geminiCli from './adapters/gemini-cli/cli'
import { AiError } from './errors'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamRequest {
  system: string
  messages: ChatTurn[]
  model: string | null
  signal: AbortSignal
  onText: (text: string) => void
  /** Short jobs (tests, titles) ask for less. */
  maxTokens?: number
}

export interface StreamResult {
  text: string
  model: string | null
}

export interface AdapterContext {
  /** The user's key for this provider from the keychain, or null. */
  key: string | null
}

interface ProviderDef {
  id: ProviderId
  name: string
  kind: ProviderStatus['kind']
  description: string
  termsUrl: string
  installHint: string | null
  loginCommand?: string
  defaultModel: string | null
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'claude-code',
    name: 'Claude',
    kind: 'subscription',
    description: 'Your Claude Pro or Max plan, through the official Claude Code app',
    termsUrl: 'https://www.anthropic.com/legal/consumer-terms',
    installHint: claudeCli.INSTALL_HINT,
    loginCommand: claudeCli.LOGIN_COMMAND,
    defaultModel: null,
  },
  {
    id: 'codex',
    name: 'ChatGPT',
    kind: 'subscription',
    description: 'Your ChatGPT Plus or Pro plan, through the official Codex CLI',
    termsUrl: 'https://openai.com/policies/terms-of-use/',
    installHint: codexCli.INSTALL_HINT,
    loginCommand: codexCli.LOGIN_COMMAND,
    defaultModel: null,
  },
  {
    id: 'gemini-cli',
    name: 'Gemini',
    kind: 'subscription',
    description: 'Your Google account, through the official Gemini CLI',
    termsUrl: 'https://policies.google.com/terms',
    installHint: geminiCli.INSTALL_HINT,
    loginCommand: geminiCli.LOGIN_COMMAND,
    defaultModel: null,
  },
  {
    id: 'ollama',
    name: 'Ollama',
    kind: 'local',
    description: 'A model running on this computer. Fully offline',
    termsUrl: 'https://ollama.com',
    installHint: 'Download Ollama from ollama.com, then run: ollama pull llama3.2',
    defaultModel: null,
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    kind: 'local',
    description: 'A model running on this computer. Fully offline',
    termsUrl: 'https://lmstudio.ai',
    installHint: 'Download LM Studio from lmstudio.ai, load a model and start its local server',
    defaultModel: null,
  },
  {
    id: 'anthropic-api',
    name: 'Anthropic API key',
    kind: 'api-key',
    description: 'Pay-as-you-go Claude with your own key',
    termsUrl: 'https://www.anthropic.com/legal/commercial-terms',
    installHint: null,
    defaultModel: 'claude-opus-5-5',
  },
  {
    id: 'openai-api',
    name: 'OpenAI API key',
    kind: 'api-key',
    description: 'Pay-as-you-go GPT models with your own key',
    termsUrl: 'https://openai.com/policies/terms-of-use/',
    installHint: null,
    defaultModel: null,
  },
  {
    id: 'google-api',
    name: 'Google AI API key',
    kind: 'api-key',
    description: 'Gemini models with your own key',
    termsUrl: 'https://ai.google.dev/gemini-api/terms',
    installHint: null,
    defaultModel: null,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter key',
    kind: 'api-key',
    description: 'Many models through one key',
    termsUrl: 'https://openrouter.ai/terms',
    installHint: null,
    defaultModel: 'openrouter/auto',
  },
]

export function providerDef(id: ProviderId): ProviderDef {
  const def = PROVIDERS.find((p) => p.id === id)
  if (!def) throw new AiError('unsupported')
  return def
}

const OPENAI_COMPATIBLE: Partial<Record<ProviderId, { baseURL?: string; localKey?: string }>> = {
  'openai-api': {},
  openrouter: { baseURL: 'https://openrouter.ai/api/v1' },
  'google-api': { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' },
  ollama: { baseURL: 'http://127.0.0.1:11434/v1', localKey: 'ollama' },
  lmstudio: { baseURL: 'http://127.0.0.1:1234/v1', localKey: 'lm-studio' },
}

const CLI_BINARY: Partial<Record<ProviderId, string>> = {
  'claude-code': claudeCli.BINARY,
  codex: codexCli.BINARY,
  'gemini-cli': geminiCli.BINARY,
}

/* ---------- Model lists ---------- */

const modelCache = new Map<string, { at: number; models: string[] }>()

function openAiClient(id: ProviderId, ctx: AdapterContext): OpenAI {
  const spec = OPENAI_COMPATIBLE[id]
  if (!spec) throw new AiError('unsupported')
  const apiKey = spec.localKey ?? ctx.key
  if (!apiKey) throw new AiError('not_signed_in')
  return new OpenAI({ apiKey, baseURL: spec.baseURL, maxRetries: 1, timeout: 180_000 })
}

function anthropicClient(ctx: AdapterContext): Anthropic {
  if (!ctx.key) throw new AiError('not_signed_in')
  return new Anthropic({ apiKey: ctx.key, maxRetries: 1 })
}

const byNewest = (a: string, b: string): number => b.localeCompare(a, undefined, { numeric: true })

export async function listModels(id: ProviderId, ctx: AdapterContext): Promise<string[]> {
  if (CLI_BINARY[id]) return []
  const cached = modelCache.get(id)
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.models

  const models: string[] = []
  try {
    if (id === 'anthropic-api') {
      for await (const model of anthropicClient(ctx).models.list()) models.push(model.id)
    } else {
      for await (const model of openAiClient(id, ctx).models.list()) {
        models.push(model.id.replace(/^models\//, ''))
      }
      models.sort(byNewest)
    }
  } catch (error) {
    throw toAiError(error)
  }
  modelCache.set(id, { at: Date.now(), models })
  return models
}

/** A sensible model when the user has not chosen one. */
export async function resolveModel(
  id: ProviderId,
  chosen: string | null,
  ctx: AdapterContext,
): Promise<string | null> {
  if (chosen) return chosen
  const def = providerDef(id)
  if (def.defaultModel) return def.defaultModel
  if (CLI_BINARY[id]) return null // the CLI uses the plan's own default
  const models = await listModels(id, ctx)
  const skip =
    /mini|nano|audio|realtime|image|tts|transcribe|search|embed|moderation|lite|live|vision|instruct|codex/i
  if (id === 'openai-api')
    return (
      models.find((m) => /^gpt-\d/.test(m) && !skip.test(m)) ??
      models.find((m) => m.startsWith('gpt')) ??
      models[0] ??
      null
    )
  if (id === 'google-api')
    return (
      models.find((m) => /^gemini-[\d.]+-flash$/.test(m)) ??
      models.find((m) => m.startsWith('gemini') && !skip.test(m)) ??
      models[0] ??
      null
    )
  return models[0] ?? null
}

/* ---------- Status ---------- */

export async function providerStatus(
  id: ProviderId,
  ctx: AdapterContext,
  model: string | null,
): Promise<ProviderStatus> {
  const def = providerDef(id)
  const base = {
    id,
    name: def.name,
    kind: def.kind,
    description: def.description,
    termsUrl: def.termsUrl,
    installHint: def.installHint,
    model,
  }

  const binaryName = CLI_BINARY[id]
  if (binaryName) {
    const binary = findBinary(binaryName)
    if (!binary)
      return { ...base, installed: false, ready: false, detail: 'Not installed on this computer' }
    const version = await cliVersion(binary)
    return {
      ...base,
      installed: true,
      ready: true,
      detail: `Installed${version ? ` (${version})` : ''}. Sign-in is checked the first time you use it`,
    }
  }

  if (def.kind === 'local') {
    const spec = OPENAI_COMPATIBLE[id]
    try {
      const response = await fetch(`${spec?.baseURL}/models`, { signal: AbortSignal.timeout(1200) })
      const body = (await response.json()) as { data?: unknown[] }
      const count = Array.isArray(body.data) ? body.data.length : 0
      return {
        ...base,
        installed: true,
        ready: count > 0,
        detail:
          count > 0
            ? `Running, ${count} model${count === 1 ? '' : 's'} available`
            : 'Running, but no model is installed yet',
      }
    } catch {
      return { ...base, installed: false, ready: false, detail: 'Not running on this computer' }
    }
  }

  return {
    ...base,
    installed: true,
    ready: Boolean(ctx.key),
    detail: ctx.key ? 'Key saved in your keychain' : 'No key added yet',
  }
}

/* ---------- Streaming ---------- */

/** Models that take `output_config.effort` and the server-side refusal fallback. */
const ANTHROPIC_EFFORT = /claude-(fable|mythos|opus-5|sonnet-5|haiku-5|opus-4-[678]|sonnet-4-6)/
const ANTHROPIC_FALLBACK = /^claude-(fable-5-[12]|opus-5(-5)?|sonnet-5-5)$/

async function streamAnthropic(request: StreamRequest, ctx: AdapterContext): Promise<StreamResult> {
  const client = anthropicClient(ctx)
  const model = request.model ?? 'claude-opus-5-5'
  const useFallback = ANTHROPIC_FALLBACK.test(model)

  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: request.maxTokens ?? 32_000,
      system: request.system,
      messages: request.messages,
      // Thinking is adaptive by default on current models; effort is set explicitly because the
      // default differs between models.
      ...(ANTHROPIC_EFFORT.test(model) ? { output_config: { effort: 'medium' as const } } : {}),
      // If a safety classifier declines, let the API retry on its default fallback model.
      ...(useFallback
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
    },
    { signal: request.signal },
  )
  stream.on('text', (text) => request.onText(text))
  const final = await stream.finalMessage()
  if (final.stop_reason === 'refusal') throw new AiError('refused')
  const text = final.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
  return { text, model: final.model }
}

async function streamOpenAiCompatible(
  id: ProviderId,
  request: StreamRequest,
  ctx: AdapterContext,
): Promise<StreamResult> {
  const client = openAiClient(id, ctx)
  const model = request.model
  if (!model) throw new AiError('unsupported', 'no model is available')
  const stream = await client.chat.completions.create(
    {
      model,
      stream: true,
      messages: [{ role: 'system', content: request.system }, ...request.messages],
    },
    { signal: request.signal },
  )
  let text = ''
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) {
      text += delta
      request.onText(delta)
    }
  }
  return { text, model }
}

async function streamCli(id: ProviderId, request: StreamRequest): Promise<StreamResult> {
  const binary = findBinary(CLI_BINARY[id] ?? '')
  if (!binary) throw new AiError('not_installed')
  let text = ''
  const emit = (chunk: string): void => {
    if (!chunk) return
    text += chunk
    request.onText(chunk)
  }

  if (id === 'claude-code') {
    let final: { ok: boolean; text: string } | undefined
    const result = await runCli({
      binary,
      args: claudeCli.buildArgs({ system: request.system, model: request.model }),
      stdin: flattenConversation('', request.messages).replace(/^\s*---\s*/, ''),
      signal: request.signal,
      onLine: (line) => {
        const parsed = claudeCli.parseLine(line)
        if (parsed.text) emit(parsed.text)
        if (parsed.final) final = parsed.final
      },
    })
    if (final && !final.ok) throw classifyCliFailure(final.text || result.stderr)
    if (!text && final?.text) emit(final.text)
    if (!text) throw classifyCliFailure(result.stderr || result.stdout || 'no output')
    return { text, model: request.model }
  }

  const prompt = flattenConversation(request.system, request.messages)
  if (id === 'codex') {
    const result = await runCli({
      binary,
      args: codexCli.buildArgs({ model: request.model }),
      stdin: prompt,
      signal: request.signal,
      onLine: (line) => emit(codexCli.parseLine(line).text ?? ''),
    })
    if (!text) throw classifyCliFailure(result.stderr || result.stdout || 'no output')
    return { text, model: request.model }
  }

  const result = await runCli({
    binary,
    args: geminiCli.buildArgs({ model: request.model }),
    stdin: prompt,
    signal: request.signal,
    onChunk: emit,
  })
  if (result.code !== 0 || !text.trim())
    throw classifyCliFailure(result.stderr || result.stdout || 'no output')
  return { text, model: request.model }
}

export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error
  if (error instanceof Anthropic.APIUserAbortError || error instanceof OpenAI.APIUserAbortError)
    return new AiError('cancelled')
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  )
    return new AiError('not_signed_in')
  if (error instanceof Anthropic.RateLimitError) return new AiError('usage_limit')
  if (error instanceof Anthropic.APIConnectionError) return new AiError('network')
  if (error instanceof Anthropic.APIError) return new AiError('unknown', error.message)
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError)
    return new AiError('not_signed_in')
  if (error instanceof OpenAI.RateLimitError) return new AiError('usage_limit')
  if (error instanceof OpenAI.APIConnectionError) return new AiError('network')
  if (error instanceof OpenAI.APIError) return new AiError('unknown', error.message)
  if (error instanceof Error && error.name === 'AbortError') return new AiError('cancelled')
  return new AiError('unknown', error instanceof Error ? error.message : undefined)
}

/** Sends one request to one provider. Throws an `AiError`. */
export async function streamFrom(
  id: ProviderId,
  request: StreamRequest,
  ctx: AdapterContext,
): Promise<StreamResult> {
  try {
    if (id === 'anthropic-api') return await streamAnthropic(request, ctx)
    if (CLI_BINARY[id]) return await streamCli(id, request)
    return await streamOpenAiCompatible(id, request, ctx)
  } catch (error) {
    if (request.signal.aborted) throw new AiError('cancelled')
    throw toAiError(error)
  }
}

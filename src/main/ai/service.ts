import { spawn } from 'node:child_process'
import { AtlasError } from '@shared/errors'
import {
  AiConfigSchema,
  PROVIDER_IDS,
  type AiConfig,
  type ChatMessage,
  type ChatSource,
  type ProviderId,
  type ProviderStatus,
} from '@shared/models'
import type { Database, Row } from '../db/database'
import type { Logger } from '../log'
import type { ProfileManager } from '../profiles'
import { AiError, shouldFallThrough } from './errors'
import { agentSystemPrompt } from './prompts/agents'
import { lessonFollowUpPrompt, lessonSystemPrompt, type LessonOptions } from './prompts/lesson'
import type { AiDetails } from '@shared/community'
import { parseLesson } from '@shared/lesson'
import { auditLesson } from '@shared/lesson-audit'
import { DETAILS_PROMPT, DIGEST_PROMPT, TASK_PROMPTS, type CompleteTask } from './prompts/tasks'
import { extname } from 'node:path'
import { extractText } from '../extract-text'
import {
  canSeeFiles,
  isImageFile,
  listModels,
  providerDef,
  providerStatus,
  resolveModel,
  streamFrom,
  type AdapterContext,
  type ChatTurn,
} from './providers'
import type { SecretStore } from './secrets'

const STOPWORDS = new Set(
  'about after again also because been before being between both could does doing during each from further have having here into more most other over same should some such than that their them then there these they this those through under until very were what when where which while will with would your explain question answer please'.split(
    ' ',
  ),
)

/** An OR query of the distinctive words in a question, for retrieving relevant pages. */
export function toRetrievalQuery(input: string): string {
  const words = [
    ...new Set(
      input
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
    ),
  ]
  return words
    .slice(0, 10)
    .map((w) => `"${w}"`)
    .join(' OR ')
}

/** The part of a page around the first matching word, capped at `size` characters. */
export function excerptAround(text: string, query: string, size = 1500): string {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4)
  const lower = text.toLowerCase()
  let at = -1
  for (const word of words) {
    const index = lower.indexOf(word)
    if (index !== -1 && (at === -1 || index < at)) at = index
  }
  const start = Math.max(0, (at === -1 ? 0 : at) - Math.floor(size / 3))
  const slice = text
    .slice(start, start + size)
    .replace(/\s+/g, ' ')
    .trim()
  return `${start > 0 ? '… ' : ''}${slice}${start + size < text.length ? ' …' : ''}`
}

function toChatMessage(row: Row): ChatMessage {
  return {
    id: String(row['id']),
    chatId: String(row['chatId']),
    createdAt: Number(row['createdAt']),
    role: row['role'] === 'assistant' ? 'assistant' : 'user',
    contentMd: String(row['contentMd'] ?? ''),
    provider: (row['provider'] as string | null) ?? null,
    model: (row['model'] as string | null) ?? null,
    sources: Array.isArray(row['sources']) ? (row['sources'] as ChatSource[]) : [],
    status:
      (['streaming', 'done', 'error', 'cancelled'] as const).find((s) => s === row['status']) ??
      'done',
    error: (row['error'] as string | null) ?? null,
  }
}

export interface AiServiceDeps {
  profiles: ProfileManager
  secrets: SecretStore
  log: Logger
  emitDelta: (payload: { chatId: string; messageId: string; text: string }) => void
  emitFinished: (payload: { chatId: string; message: ChatMessage }) => void
  emitLesson?: (
    event:
      | { kind: 'delta'; requestId: string; text: string }
      | {
          kind: 'done'
          requestId: string
          text: string
          provider: string | null
          error: string | null
        },
  ) => void
}

/**
 * Everything AI: which providers are connected, which one handles a request, grounded chat with
 * streaming, and one-shot jobs. Runs only in the main process; keys never leave it.
 */
export class AiService {
  private readonly running = new Map<string, AbortController>()
  /** Text streamed so far for each reply in progress, by message id. */
  private readonly partial = new Map<string, string>()

  /** Extra context from the shared library (spaces, matching items, how to share). */
  private sharedContext: ((question: string) => Promise<string | null>) | null = null

  constructor(private readonly deps: AiServiceDeps) {}

  setSharedContext(fn: (question: string) => Promise<string | null>): void {
    this.sharedContext = fn
  }

  /** The shared-library context, or nothing if it is slow, offline or signed out. */
  private async shared(question: string): Promise<string | null> {
    if (!this.sharedContext) return null
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
    try {
      return await Promise.race([this.sharedContext(question), timeout])
    } catch (error) {
      this.deps.log.warn(`shared context failed: ${String(error)}`)
      return null
    }
  }

  private db(): Database {
    return this.deps.profiles.db()
  }

  private secretName(provider: ProviderId): string {
    return `${this.deps.profiles.current?.id ?? 'none'}:${provider}`
  }

  private ctx(provider: ProviderId): AdapterContext {
    return { key: this.deps.secrets.get(this.secretName(provider)) }
  }

  /* ---------- Configuration ---------- */

  config(): AiConfig {
    return AiConfigSchema.parse(this.db().getSetting('ai.config', {}))
  }

  setConfig(patch: Partial<AiConfig>): AiConfig {
    const next = AiConfigSchema.parse({ ...this.config(), ...patch })
    this.db().setSetting('ai.config', next)
    return next
  }

  setKey(provider: ProviderId, key: string): void {
    if (providerDef(provider).kind !== 'api-key')
      throw new AtlasError('bad_request', 'That provider does not use a key.')
    this.deps.secrets.set(this.secretName(provider), key.trim())
    if (!this.config().defaultProvider) this.setConfig({ defaultProvider: provider })
  }

  clearKey(provider: ProviderId): void {
    this.deps.secrets.delete(this.secretName(provider))
    if (this.config().defaultProvider === provider) this.setConfig({ defaultProvider: null })
  }

  async statuses(): Promise<ProviderStatus[]> {
    const models = this.config().models
    return Promise.all(
      PROVIDER_IDS.map((id) => providerStatus(id, this.ctx(id), models[id] ?? null)),
    )
  }

  models(provider: ProviderId): Promise<string[]> {
    return listModels(provider, this.ctx(provider))
  }

  /** Opens the provider's own sign-in in a terminal window. Atlas never sees the credentials. */
  login(provider: ProviderId): void {
    const command = providerDef(provider).loginCommand
    if (!command) throw new AtlasError('bad_request', 'That provider has no sign-in step.')
    if (process.platform === 'darwin') {
      spawn(
        'osascript',
        [
          '-e',
          `tell application "Terminal" to do script "${command}"`,
          '-e',
          'tell application "Terminal" to activate',
        ],
        { detached: true, stdio: 'ignore' },
      ).unref()
    } else if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', command], {
        detached: true,
        stdio: 'ignore',
      }).unref()
    } else {
      spawn('x-terminal-emulator', ['-e', command], { detached: true, stdio: 'ignore' }).unref()
    }
  }

  /* ---------- Routing ---------- */

  /** Providers to try, in order: the task's route, the chat's choice, the default, then the rest. */
  private async order(task: string, preferred?: string | null): Promise<ProviderId[]> {
    const config = this.config()
    const statuses = await this.statuses()
    const ready = new Set(statuses.filter((s) => s.ready).map((s) => s.id))
    const wanted: ProviderId[] = [
      ...(config.routes[task] ?? []),
      ...(PROVIDER_IDS.includes(preferred as ProviderId) ? [preferred as ProviderId] : []),
      ...(config.defaultProvider ? [config.defaultProvider] : []),
    ]
    // With no explicit choice anywhere, "No AI" stays off rather than picking a provider silently.
    if (wanted.length === 0) return []
    return [...new Set([...wanted, ...PROVIDER_IDS])].filter((id) => ready.has(id))
  }

  private bumpUsage(provider: string): void {
    const day = new Date().toISOString().slice(0, 10)
    this.db().tx(() =>
      this.db().run(
        'INSERT INTO ai_usage (day, provider, calls) VALUES (?, ?, 1) ON CONFLICT(day, provider) DO UPDATE SET calls = calls + 1',
        day,
        provider,
      ),
    )
  }

  private async run(input: {
    task: string
    system: string
    messages: ChatTurn[]
    preferred?: string | null
    model?: string | null
    signal: AbortSignal
    onText: (text: string) => void
    maxTokens?: number
    files?: string[]
    /** Put providers that pass this test first (e.g. ones that can see the file). */
    prefer?: (id: ProviderId) => boolean
  }): Promise<{ text: string; provider: ProviderId; model: string | null }> {
    let order = await this.order(input.task, input.preferred)
    const prefer = input.prefer
    if (prefer) order = [...order.filter(prefer), ...order.filter((id) => !prefer(id))]
    if (order.length === 0) throw new AiError('ai_unavailable')
    const models = this.config().models
    let lastError: AiError = new AiError('ai_unavailable')

    for (const provider of order) {
      let emitted = false
      try {
        const ctx = this.ctx(provider)
        const chosen =
          provider === input.preferred && input.model ? input.model : (models[provider] ?? null)
        const model = await resolveModel(provider, chosen, ctx)
        const result = await streamFrom(
          provider,
          {
            system: input.system,
            messages: input.messages,
            model,
            signal: input.signal,
            maxTokens: input.maxTokens,
            files: input.files,
            onText: (text) => {
              emitted = true
              input.onText(text)
            },
          },
          ctx,
        )
        this.bumpUsage(provider)
        return { text: result.text, provider, model: result.model }
      } catch (error) {
        lastError = error instanceof AiError ? error : new AiError('unknown')
        this.deps.log.warn(`ai ${input.task} via ${provider} failed: ${lastError.code}`)
        // Once text has reached the screen, switching provider would garble the answer.
        if (emitted || !shouldFallThrough(lastError.code)) throw lastError
      }
    }
    throw lastError
  }

  /* ---------- Chat ---------- */

  messages(chatId: string): ChatMessage[] {
    return this.db()
      .list('chat_messages', { chatId }, { orderBy: 'createdAt' })
      .map(toChatMessage)
      .map((message) =>
        message.status === 'streaming'
          ? { ...message, contentMd: this.partial.get(message.id) ?? message.contentMd }
          : message,
      )
  }

  private retrieve(question: string, subjectId: string | null): ChatSource[] {
    const match = toRetrievalQuery(question)
    if (!match) return []
    const rows = this.db().all(
      `SELECT p.source_id, p.number, p.text, s.title FROM pages_fts
       JOIN pages p ON p.rowid = pages_fts.rowid JOIN sources s ON s.id = p.source_id
       WHERE pages_fts MATCH ? AND s.deleted_at IS NULL AND (? IS NULL OR s.subject_id = ?)
       ORDER BY rank LIMIT 6`,
      match,
      subjectId,
      subjectId,
    )
    return rows.map((row, index) => ({
      n: index + 1,
      sourceId: String(row['source_id']),
      title: String(row['title']),
      page: Number(row['number']),
      snippet: excerptAround(String(row['text']), question),
    }))
  }

  private studentContext(subjectId: string | null): string {
    const db = this.db()
    const meta = db.one("SELECT name, year_level, study_system FROM profile_meta WHERE id = 'me'")
    const subject = subjectId ? db.get('subjects', subjectId) : undefined
    const memories = db.list('memories', {}, { limit: 20 }).map((m) => `- ${String(m['content'])}`)
    const lines = [
      `Student: ${String(meta?.['name'] ?? 'the student')}${meta?.['year_level'] ? `, ${String(meta['year_level'])}` : ''}${meta?.['study_system'] && meta['study_system'] !== 'other' ? `, studying under ${String(meta['study_system']).toUpperCase()}` : ''}.`,
      subject
        ? `Subject for this conversation: ${String(subject['name'])}${subject['code'] ? ` (${String(subject['code'])})` : ''}.`
        : 'No single subject is selected for this conversation.',
      `Today is ${new Date().toDateString()}.`,
    ]
    if (memories.length) lines.push('What you know about this student:', ...memories)
    return lines.join('\n')
  }

  /** Saves the user's message, starts the reply, and streams it through `ai:delta` events. */
  async send(
    chatId: string,
    content: string,
  ): Promise<{ user: ChatMessage; assistant: ChatMessage }> {
    const chat = this.db().get('chats', chatId)
    if (!chat) throw new AtlasError('not_found', 'That chat no longer exists.')
    if (this.running.has(chatId))
      throw new AtlasError('conflict', 'Wait for the current reply to finish, or stop it.')
    const shared = await this.shared(content)
    const db = this.db()

    const subjectId = (chat['subjectId'] as string | null) ?? null
    const history: ChatTurn[] = this.messages(chatId)
      .filter((m) => m.status === 'done' && m.contentMd.trim())
      .slice(-24)
      .map((m) => ({ role: m.role, content: m.contentMd }))
    const sources = this.retrieve(content, subjectId)

    const user = toChatMessage(
      db.insert('chat_messages', {
        chatId,
        role: 'user',
        contentMd: content,
        status: 'done',
        sources: [],
      }),
    )
    const assistant = toChatMessage(
      db.insert('chat_messages', {
        chatId,
        role: 'assistant',
        contentMd: '',
        status: 'streaming',
        sources,
      }),
    )
    if (chat['title'] === 'New chat') {
      db.update('chats', chatId, {
        title: content.replace(/\s+/g, ' ').trim().slice(0, 64) || 'New chat',
      })
    } else db.update('chats', chatId, {})

    const system = [
      agentSystemPrompt(String(chat['agent'])),
      this.studentContext(subjectId),
      sources.length
        ? `Sources from the student's own library. Cite them as [n].\n\n${sources.map((s) => `[${s.n}] ${s.title}, page ${s.page}\n${s.snippet}`).join('\n\n')}`
        : "No matching pages were found in the student's library for this message.",
      ...(shared ? [shared] : []),
    ].join('\n\n')

    const controller = new AbortController()
    this.running.set(chatId, controller)
    let text = ''

    void this.run({
      task: 'chat',
      system,
      messages: [...history, { role: 'user', content }],
      preferred: (chat['provider'] as string | null) ?? null,
      model: (chat['model'] as string | null) ?? null,
      signal: controller.signal,
      onText: (chunk) => {
        text += chunk
        this.partial.set(assistant.id, text)
        this.deps.emitDelta({ chatId, messageId: assistant.id, text: chunk })
      },
    })
      .then((result) => ({
        contentMd: result.text || text,
        status: 'done',
        provider: result.provider,
        model: result.model,
        error: null,
      }))
      .catch((error: unknown) => {
        const failure = error instanceof AiError ? error : new AiError('unknown')
        return {
          contentMd: text,
          status: failure.code === 'cancelled' ? 'cancelled' : 'error',
          provider: null,
          model: null,
          error: failure.code === 'cancelled' ? null : failure.message,
        }
      })
      .then((patch) => {
        this.running.delete(chatId)
        this.partial.delete(assistant.id)
        try {
          const row = this.db().update('chat_messages', assistant.id, patch)
          if (row) this.deps.emitFinished({ chatId, message: toChatMessage(row) })
        } catch (error) {
          this.deps.log.error('could not save the assistant reply', error)
        }
      })

    return { user, assistant }
  }

  cancel(chatId: string): void {
    this.running.get(chatId)?.abort()
  }

  /* ---------- One-shot jobs ---------- */

  async complete(
    task: CompleteTask,
    prompt: string,
    subjectId: string | null,
  ): Promise<{ text: string; provider: string; model: string | null }> {
    const system =
      task === 'title'
        ? TASK_PROMPTS.title
        : `${TASK_PROMPTS[task]}\n\n${this.studentContext(subjectId)}`
    try {
      return await this.run({
        task,
        system,
        messages: [{ role: 'user', content: prompt }],
        signal: AbortSignal.timeout(task === 'exam' ? 300_000 : 180_000),
        onText: () => undefined,
        maxTokens: task === 'title' ? 200 : undefined,
      })
    } catch (error) {
      const failure = error instanceof AiError ? error : new AiError('unknown')
      throw new AtlasError('unavailable', failure.message)
    }
  }

  /**
   * Reads a shared resource with the user's own AI and writes a short summary plus a full text
   * version (a transcription for photos, scans and handwriting). Returns null for files it cannot
   * read (video, audio) or when no AI is set up.
   */
  async digest(input: {
    path: string | null
    title: string
    description: string
    subject: string
    material: string
    body?: string
    /** Also work out the title, subject, type, units, teacher and description. */
    details?: { subjects: string[]; materials: string[] }
  }): Promise<{ summary: string; text: string; by: string; details: AiDetails | null } | null> {
    const path = input.path
    const ext = path ? extname(path).toLowerCase() : ''
    if (['.mp4', '.mov', '.m4v', '.webm', '.mp3', '.m4a', '.wav', '.aac', '.ogg'].includes(ext))
      return null
    let extracted = input.body ?? ''
    let pages = 0
    if (path && !isImageFile(path)) {
      try {
        const out = await extractText(path)
        extracted = out.text
        pages = out.pages
      } catch (error) {
        this.deps.log.warn(`digest: could not read ${ext} file: ${String(error)}`)
      }
    }
    // Photos and scanned PDFs (little text per page) need a model that can look at the page.
    const scanned =
      !!path &&
      (isImageFile(path) || (ext === '.pdf' && extracted.length < Math.max(200, pages * 80)))
    if (!scanned && extracted.trim().length < 40) return null
    const prompt = [
      `Title: ${input.title}`,
      input.description ? `Description: ${input.description}` : '',
      `Subject: ${input.subject}`,
      `Type: ${input.material}`,
      scanned
        ? 'The file is attached (a photo or scan). Transcribe all of it, handwriting included.'
        : `Text of the file:\n\n${extracted.slice(0, 120_000)}`,
    ]
      .filter(Boolean)
      .join('\n')
    try {
      const result = await this.run({
        task: 'digest',
        system: input.details
          ? DIGEST_PROMPT + DETAILS_PROMPT(input.details.subjects, input.details.materials)
          : DIGEST_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        signal: AbortSignal.timeout(300_000),
        onText: () => undefined,
        files: scanned && path ? [path] : undefined,
        prefer: scanned && path ? (id) => canSeeFiles(id, path) : undefined,
      })
      const parsed = parseDigest(result.text)
      const text = scanned ? parsed.text : parsed.text || extracted
      if (!parsed.summary) return null
      const by = providerDef(result.provider).name
      return {
        summary: parsed.summary.slice(0, 20_000),
        text: text.slice(0, 400_000),
        by,
        details: input.details ? parseDetails(result.text) : null,
      }
    } catch (error) {
      this.deps.log.warn(`digest failed: ${error instanceof AiError ? error.code : String(error)}`)
      return null
    }
  }

  /* ---------- Explainer ---------- */

  /** What the student attached, as text for the prompt plus files a vision model should see. */
  private async attachments(paths: string[]): Promise<{ text: string[]; files: string[] }> {
    const text: string[] = []
    const files: string[] = []
    for (const path of paths) {
      const name = path.split(/[\\/]/).pop() ?? 'file'
      if (isImageFile(path)) {
        files.push(path)
        continue
      }
      try {
        const out = await extractText(path)
        const scanned = extname(path).toLowerCase() === '.pdf' && out.text.length < out.pages * 80
        if (scanned) files.push(path)
        else if (out.text.trim())
          text.push(`Attached file "${name}":\n${out.text.slice(0, 40_000)}`)
      } catch (error) {
        this.deps.log.warn(`explainer: could not read an attachment: ${String(error)}`)
      }
    }
    return { text, files }
  }

  /** Questions from the student's bank, with their marks and any worked solution. */
  private questionText(ids: string[]): string[] {
    const db = this.db()
    return ids.flatMap((qid) => {
      const q = db.get('questions', qid)
      if (!q) return []
      const answer = db.list('answers', { questionId: qid }, { limit: 1 })[0]
      const where = [q['year'], q['paper'], q['number'] ? `Question ${String(q['number'])}` : null]
        .filter(Boolean)
        .join(', ')
      return [
        [
          `Question${where ? ` (${where})` : ''}${q['marks'] ? `, ${String(q['marks'])} marks` : ''}:`,
          String(q['stemMd'] ?? ''),
          answer?.['contentMd'] ? `Worked solution on file:\n${String(answer['contentMd'])}` : '',
          q['sampleMd'] ? `Examiner's sample answer:\n${String(q['sampleMd'])}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      ]
    })
  }

  /**
   * Writes a visual lesson with the user's AI, streaming it through `explainer:delta` so the
   * player can start on the first scene, then `explainer:done`.
   */
  async explain(input: {
    requestId: string
    prompt: string
    subjectId: string | null
    options: LessonOptions
    files: string[]
    questionIds: string[]
    followUp: { lesson: string; scene: number } | null
  }): Promise<void> {
    const emit = this.deps.emitLesson
    if (!emit) return
    if (this.running.has(input.requestId))
      throw new AtlasError('conflict', 'That lesson is already being written.')
    const { text: attached, files } = await this.attachments(input.files)
    const questions = this.questionText(input.questionIds)
    const sources = input.prompt.trim() ? this.retrieve(input.prompt, input.subjectId) : []
    const system = [
      input.followUp ? lessonFollowUpPrompt(input.options) : lessonSystemPrompt(input.options),
      this.studentContext(input.subjectId),
      sources.length
        ? `Pages from the student's own library that may help (their teacher's notation and methods; follow them):\n\n${sources.map((s) => `${s.title}, page ${s.page}\n${s.snippet}`).join('\n\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    const ask = [
      input.prompt.trim() ||
        (files.length || questions.length || attached.length
          ? 'Explain how to do this, step by step.'
          : ''),
      ...questions,
      ...attached,
      files.length
        ? `${files.length} image(s) of the question are attached. Read them carefully.`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n')
    if (!ask) throw new AtlasError('bad_request', 'Ask a question or attach one first.')
    const messages: ChatTurn[] = input.followUp
      ? [
          { role: 'user', content: 'Make me a lesson.' },
          { role: 'assistant', content: `\`\`\`atlas-lesson\n${input.followUp.lesson}\n\`\`\`` },
          {
            role: 'user',
            content: `I paused on scene ${input.followUp.scene + 1}. ${ask}`,
          },
        ]
      : [{ role: 'user', content: ask }]

    const controller = new AbortController()
    this.running.set(input.requestId, controller)
    let text = ''
    void this.run({
      task: 'explainer',
      system,
      messages,
      signal: controller.signal,
      files: files.length ? files : undefined,
      prefer: files.length ? (id) => files.every((f) => canSeeFiles(id, f)) : undefined,
      onText: (chunk) => {
        text += chunk
        emit({ kind: 'delta', requestId: input.requestId, text: chunk })
      },
    })
      .then((result) => ({
        text: result.text || text,
        provider: providerDef(result.provider).name,
        error: null,
      }))
      .catch((error: unknown) => {
        const failure = error instanceof AiError ? error : new AiError('unknown')
        return {
          text,
          provider: null,
          error: failure.code === 'cancelled' ? null : failure.message,
        }
      })
      .then(async (done) => {
        // Check the layout like a teacher would before showing it, and let the AI fix problems.
        const fixed =
          done.error || controller.signal.aborted
            ? null
            : await this.repairLesson(done.text, system, messages, controller.signal)
        this.running.delete(input.requestId)
        emit({ kind: 'done', requestId: input.requestId, ...done, text: fixed ?? done.text })
      })
  }

  /**
   * Measures a finished lesson (overlapping boxes, words too long for their box, things off the
   * board) and, if anything is wrong, asks the AI once to send it back corrected. Returns the
   * corrected answer only when it really has fewer problems.
   */
  private async repairLesson(
    text: string,
    system: string,
    messages: ChatTurn[],
    signal: AbortSignal,
  ): Promise<string | null> {
    const lesson = parseLesson(text)
    if (!lesson) return null
    const issues = auditLesson(lesson)
    if (issues.length === 0) return null
    try {
      const result = await this.run({
        task: 'explainer',
        system,
        messages: [
          ...messages,
          { role: 'assistant', content: text },
          {
            role: 'user',
            content: `Atlas measured the board and found layout problems:\n${issues.map((i) => `- ${i}`).join('\n')}\n\nSend the whole lesson again in one atlas-lesson block with only these fixed. Keep the narration and everything else the same.`,
          },
        ],
        signal,
        onText: () => undefined,
      })
      const again = parseLesson(result.text)
      if (!again || again.scenes.length < lesson.scenes.length * 0.6) return null
      return auditLesson(again).length < issues.length ? result.text : null
    } catch (error) {
      this.deps.log.warn(`lesson repair skipped: ${String(error)}`)
      return null
    }
  }

  async test(provider: ProviderId): Promise<{ ok: boolean; message: string }> {
    const ctx = this.ctx(provider)
    try {
      const model = await resolveModel(provider, this.config().models[provider] ?? null, ctx)
      const result = await streamFrom(
        provider,
        {
          system: 'You are a connection test. Follow the instruction exactly.',
          messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
          model,
          signal: AbortSignal.timeout(60_000),
          onText: () => undefined,
          maxTokens: 2000,
        },
        ctx,
      )
      this.bumpUsage(provider)
      return {
        ok: true,
        message: `Working${result.model ? ` (${result.model})` : ''}. It replied: ${result.text.trim().slice(0, 40)}`,
      }
    } catch (error) {
      return {
        ok: false,
        message: (error instanceof AiError ? error : new AiError('unknown')).message,
      }
    }
  }
}

/** Reads the "## Details" JSON line the AI adds when it fills in a shared item's details. */
export function parseDetails(answer: string): AiDetails | null {
  const part = /##\s*Details\s*\n([\s\S]*)$/i.exec(answer)?.[1] ?? ''
  const start = part.indexOf('{')
  const end = part.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(part.slice(start, end + 1)) as Record<string, unknown>
    const str = (v: unknown, max: number): string =>
      typeof v === 'string' ? v.trim().slice(0, max) : ''
    return {
      title: str(raw['title'], 140),
      subject: str(raw['subject'], 80),
      material: str(raw['material'], 20),
      units: Array.isArray(raw['units'])
        ? [...new Set(raw['units'].map(Number).filter((n) => [1, 2, 3, 4].includes(n)))]
        : [],
      teacher: str(raw['teacher'], 80),
      description: str(raw['description'], 600),
    }
  } catch {
    return null
  }
}

/** Splits a digest answer into its "## Summary" and "## Text" parts. */
export function parseDigest(answer: string): { summary: string; text: string } {
  const summary = /##\s*Summary\s*\n([\s\S]*?)(?=\n##\s*Text\b|$)/i.exec(answer)?.[1]?.trim() ?? ''
  const text = /##\s*Text\s*\n([\s\S]*?)(?=\n##\s*Details\b|$)/i.exec(answer)?.[1]?.trim() ?? ''
  return { summary: summary || (text ? '' : answer.trim()), text }
}

import { z } from 'zod'
import type { IpcEvent } from './ipc-channels'
import {
  AgentInfoSchema,
  AiConfigSchema,
  BackupInfoSchema,
  ChatMessageSchema,
  ENTITY_NAMES,
  PageTextSchema,
  ProfileMetaPatchSchema,
  ProfileMetaSchema,
  ProfileSummarySchema,
  ProviderIdSchema,
  ProviderStatusSchema,
  SearchHitSchema,
  SOURCE_KINDS,
  StatsSchema,
} from './models'

export type { IpcEvent } from './ipc-channels'
export { IPC_EVENTS } from './ipc-channels'

/* ---------- Shared value schemas ---------- */

export const ThemeSchema = z.enum(['system', 'light', 'dark'])
export type Theme = z.infer<typeof ThemeSchema>

export const PlatformSchema = z.enum(['darwin', 'win32', 'linux'])
export type Platform = z.infer<typeof PlatformSchema>

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  platform: PlatformSchema,
  arch: z.string(),
  electron: z.string(),
  chrome: z.string(),
  node: z.string(),
  isPackaged: z.boolean(),
  systemDark: z.boolean(),
})
export type AppInfo = z.infer<typeof AppInfoSchema>

/** App-level preferences: the few things needed before a profile is unlocked. */
export const PrefsSchema = z.object({
  theme: ThemeSchema.default('system'),
  sidebarCollapsed: z.boolean().default(false),
  lastProfileId: z.string().nullable().default(null),
})
export type Prefs = z.infer<typeof PrefsSchema>

export const PrefsPatchSchema = z
  .object({
    theme: ThemeSchema,
    sidebarCollapsed: z.boolean(),
    lastProfileId: z.string().nullable(),
  })
  .partial()
  .strict()
export type PrefsPatch = z.infer<typeof PrefsPatchSchema>

export const RendererErrorSchema = z.object({
  scope: z.string().max(120),
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
})

export const CalendarStatusSchema = z.object({
  connected: z.boolean(),
  lastSyncedAt: z.number().nullable(),
  events: z.number(),
  error: z.string().nullable(),
})
export type CalendarStatus = z.infer<typeof CalendarStatusSchema>

const id = z.string().min(1).max(64)
const entity = z.enum(ENTITY_NAMES)
const row = z.record(z.string(), z.unknown())
const none = z.void()

/* ---------- Contract ---------- */

interface ChannelSpec {
  request: z.ZodType
  response: z.ZodType
}

/**
 * Every renderer → main call. The main process validates both directions against these schemas,
 * so a channel cannot exist without one.
 */
export const ipcContract = {
  'app:info': { request: none, response: AppInfoSchema },
  'prefs:get': { request: none, response: PrefsSchema },
  'prefs:set': { request: PrefsPatchSchema, response: PrefsSchema },
  'shell:openExternal': { request: z.object({ url: z.url() }), response: none },
  'log:rendererError': { request: RendererErrorSchema, response: none },

  // Profiles and backups
  'profile:list': { request: none, response: z.array(ProfileSummarySchema) },
  'profile:create': {
    request: z.object({
      name: z.string().min(1).max(80),
      password: z.string().max(200).optional(),
    }),
    response: ProfileSummarySchema,
  },
  'profile:unlock': {
    request: z.object({ id, password: z.string().max(200).optional() }),
    response: ProfileSummarySchema,
  },
  'profile:lock': { request: none, response: none },
  'profile:meta': { request: none, response: ProfileMetaSchema.nullable() },
  'profile:updateMeta': { request: ProfileMetaPatchSchema, response: ProfileMetaSchema },
  'profile:exportAll': { request: none, response: z.object({ path: z.string() }).nullable() },
  'backup:list': { request: none, response: z.array(BackupInfoSchema) },
  'backup:create': { request: none, response: z.array(BackupInfoSchema) },
  'backup:restore': { request: z.object({ file: z.string().max(200) }), response: none },

  // Generic, schema-checked data access
  'db:list': {
    request: z.object({
      entity,
      where: row.optional(),
      orderBy: z.string().max(40).optional(),
      desc: z.boolean().optional(),
      limit: z.number().int().min(1).max(5000).optional(),
    }),
    response: z.array(row),
  },
  'db:get': { request: z.object({ entity, id }), response: row.nullable() },
  'db:create': { request: z.object({ entity, values: row }), response: row },
  'db:update': { request: z.object({ entity, id, patch: row }), response: row },
  'db:remove': { request: z.object({ entity, id }), response: none },
  'settings:get': { request: z.object({ key: z.string().max(80) }), response: z.unknown() },
  'settings:set': {
    request: z.object({ key: z.string().max(80), value: z.unknown() }),
    response: none,
  },
  'stats:summary': { request: none, response: StatsSchema },

  // Library
  'library:pickAndImport': {
    request: z.object({ subjectId: id.nullable(), kind: z.enum(SOURCE_KINDS).optional() }),
    response: z.array(row),
  },
  'library:importPaths': {
    request: z.object({
      subjectId: id.nullable(),
      paths: z.array(z.string().max(4000)).min(1).max(500),
      kind: z.enum(SOURCE_KINDS).optional(),
    }),
    response: z.array(row),
  },
  'library:fileBytes': { request: z.object({ sourceId: id }), response: z.instanceof(Uint8Array) },
  'library:savePages': {
    request: z.object({ sourceId: id, pages: z.array(PageTextSchema).max(5000) }),
    response: none,
  },
  'library:setStatus': {
    request: z.object({
      sourceId: id,
      status: z.enum(['queued', 'extracting', 'ready', 'error']),
      error: z.string().max(500).optional(),
    }),
    response: none,
  },
  'library:pages': { request: z.object({ sourceId: id }), response: z.array(PageTextSchema) },
  'library:remove': { request: z.object({ sourceId: id }), response: none },
  'search:query': {
    request: z.object({
      query: z.string().max(300),
      subjectId: id.nullable().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    response: z.array(SearchHitSchema),
  },

  // AI
  'ai:status': { request: none, response: z.array(ProviderStatusSchema) },
  'ai:agents': { request: none, response: z.array(AgentInfoSchema) },
  'ai:config': { request: none, response: AiConfigSchema },
  'ai:setConfig': { request: AiConfigSchema.partial(), response: AiConfigSchema },
  'ai:setKey': {
    request: z.object({ provider: ProviderIdSchema, key: z.string().min(8).max(400) }),
    response: none,
  },
  'ai:clearKey': { request: z.object({ provider: ProviderIdSchema }), response: none },
  'ai:models': { request: z.object({ provider: ProviderIdSchema }), response: z.array(z.string()) },
  'ai:test': {
    request: z.object({ provider: ProviderIdSchema }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
  },
  'ai:login': { request: z.object({ provider: ProviderIdSchema }), response: none },
  'ai:messages': { request: z.object({ chatId: id }), response: z.array(ChatMessageSchema) },
  'ai:send': {
    request: z.object({ chatId: id, content: z.string().min(1).max(100_000) }),
    response: z.object({ user: ChatMessageSchema, assistant: ChatMessageSchema }),
  },
  'ai:cancel': { request: z.object({ chatId: id }), response: none },
  'ai:complete': {
    request: z.object({
      task: z.enum(['flashcards', 'summary', 'exam', 'plan', 'quiz', 'topics', 'title']),
      prompt: z.string().min(1).max(400_000),
      subjectId: id.nullable().optional(),
    }),
    response: z.object({ text: z.string(), provider: z.string(), model: z.string().nullable() }),
  },

  // School calendar (iCal subscription link, read-only)
  'calendar:status': { request: none, response: CalendarStatusSchema },
  'calendar:connect': {
    request: z.object({ url: z.string().min(8).max(2000) }),
    response: CalendarStatusSchema,
  },
  'calendar:sync': { request: none, response: CalendarStatusSchema },
  'calendar:disconnect': { request: none, response: CalendarStatusSchema },

  // Exam builder
  'exam:exportPdf': {
    request: z.object({ examId: id, variant: z.enum(['paper', 'solutions']) }),
    response: z.object({ path: z.string() }).nullable(),
  },
} as const satisfies Record<string, ChannelSpec>

export type IpcChannel = keyof typeof ipcContract

/** Every main → renderer push event. */
export const ipcEvents = {
  'prefs:changed': PrefsSchema,
  'theme:systemChanged': z.object({ dark: z.boolean() }),
  'profile:changed': z.object({ activeId: z.string().nullable() }),
  'ai:delta': z.object({ chatId: z.string(), messageId: z.string(), text: z.string() }),
  'ai:finished': z.object({ chatId: z.string(), message: ChatMessageSchema }),
  'library:changed': z.object({ sourceId: z.string().nullable() }),
  'calendar:changed': z.object({ at: z.number() }),
} as const satisfies Record<IpcEvent, z.ZodType>

export type IpcRequest<C extends IpcChannel> = z.input<(typeof ipcContract)[C]['request']>
export type IpcResponse<C extends IpcChannel> = z.output<(typeof ipcContract)[C]['response']>
export type IpcEventPayload<E extends IpcEvent> = z.output<(typeof ipcEvents)[E]>

/** Channels whose request is `void` take no argument; the rest require one. */
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- matching zod's `z.void()` input type
export type IpcArgs<C extends IpcChannel> = [IpcRequest<C>] extends [void]
  ? []
  : [payload: IpcRequest<C>]

/* ---------- Result envelope ---------- */

export const IPC_ERROR_CODES = [
  'bad_request',
  'bad_response',
  'forbidden',
  'not_found',
  'conflict',
  'unavailable',
  'internal',
] as const
export type IpcErrorCode = (typeof IPC_ERROR_CODES)[number]

export interface IpcError {
  code: IpcErrorCode
  /** Short, human, and safe to show: what happened and what to do next. */
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

/** The object the preload exposes as `window.atlas`. */
export interface AtlasBridge {
  readonly platform: Platform
  invoke<C extends IpcChannel>(channel: C, ...args: IpcArgs<C>): Promise<IpcResult<IpcResponse<C>>>
  on<E extends IpcEvent>(event: E, listener: (payload: IpcEventPayload<E>) => void): () => void
  /** The real path of a file the user dropped or picked (the sandbox hides it otherwise). */
  pathForFile(file: File): string
}

import { z } from 'zod'
import type { IpcChannel, IpcEvent } from './ipc-channels'

export type { IpcChannel, IpcEvent } from './ipc-channels'
export { IPC_CHANNELS, IPC_EVENTS } from './ipc-channels'

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
})
export type Prefs = z.infer<typeof PrefsSchema>

export const PrefsPatchSchema = z
  .object({
    theme: ThemeSchema,
    sidebarCollapsed: z.boolean(),
  })
  .partial()
  .strict()
export type PrefsPatch = z.infer<typeof PrefsPatchSchema>

export const RendererErrorSchema = z.object({
  scope: z.string().max(120),
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
})

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
  'app:info': { request: z.void(), response: AppInfoSchema },
  'prefs:get': { request: z.void(), response: PrefsSchema },
  'prefs:set': { request: PrefsPatchSchema, response: PrefsSchema },
  'shell:openExternal': { request: z.object({ url: z.url() }), response: z.void() },
  'log:rendererError': { request: RendererErrorSchema, response: z.void() },
} as const satisfies Record<IpcChannel, ChannelSpec>

/** Every main → renderer push event. */
export const ipcEvents = {
  'prefs:changed': PrefsSchema,
  'theme:systemChanged': z.object({ dark: z.boolean() }),
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
}

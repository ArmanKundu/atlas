/**
 * Channel and event names, with no dependencies.
 *
 * The preload script imports only this file, so the sandboxed preload bundle stays free of zod.
 * `src/shared/ipc.ts` attaches a schema to every name listed here and fails to compile if one
 * is missing.
 */
export const IPC_CHANNELS = [
  'app:info',
  'prefs:get',
  'prefs:set',
  'shell:openExternal',
  'log:rendererError',
] as const

export const IPC_EVENTS = ['prefs:changed', 'theme:systemChanged'] as const

export type IpcChannel = (typeof IPC_CHANNELS)[number]
export type IpcEvent = (typeof IPC_EVENTS)[number]

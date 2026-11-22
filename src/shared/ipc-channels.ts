/**
 * Push-event names, with no dependencies, so the sandboxed preload can import them without
 * pulling zod into its bundle. `src/shared/ipc.ts` attaches a schema to every name and fails to
 * compile if one is missing.
 *
 * Request channels are not listed here: the main process is the single authority. Only channels
 * in the contract have a handler, and every payload is validated there.
 */
export const IPC_EVENTS = [
  'prefs:changed',
  'theme:systemChanged',
  'profile:changed',
  'ai:delta',
  'ai:finished',
  'library:changed',
  'calendar:changed',
  'update:changed',
  'models:progress',
  'scanner:received',
  'scanner:progress',
] as const

export type IpcEvent = (typeof IPC_EVENTS)[number]

/** Shape every request channel name must have, e.g. `library:importPaths`. */
export const CHANNEL_PATTERN = /^[a-z]{2,16}:[a-zA-Z]{2,32}$/

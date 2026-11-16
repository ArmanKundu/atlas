import type {
  AtlasBridge,
  IpcArgs,
  IpcChannel,
  IpcError,
  IpcErrorCode,
  IpcEvent,
  IpcEventPayload,
  IpcResponse,
} from '@shared/ipc'

declare global {
  interface Window {
    atlas: AtlasBridge
  }
}

/** A failed call to the main process. `message` is already written for the user. */
export class IpcCallError extends Error {
  readonly code: IpcErrorCode

  constructor(error: IpcError) {
    super(error.message)
    this.name = 'IpcCallError'
    this.code = error.code
  }
}

/** Calls the main process and returns the data, or throws an `IpcCallError`. */
export async function call<C extends IpcChannel>(
  channel: C,
  ...args: IpcArgs<C>
): Promise<IpcResponse<C>> {
  const result = await window.atlas.invoke(channel, ...args)
  if (!result.ok) throw new IpcCallError(result.error)
  return result.data
}

/** Subscribes to a push event from the main process. Returns the unsubscribe function. */
export function subscribe<E extends IpcEvent>(
  event: E,
  listener: (payload: IpcEventPayload<E>) => void,
): () => void {
  return window.atlas.on(event, listener)
}

export function platform(): AtlasBridge['platform'] {
  return window.atlas.platform
}

/** Text to show when something fails: the user-ready message if there is one. */
export function errorMessage(error: unknown): string {
  if (error instanceof IpcCallError) return error.message
  return 'Something went wrong. Try again.'
}

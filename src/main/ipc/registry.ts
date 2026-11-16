import { AtlasError } from '@shared/errors'
import {
  ipcContract,
  type IpcChannel,
  type IpcRequest,
  type IpcResponse,
  type IpcResult,
} from '@shared/ipc'

export type IpcHandler<C extends IpcChannel> = (
  request: IpcRequest<C>,
) => IpcResponse<C> | Promise<IpcResponse<C>>

export interface IpcLogger {
  warn(message: string, detail?: unknown): void
  error(message: string, detail?: unknown): void
}

/**
 * Runs one handler behind the contract: validates the request, calls the handler, validates the
 * response, and turns every failure into a result envelope. Never throws.
 */
export async function runHandler<C extends IpcChannel>(
  channel: C,
  handler: IpcHandler<C>,
  rawRequest: unknown,
  log: IpcLogger,
): Promise<IpcResult<IpcResponse<C>>> {
  const spec = ipcContract[channel]

  const request = spec.request.safeParse(rawRequest)
  if (!request.success) {
    log.warn(`ipc ${channel}: request rejected`, request.error.issues)
    return {
      ok: false,
      error: { code: 'bad_request', message: 'That request was not valid. Try again.' },
    }
  }

  let output: unknown
  try {
    output = await handler(request.data as IpcRequest<C>)
  } catch (error) {
    if (error instanceof AtlasError) {
      return { ok: false, error: { code: error.code, message: error.message } }
    }
    log.error(`ipc ${channel}: handler failed`, error)
    return {
      ok: false,
      error: {
        code: 'internal',
        message: 'Something went wrong inside Atlas. Try again, or restart the app.',
      },
    }
  }

  const response = spec.response.safeParse(output)
  if (!response.success) {
    log.error(`ipc ${channel}: response rejected`, response.error.issues)
    return {
      ok: false,
      error: {
        code: 'bad_response',
        message: 'Atlas produced an unexpected result. Try again, or restart the app.',
      },
    }
  }

  return { ok: true, data: response.data as IpcResponse<C> }
}

/** The slice of Electron's `ipcMain` the registry needs; lets tests pass a fake. */
export interface IpcMainLike<E> {
  handle(channel: string, listener: (event: E, payload: unknown) => Promise<unknown>): void
  removeHandler(channel: string): void
}

export interface IpcRegistry {
  handle<C extends IpcChannel>(channel: C, handler: IpcHandler<C>): void
  /** Channels in the contract that have no handler yet. Empty once the app is fully wired. */
  missing(): IpcChannel[]
  dispose(): void
}

export function createIpcRegistry<E>(options: {
  ipcMain: IpcMainLike<E>
  /** Only the app's own page may call in. */
  isTrustedSender: (event: E) => boolean
  log: IpcLogger
}): IpcRegistry {
  const { ipcMain, isTrustedSender, log } = options
  const registered = new Set<IpcChannel>()

  return {
    handle(channel, handler) {
      if (registered.has(channel)) {
        throw new Error(`IPC channel "${channel}" already has a handler`)
      }
      registered.add(channel)
      ipcMain.handle(channel, async (event, payload) => {
        if (!isTrustedSender(event)) {
          log.warn(`ipc ${channel}: blocked an untrusted sender`)
          const blocked: IpcResult<never> = {
            ok: false,
            error: { code: 'forbidden', message: 'That action is not allowed from this page.' },
          }
          return blocked
        }
        return runHandler(channel, handler, payload, log)
      })
    },
    missing() {
      return (Object.keys(ipcContract) as IpcChannel[]).filter((c) => !registered.has(c))
    },
    dispose() {
      for (const channel of registered) ipcMain.removeHandler(channel)
      registered.clear()
    },
  }
}

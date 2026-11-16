import type { IpcErrorCode } from './ipc'

/**
 * An error that is safe to show to the user. Anything else thrown inside a handler is reported
 * as a generic `internal` error and the details go to the local log only.
 */
export class AtlasError extends Error {
  readonly code: IpcErrorCode

  constructor(code: IpcErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AtlasError'
    this.code = code
  }
}

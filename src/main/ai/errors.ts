import type { AiErrorCode } from '@shared/models'

const NEXT_STEP: Record<AiErrorCode, string> = {
  ai_unavailable: 'No AI is connected. Connect one in Settings → AI.',
  not_installed:
    'That provider is not installed on this computer. Open Settings → AI for the install steps.',
  not_signed_in:
    'That provider is not signed in, or the key was not accepted. Check it in Settings → AI.',
  usage_limit:
    'That provider has reached its usage limit. It will work again when the limit resets, or switch to another provider in Settings → AI.',
  network: 'The provider could not be reached. Check your internet connection and try again.',
  bad_output: 'The provider sent back something Atlas could not read. Try again.',
  unsupported: 'That provider cannot do this. Choose another one in Settings → AI.',
  cancelled: 'Stopped.',
  refused: 'The model declined to answer this. Try rephrasing the question.',
  unknown: 'The provider returned an error. Try again.',
}

/** A failed AI call with a typed reason and a message that is safe to show. */
export class AiError extends Error {
  readonly code: AiErrorCode

  constructor(code: AiErrorCode, detail?: string) {
    super(detail ? `${NEXT_STEP[code]} (${detail.slice(0, 240)})` : NEXT_STEP[code])
    this.name = 'AiError'
    this.code = code
  }
}

/** Errors where the next connected provider should be tried instead. */
export function shouldFallThrough(code: AiErrorCode): boolean {
  return (
    code === 'usage_limit' ||
    code === 'not_signed_in' ||
    code === 'not_installed' ||
    code === 'network'
  )
}

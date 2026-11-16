/**
 * Gemini CLI flags (signed in with the user's Google account), in one place.
 * NOTE: written from the documented non-interactive mode; not yet run against a real install.
 */
export const BINARY = 'gemini'
export const INSTALL_HINT = 'npm install -g @google/gemini-cli'
export const LOGIN_COMMAND = 'gemini'

/** The prompt is sent on stdin; `--prompt ''` switches the CLI to non-interactive mode. */
export function buildArgs(options: { model?: string | null }): string[] {
  return [...(options.model ? ['--model', options.model] : []), '--prompt', '']
}

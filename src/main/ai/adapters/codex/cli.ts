/**
 * OpenAI Codex CLI flags (signed in with the user's ChatGPT account), in one place.
 * NOTE: written from the documented `codex exec` interface; not yet run against a real install.
 */
export const BINARY = 'codex'
export const INSTALL_HINT = 'npm install -g @openai/codex'
export const LOGIN_COMMAND = 'codex login'

export function buildArgs(options: { model?: string | null; images?: string[] }): string[] {
  const images = options.images ?? []
  return [
    'exec',
    '--json',
    '--sandbox',
    'read-only',
    '--skip-git-repo-check',
    ...(options.model ? ['--model', options.model] : []),
    ...(images.length ? ['--image', images.join(','), '--'] : []),
    '-', // read the prompt from stdin
  ]
}

/** Pulls assistant text out of one JSONL event, across the event shapes Codex has used. */
export function parseLine(line: string): { text?: string } {
  let data: unknown
  try {
    data = JSON.parse(line)
  } catch {
    return {}
  }
  if (!data || typeof data !== 'object') return {}
  const event = data as Record<string, unknown>
  const item = (event['item'] ?? event['msg']) as Record<string, unknown> | undefined
  if (event['type'] === 'item.completed' && item?.['type'] === 'agent_message') {
    return { text: String(item['text'] ?? '') }
  }
  if (item?.['type'] === 'agent_message' && typeof item['message'] === 'string') {
    return { text: item['message'] }
  }
  return {}
}

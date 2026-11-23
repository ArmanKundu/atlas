/**
 * Claude Code CLI flags, in one place so they are easy to fix when the CLI changes.
 * Checked against `claude --help` (Claude Code 2.x, November 2026).
 */
export const BINARY = 'claude'
export const INSTALL_HINT = 'npm install -g @anthropic-ai/claude-code'
export const LOGIN_COMMAND = 'claude /login'

export function buildArgs(options: {
  system: string
  model?: string | null
  /** Files it may read (with the Read tool only, inside their folders). */
  files?: string[]
}): string[] {
  const files = options.files ?? []
  const dirs = [...new Set(files.map((f) => f.slice(0, Math.max(1, f.lastIndexOf('/')))))]
  return [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--no-session-persistence',
    // Plain question answering: no tools, and no settings from the folder it runs in.
    ...(files.length
      ? ['--tools', 'Read', '--allowedTools', 'Read', ...dirs.flatMap((d) => ['--add-dir', d])]
      : ['--tools', '']),
    '--setting-sources',
    'project',
    '--system-prompt',
    options.system,
    ...(options.model ? ['--model', options.model] : []),
  ]
}

export interface ParsedLine {
  text?: string
  final?: { ok: boolean; text: string }
}

/** Reads one line of `stream-json` output. */
export function parseLine(line: string): ParsedLine {
  let data: unknown
  try {
    data = JSON.parse(line)
  } catch {
    return {}
  }
  if (!data || typeof data !== 'object') return {}
  const event = data as Record<string, unknown>

  if (event['type'] === 'stream_event') {
    const inner = event['event'] as Record<string, unknown> | undefined
    const delta = inner?.['delta'] as Record<string, unknown> | undefined
    if (inner?.['type'] === 'content_block_delta' && delta?.['type'] === 'text_delta') {
      return { text: String(delta['text'] ?? '') }
    }
    return {}
  }
  if (event['type'] === 'result') {
    return { final: { ok: event['is_error'] !== true, text: String(event['result'] ?? '') } }
  }
  return {}
}

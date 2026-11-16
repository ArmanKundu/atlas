import { spawn } from 'node:child_process'
import { accessSync, constants, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { AiError } from '../errors'

/**
 * Shared plumbing for the official command-line tools (Claude Code, Codex, Gemini CLI).
 *
 * Atlas only ever starts the provider's own binary. It runs in an empty temp folder with a
 * minimal environment, and Atlas never opens, copies or logs the provider's config or
 * credential files: sign-in is entirely the tool's own business.
 */

/** Desktop apps start with a short PATH, so the usual install locations are added. */
export function searchPath(): string {
  const home = homedir()
  const extra =
    process.platform === 'win32'
      ? [
          join(home, 'AppData', 'Roaming', 'npm'),
          join(home, '.local', 'bin'),
          join(home, 'AppData', 'Local', 'Programs'),
        ]
      : [
          join(home, '.local', 'bin'),
          '/opt/homebrew/bin',
          '/usr/local/bin',
          join(home, '.npm-global', 'bin'),
          join(home, '.bun', 'bin'),
          join(home, '.volta', 'bin'),
          join(home, 'bin'),
          '/usr/bin',
          '/bin',
        ]
  return [...new Set([...(process.env['PATH'] ?? '').split(delimiter), ...extra])]
    .filter(Boolean)
    .join(delimiter)
}

export function findBinary(name: string): string | null {
  const names = process.platform === 'win32' ? [`${name}.cmd`, `${name}.exe`, name] : [name]
  for (const dir of searchPath().split(delimiter)) {
    for (const candidate of names) {
      const full = join(dir, candidate)
      try {
        accessSync(full, constants.X_OK)
        return full
      } catch {
        // keep looking
      }
    }
  }
  return null
}

/** Only what a CLI needs to find itself and its own sign-in. No API keys are passed through. */
export function minimalEnv(): NodeJS.ProcessEnv {
  const keep = [
    'HOME',
    'USER',
    'LOGNAME',
    'LANG',
    'LC_ALL',
    'SHELL',
    'TMPDIR',
    'TERM',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'SystemRoot',
    'ComSpec',
    'PATHEXT',
    'HOMEDRIVE',
    'HOMEPATH',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
  ]
  const env: NodeJS.ProcessEnv = { PATH: searchPath(), NO_COLOR: '1' }
  for (const key of keep) {
    const value = process.env[key]
    if (value) env[key] = value
  }
  return env
}

export interface CliRun {
  binary: string
  args: string[]
  stdin?: string
  signal: AbortSignal
  timeoutMs?: number
  /** Called with each complete line of stdout. */
  onLine?: (line: string) => void
  /** Called with raw stdout chunks (for tools that print plain text). */
  onChunk?: (chunk: string) => void
}

export interface CliResult {
  code: number | null
  stdout: string
  stderr: string
}

export function runCli(run: CliRun): Promise<CliResult> {
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-ai-'))
  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(run.binary, run.args, {
      cwd,
      env: minimalEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && run.binary.endsWith('.cmd'),
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    let pending = ''
    let settled = false

    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      run.signal.removeEventListener('abort', onAbort)
      rmSync(cwd, { recursive: true, force: true })
      fn()
    }
    const onAbort = (): void => {
      child.kill()
      finish(() => reject(new AiError('cancelled')))
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(() => reject(new AiError('network', 'timed out')))
    }, run.timeoutMs ?? 180_000)
    if (run.signal.aborted) onAbort()
    else run.signal.addEventListener('abort', onAbort, { once: true })

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      run.onChunk?.(chunk)
      if (!run.onLine) return
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) run.onLine(line)
    })
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-8000)
    })
    child.on('error', () => finish(() => reject(new AiError('not_installed'))))
    child.on('close', (code) => {
      if (pending.trim()) run.onLine?.(pending)
      finish(() => resolve({ code, stdout, stderr }))
    })
    child.stdin.on('error', () => undefined)
    child.stdin.end(run.stdin ?? '')
  })
}

/** Maps a CLI's error output to a typed reason. */
export function classifyCliFailure(output: string): AiError {
  const text = output.toLowerCase()
  if (/usage limit|rate limit|quota|limit reached|too many requests|429/.test(text))
    return new AiError('usage_limit')
  if (
    /not logged in|log ?in|sign ?in|unauthorized|authentication|credentials|api key|401|403/.test(
      text,
    )
  )
    return new AiError('not_signed_in')
  if (/network|enotfound|econn|timed out|offline|fetch failed/.test(text))
    return new AiError('network')
  return new AiError('unknown', output.trim().split('\n').slice(-2).join(' '))
}

export async function cliVersion(binary: string): Promise<string> {
  try {
    const result = await runCli({
      binary,
      args: ['--version'],
      signal: AbortSignal.timeout(6000),
      timeoutMs: 6000,
    })
    return (result.stdout || result.stderr).trim().split('\n')[0]?.slice(0, 60) ?? ''
  } catch {
    return ''
  }
}

/** One prompt for tools that take a single text input: system text, then the conversation. */
export function flattenConversation(
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): string {
  const turns = messages.map((m) => `${m.role === 'user' ? 'Student' : 'Assistant'}: ${m.content}`)
  const last = turns.pop() ?? ''
  const history = turns.length ? `Conversation so far:\n\n${turns.join('\n\n')}\n\n` : ''
  return `${system}\n\n---\n\n${history}${last}\n\nReply as the assistant to the student's last message.`
}

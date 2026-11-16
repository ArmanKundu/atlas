import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export type LogLevel = 'info' | 'warn' | 'error'

export interface Logger {
  info(message: string, detail?: unknown): void
  warn(message: string, detail?: unknown): void
  error(message: string, detail?: unknown): void
}

const MAX_BYTES = 1024 * 1024
const KEEP_FILES = 5

/**
 * Local log in `userData/logs`, rotated by size. It records what the app did and what failed,
 * never study content, file contents, prompts, answers or secrets.
 */
export function createFileLogger(
  dir: string,
  options: { echo?: boolean; maxBytes?: number } = {},
): Logger {
  const maxBytes = options.maxBytes ?? MAX_BYTES
  const file = join(dir, 'atlas.log')
  let ready = false

  function ensureDir(): void {
    if (ready) return
    mkdirSync(dir, { recursive: true })
    ready = true
  }

  function rotate(): void {
    let size: number
    try {
      size = statSync(file).size
    } catch {
      return
    }
    if (size < maxBytes) return

    const oldest = join(dir, `atlas.${KEEP_FILES - 1}.log`)
    if (existsSync(oldest)) unlinkSync(oldest)
    for (let i = KEEP_FILES - 2; i >= 1; i--) {
      const from = join(dir, `atlas.${i}.log`)
      if (existsSync(from)) renameSync(from, join(dir, `atlas.${i + 1}.log`))
    }
    renameSync(file, join(dir, 'atlas.1.log'))
  }

  function write(level: LogLevel, message: string, detail?: unknown): void {
    const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}${formatDetail(detail)}\n`
    if (options.echo) {
      const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
      sink(line.trimEnd())
    }
    try {
      ensureDir()
      rotate()
      appendFileSync(file, line, 'utf8')
    } catch {
      // Logging must never take the app down.
    }
  }

  return {
    info: (message, detail) => write('info', message, detail),
    warn: (message, detail) => write('warn', message, detail),
    error: (message, detail) => write('error', message, detail),
  }
}

export function formatDetail(detail: unknown): string {
  if (detail === undefined) return ''
  if (detail instanceof Error) {
    return ` | ${detail.name}: ${detail.message}${detail.stack ? `\n${detail.stack}` : ''}`
  }
  if (typeof detail === 'string') return ` | ${detail}`
  try {
    return ` | ${JSON.stringify(detail)}`
  } catch {
    return ' | [unserialisable detail]'
  }
}

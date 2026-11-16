import { mkdir, readFile, rename, writeFile, copyFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { PrefsSchema, type Prefs, type PrefsPatch } from '@shared/ipc'

/**
 * App-level preferences in a small JSON file (DECISIONS.md D-008).
 *
 * - Reads never throw: a missing or damaged file falls back to defaults, and a damaged file is
 *   kept beside the original as `<name>.corrupt` so nothing is silently discarded.
 * - Writes are atomic (temp file + rename) and serialised, so a crash cannot leave a half-written
 *   file and two quick changes cannot interleave.
 */
export class PrefsStore {
  private current: Prefs = PrefsSchema.parse({})
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async load(): Promise<Prefs> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch {
      return this.current
    }

    try {
      const parsed = PrefsSchema.safeParse(JSON.parse(raw))
      if (parsed.success) {
        this.current = parsed.data
        return this.current
      }
    } catch {
      // Not JSON; handled below.
    }

    await copyFile(this.filePath, `${this.filePath}.corrupt`).catch(() => undefined)
    return this.current
  }

  get(): Prefs {
    return this.current
  }

  async set(patch: PrefsPatch): Promise<Prefs> {
    this.current = PrefsSchema.parse({ ...this.current, ...patch })
    const snapshot = JSON.stringify(this.current, null, 2)
    this.queue = this.queue.then(() => this.write(snapshot)).catch(() => undefined)
    await this.queue
    return this.current
  }

  private async write(contents: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const temp = `${this.filePath}.${process.pid}.tmp`
    await writeFile(temp, contents, 'utf8')
    await rename(temp, this.filePath)
  }
}

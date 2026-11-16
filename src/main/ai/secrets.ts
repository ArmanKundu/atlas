import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { safeStorage } from 'electron'
import { AtlasError } from '@shared/errors'

/**
 * API keys and other secrets, encrypted with the operating system keychain through Electron
 * `safeStorage`. Only ciphertext is written to disk, in its own file: never in SQLite, logs,
 * exports or packs. Values are never returned to the renderer.
 */
export class SecretStore {
  constructor(private readonly file: string) {}

  private read(): Record<string, string> {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.file, 'utf8'))
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
    } catch {
      return {}
    }
  }

  private write(all: Record<string, string>): void {
    const temp = `${this.file}.tmp`
    writeFileSync(temp, JSON.stringify(all), { encoding: 'utf8', mode: 0o600 })
    renameSync(temp, this.file)
  }

  private requireKeychain(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new AtlasError(
        'unavailable',
        "This computer's keychain is not available, so Atlas cannot store the key safely.",
      )
    }
  }

  has(name: string): boolean {
    return Boolean(this.read()[name])
  }

  get(name: string): string | null {
    const stored = this.read()[name]
    if (!stored) return null
    try {
      this.requireKeychain()
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch {
      return null
    }
  }

  set(name: string, value: string): void {
    this.requireKeychain()
    this.write({ ...this.read(), [name]: safeStorage.encryptString(value).toString('base64') })
  }

  delete(name: string): void {
    const { [name]: _removed, ...rest } = this.read()
    this.write(rest)
  }
}

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  cpSync,
} from 'node:fs'
import { join } from 'node:path'
import { AtlasError } from '@shared/errors'
import type { BackupInfo, ProfileSummary } from '@shared/models'
import { Database, newId } from './db/database'
import type { Logger } from './log'

interface ProfileRecord {
  id: string
  name: string
  createdAt: number
  salt?: string
  hash?: string
}

const KEEP_DAILY = 14
const KEEP_OTHER = 6

function hashPassword(password: string, salt: string): string {
  return scryptSync(password.normalize('NFKC'), Buffer.from(salt, 'hex'), 32, {
    N: 2 ** 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString('hex')
}

function stamp(date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
}

/**
 * Profiles: one folder and one database per person, under `userData/profiles/<id>/`.
 *
 * The optional password gates the profile at launch. It does not encrypt the database file.
 * Backups: one per day (14 kept), plus one before every migration, restore and update.
 */
export class ProfileManager {
  private active: { record: ProfileRecord; db: Database } | null = null

  constructor(
    private readonly root: string,
    private readonly log: Logger,
  ) {
    mkdirSync(root, { recursive: true })
  }

  private get indexFile(): string {
    return join(this.root, 'index.json')
  }

  private readIndex(): ProfileRecord[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.indexFile, 'utf8'))
      return Array.isArray(parsed) ? (parsed as ProfileRecord[]) : []
    } catch {
      return []
    }
  }

  private writeIndex(records: ProfileRecord[]): void {
    const temp = `${this.indexFile}.tmp`
    writeFileSync(temp, JSON.stringify(records, null, 2), 'utf8')
    renameSync(temp, this.indexFile)
  }

  dir(id: string): string {
    return join(this.root, id)
  }

  filesDir(id: string): string {
    return join(this.dir(id), 'files')
  }

  private dbPath(id: string): string {
    return join(this.dir(id), 'atlas.db')
  }

  private backupsDir(id: string): string {
    return join(this.dir(id), 'backups')
  }

  list(): ProfileSummary[] {
    return this.readIndex().map((r) => ({
      id: r.id,
      name: r.name,
      hasPassword: Boolean(r.hash),
      createdAt: r.createdAt,
      active: this.active?.record.id === r.id,
    }))
  }

  get current(): { id: string; name: string; db: Database } | null {
    return this.active
      ? { id: this.active.record.id, name: this.active.record.name, db: this.active.db }
      : null
  }

  /** The open profile database, or a user-facing error if no profile is unlocked. */
  db(): Database {
    if (!this.active) throw new AtlasError('unavailable', 'Open a profile first.')
    return this.active.db
  }

  create(input: { name: string; password?: string }): ProfileSummary {
    const name = input.name.trim()
    if (!name) throw new AtlasError('bad_request', 'Give the profile a name.')
    const record: ProfileRecord = { id: newId(), name, createdAt: Date.now() }
    if (input.password) {
      record.salt = randomBytes(16).toString('hex')
      record.hash = hashPassword(input.password, record.salt)
    }
    mkdirSync(this.filesDir(record.id), { recursive: true })
    mkdirSync(this.backupsDir(record.id), { recursive: true })
    this.writeIndex([...this.readIndex(), record])
    this.open(record)
    const now = Date.now()
    this.db().tx(() =>
      this.db().run(
        "INSERT OR IGNORE INTO profile_meta (id, name, created_at, updated_at) VALUES ('me', ?, ?, ?)",
        name,
        now,
        now,
      ),
    )
    return {
      id: record.id,
      name,
      hasPassword: Boolean(record.hash),
      createdAt: record.createdAt,
      active: true,
    }
  }

  unlock(id: string, password?: string): ProfileSummary {
    const record = this.readIndex().find((r) => r.id === id)
    if (!record) throw new AtlasError('not_found', 'That profile no longer exists.')
    if (record.hash && record.salt) {
      const given = Buffer.from(hashPassword(password ?? '', record.salt), 'hex')
      const stored = Buffer.from(record.hash, 'hex')
      if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
        throw new AtlasError('forbidden', 'That password is not right. Try again.')
      }
    }
    this.open(record)
    return {
      id: record.id,
      name: record.name,
      hasPassword: Boolean(record.hash),
      createdAt: record.createdAt,
      active: true,
    }
  }

  rename(name: string): void {
    if (!this.active) return
    const records = this.readIndex().map((r) =>
      r.id === this.active?.record.id ? { ...r, name } : r,
    )
    this.writeIndex(records)
    this.active.record.name = name
  }

  lock(): void {
    this.active?.db.close()
    this.active = null
  }

  private open(record: ProfileRecord): void {
    this.lock()
    mkdirSync(this.backupsDir(record.id), { recursive: true })
    mkdirSync(this.filesDir(record.id), { recursive: true })
    const path = this.dbPath(record.id)
    const existed = existsSync(path)
    const db = new Database(path)

    if (db.needsMigration()) {
      let backup: string | undefined
      if (existed && db.version > 0) backup = this.snapshot(record.id, db, 'pre-migration')
      try {
        const applied = db.migrate()
        this.log.info(`profile migrated to v${applied.at(-1) ?? db.version}`)
      } catch (error) {
        this.log.error('migration failed; restoring the backup', error)
        db.close()
        if (backup) {
          for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true })
          copyFileSync(backup, path)
        }
        throw new AtlasError(
          'internal',
          'Atlas could not update this profile, so it was put back exactly as it was. Update Atlas and try again.',
        )
      }
    }
    this.active = { record, db }
    try {
      this.dailyBackup()
    } catch (error) {
      this.log.warn('daily backup failed', error)
    }
  }

  /* ---------- Backups ---------- */

  private snapshot(id: string, db: Database, reason: string): string {
    const file = join(this.backupsDir(id), `atlas-${stamp()}-${reason}.db`)
    db.snapshotTo(file)
    this.prune(id)
    return file
  }

  private dailyBackup(): void {
    if (!this.active) return
    const today = stamp().slice(0, 8)
    const exists = this.listBackups().some(
      (b) => b.reason === 'daily' && b.file.includes(`atlas-${today}`),
    )
    if (!exists) this.snapshot(this.active.record.id, this.active.db, 'daily')
  }

  private prune(id: string): void {
    const all = this.readBackups(id)
    const daily = all.filter((b) => b.reason === 'daily')
    const other = all.filter((b) => b.reason !== 'daily')
    for (const old of [...daily.slice(KEEP_DAILY), ...other.slice(KEEP_OTHER)]) {
      try {
        unlinkSync(join(this.backupsDir(id), old.file))
      } catch {
        // already gone
      }
    }
  }

  private readBackups(id: string): BackupInfo[] {
    let files: string[]
    try {
      files = readdirSync(this.backupsDir(id))
    } catch {
      return []
    }
    return files
      .filter((f) => /^atlas-\d{8}-\d{6}-[a-z-]+\.db$/.test(f))
      .map((file) => {
        const stat = statSync(join(this.backupsDir(id), file))
        return {
          file,
          reason: file.replace(/^atlas-\d{8}-\d{6}-/, '').replace(/\.db$/, ''),
          createdAt: stat.mtimeMs,
          size: stat.size,
        }
      })
      .sort((a, b) => b.file.localeCompare(a.file))
  }

  listBackups(): BackupInfo[] {
    return this.active ? this.readBackups(this.active.record.id) : []
  }

  backupNow(reason = 'manual'): BackupInfo[] {
    if (!this.active) throw new AtlasError('unavailable', 'Open a profile first.')
    this.snapshot(this.active.record.id, this.active.db, reason)
    return this.listBackups()
  }

  /** Replaces the database with a backup. The current state is backed up first. */
  restore(file: string): void {
    if (!this.active) throw new AtlasError('unavailable', 'Open a profile first.')
    const record = this.active.record
    if (!this.readBackups(record.id).some((b) => b.file === file)) {
      throw new AtlasError('not_found', 'That backup no longer exists.')
    }
    this.snapshot(record.id, this.active.db, 'pre-restore')
    this.lock()
    const path = this.dbPath(record.id)
    for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true })
    copyFileSync(join(this.backupsDir(record.id), file), path)
    this.open(record)
  }

  /** Copies the database and every imported file into `targetDir`. Returns the folder made. */
  exportAll(targetDir: string): string {
    if (!this.active) throw new AtlasError('unavailable', 'Open a profile first.')
    const safeName =
      this.active.record.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'profile'
    const out = join(targetDir, `Atlas-export-${safeName}-${stamp()}`)
    mkdirSync(out, { recursive: true })
    this.active.db.snapshotTo(join(out, 'atlas.db'))
    const files = this.filesDir(this.active.record.id)
    if (existsSync(files)) cpSync(files, join(out, 'files'), { recursive: true })
    return out
  }

  /**
   * A full copy of every profile, made before an update installs. The open profile is copied
   * through SQLite (safe while it is in use); the others are plain folder copies. The rolling
   * backups inside each profile are left out, since they are copies already.
   */
  copyEverythingTo(targetDir: string, label: string): string {
    const out = join(targetDir, `Atlas-before-${label}-${stamp()}`)
    mkdirSync(out, { recursive: true })
    if (existsSync(this.indexFile)) copyFileSync(this.indexFile, join(out, 'index.json'))
    for (const record of this.readIndex()) {
      const dest = join(out, record.id)
      if (this.active?.record.id === record.id) {
        mkdirSync(dest, { recursive: true })
        this.snapshot(record.id, this.active.db, 'pre-update')
        this.active.db.snapshotTo(join(dest, 'atlas.db'))
        const files = this.filesDir(record.id)
        if (existsSync(files)) cpSync(files, join(dest, 'files'), { recursive: true })
      } else if (existsSync(this.dir(record.id))) {
        const backups = this.backupsDir(record.id)
        cpSync(this.dir(record.id), dest, {
          recursive: true,
          filter: (src) => !src.startsWith(backups),
        })
      }
    }
    return out
  }
}

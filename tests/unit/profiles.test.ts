import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileManager } from '../../src/main/profiles'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
let root: string
let profiles: ProfileManager

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'atlas-profiles-'))
  profiles = new ProfileManager(root, log)
})
afterEach(() => {
  profiles.lock()
  rmSync(root, { recursive: true, force: true })
})

describe('ProfileManager', () => {
  it('creates a profile with its own database and a first daily backup', () => {
    const created = profiles.create({ name: 'Arman' })
    expect(created).toMatchObject({ name: 'Arman', hasPassword: false, active: true })
    expect(profiles.db().one("SELECT name FROM profile_meta WHERE id = 'me'")?.['name']).toBe(
      'Arman',
    )
    expect(profiles.listBackups().map((b) => b.reason)).toEqual(['daily'])
    expect(existsSync(profiles.filesDir(created.id))).toBe(true)
  })

  it('keeps profiles separate', () => {
    const a = profiles.create({ name: 'A' })
    profiles.db().insert('notes', { title: 'A note', bodyMd: '' })
    profiles.create({ name: 'B' })
    expect(profiles.db().list('notes')).toEqual([])
    profiles.unlock(a.id)
    expect(profiles.db().list('notes')).toHaveLength(1)
    expect(profiles.list().map((p) => [p.name, p.active])).toEqual([
      ['A', true],
      ['B', false],
    ])
  })

  it('requires the right password and never stores it', () => {
    const created = profiles.create({ name: 'Locked', password: 'correct horse' })
    profiles.lock()
    expect(() => profiles.db()).toThrow(/Open a profile/)
    expect(() => profiles.unlock(created.id, 'wrong')).toThrow(/password/)
    expect(() => profiles.unlock(created.id)).toThrow(/password/)
    expect(profiles.unlock(created.id, 'correct horse').active).toBe(true)
    const index = readFileSync(join(root, 'index.json'), 'utf8')
    expect(index).toContain('"hash"')
    expect(index).not.toContain('correct horse')
  })

  it('restores a backup and keeps a copy of what it replaced', () => {
    profiles.create({ name: 'R' })
    profiles.db().insert('notes', { title: 'before', bodyMd: '' })
    const [backup] = profiles.backupNow('manual')
    profiles.db().insert('notes', { title: 'after', bodyMd: '' })
    profiles.restore(backup?.file ?? '')
    expect(
      profiles
        .db()
        .list('notes')
        .map((n) => n['title']),
    ).toEqual(['before'])
    expect(profiles.listBackups().some((b) => b.reason === 'pre-restore')).toBe(true)
    expect(() => profiles.restore('../../etc/passwd')).toThrow(/no longer exists/)
  })

  it('exports the database and files into a new folder', () => {
    profiles.create({ name: 'Ex Port' })
    const out = profiles.exportAll(root)
    expect(readdirSync(out).sort()).toEqual(['atlas.db', 'files'])
  })
})

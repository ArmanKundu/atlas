import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Database, latestVersion, newId, toFtsQuery } from '../../src/main/db/database'
import { importPaths, savePages, search } from '../../src/main/library'
import { writeFileSync } from 'node:fs'

let dir: string
let db: Database

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-db-'))
  db = new Database(join(dir, 'atlas.db'))
  db.migrate()
})
afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('migrations', () => {
  it('bring a new database to the latest version, once', () => {
    expect(db.version).toBe(latestVersion())
    expect(db.needsMigration()).toBe(false)
    expect(db.migrate()).toEqual([])
  })

  it('roll back a failing migration and leave the version unchanged', () => {
    const bad = [
      { version: 99, name: 'broken', sql: 'CREATE TABLE ok_table (id TEXT); THIS IS NOT SQL;' },
    ]
    expect(() => db.migrate(bad)).toThrow()
    expect(db.version).toBe(latestVersion())
    expect(db.one("SELECT name FROM sqlite_master WHERE name = 'ok_table'")).toBeUndefined()
  })
})

describe('table access', () => {
  it('round-trips camelCase objects, booleans and JSON columns', () => {
    const row = db.insert('subjects', {
      name: 'Chemistry',
      kind: 'science',
      colour: 'teal',
      active: true,
      examDates: [{ label: 'Exam 1', date: 5 }],
    })
    expect(row).toMatchObject({
      name: 'Chemistry',
      active: true,
      examDates: [{ label: 'Exam 1', date: 5 }],
    })
    expect(typeof row['id']).toBe('string')
    const updated = db.update('subjects', String(row['id']), { active: false, unitRange: '3/4' })
    expect(updated).toMatchObject({ active: false, unitRange: '3/4', name: 'Chemistry' })
  })

  it('ignores keys that are not columns instead of putting them in SQL', () => {
    const row = db.insert('notes', {
      title: 'A',
      bodyMd: 'b',
      'title; DROP TABLE notes': 1,
      deletedAt: 5,
    })
    expect(db.get('notes', String(row['id']))).toBeTruthy()
    expect(() => db.list('notes', {}, { orderBy: 'id; DROP TABLE notes' })).toThrow(
      /Unknown column/,
    )
    expect(() => db.list('sqlite_master')).toThrow(/Unknown table/)
  })

  it('soft-deletes where supported and filters deleted rows', () => {
    const a = db.insert('notes', { title: 'Keep', bodyMd: '' })
    const b = db.insert('notes', { title: 'Bin', bodyMd: '' })
    db.remove('notes', String(b['id']))
    expect(db.list('notes').map((n) => n['title'])).toEqual(['Keep'])
    expect(db.get('notes', String(b['id']))).toBeUndefined()
    expect(db.one('SELECT COUNT(*) AS n FROM notes')?.['n']).toBe(2)
    expect(db.get('notes', String(a['id']))).toBeTruthy()
  })

  it('filters with where, including null', () => {
    const s = db.insert('subjects', { name: 'Maths', kind: 'maths', colour: 'blue' })
    db.insert('notes', { title: 'In subject', bodyMd: '', subjectId: s['id'] })
    db.insert('notes', { title: 'Loose', bodyMd: '' })
    expect(db.list('notes', { subjectId: s['id'] }).map((n) => n['title'])).toEqual(['In subject'])
    expect(db.list('notes', { subjectId: null }).map((n) => n['title'])).toEqual(['Loose'])
  })

  it('rolls back everything in a failed transaction, including nested ones', () => {
    expect(() =>
      db.tx(() => {
        db.insert('notes', { title: 'one', bodyMd: '' })
        db.tx(() => db.insert('notes', { title: 'two', bodyMd: '' }))
        throw new Error('stop')
      }),
    ).toThrow('stop')
    expect(db.list('notes')).toEqual([])
  })

  it('stores settings as JSON and makes consistent snapshots', () => {
    db.setSetting('ai.config', { defaultProvider: 'ollama' })
    expect(db.getSetting('ai.config', null)).toEqual({ defaultProvider: 'ollama' })
    expect(db.getSetting('missing', 7)).toBe(7)
    const copy = join(dir, 'copy.db')
    db.snapshotTo(copy)
    const other = new Database(copy)
    expect(other.getSetting('ai.config', null)).toEqual({ defaultProvider: 'ollama' })
    other.close()
  })

  it('makes sortable, unique ids', () => {
    const ids = Array.from({ length: 200 }, (_, i) => newId(1_700_000_000_000 + i))
    expect(new Set(ids).size).toBe(200)
    expect([...ids].sort()).toEqual(ids)
  })
})

describe('search', () => {
  it('builds a safe prefix query from free text', () => {
    expect(toFtsQuery('  Enzyme "inhib')).toBe('"enzyme" "inhib"*')
    expect(toFtsQuery('NEAR( OR * ^')).toBe('"near" "or"*')
    expect(toFtsQuery('   ')).toBe('')
  })

  it('imports a text file once, indexes its pages, and finds them by subject', async () => {
    const subject = db.insert('subjects', { name: 'Biology', kind: 'science', colour: 'green' })
    const file = join(dir, '2023 Biology examiner report.txt')
    writeFileSync(
      file,
      'Students confused competitive inhibition with denaturation.\n\nMitochondria are the site of aerobic respiration.',
    )
    const filesDir = join(dir, 'files')

    const [first] = await importPaths(db, filesDir, {
      subjectId: String(subject['id']),
      paths: [file],
    })
    expect(first).toMatchObject({
      kind: 'examiner_report',
      year: 2023,
      ingestStatus: 'ready',
      title: '2023 Biology examiner report',
    })
    const [again] = await importPaths(db, filesDir, { subjectId: null, paths: [dir] })
    expect(again?.['id']).toBe(first?.['id'])
    expect(db.list('sources')).toHaveLength(1)

    const hits = search(db, { query: 'inhibit', subjectId: String(subject['id']) })
    expect(hits[0]).toMatchObject({ type: 'page', page: 1, sourceId: first?.['id'] })
    expect(hits[0]?.snippet).toContain('[[inhibition]]')
    expect(search(db, { query: 'inhibition', subjectId: 'another-subject' })).toEqual([])
    expect(search(db, { query: '"" OR *' })).toEqual([])
  })

  it('replaces pages when text is saved again and keeps the index in step', () => {
    const source = db.insert('sources', {
      kind: 'other',
      title: 'Scan',
      ingestStatus: 'queued',
      fileName: 'Chemistry data book.pdf',
    })
    const id = String(source['id'])
    savePages(db, id, [{ number: 1, text: 'avogadro constant' }])
    savePages(db, id, [
      { number: 1, text: 'faraday constant' },
      { number: 2, text: 'gas constant' },
    ])
    expect(search(db, { query: 'avogadro' })).toEqual([])
    expect(search(db, { query: 'faraday' })).toHaveLength(1)
    expect(db.get('sources', id)).toMatchObject({
      pageCount: 2,
      ingestStatus: 'ready',
      kind: 'data_book',
    })
  })
})

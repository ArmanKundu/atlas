import { randomBytes } from 'node:crypto'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import {
  buildDdl,
  columnDdl,
  LESSONS_V4,
  PAPERS_V3,
  QUESTION_COLS_V3,
  SCHEMA_V1,
  TABLES,
  type TableDef,
} from './schema'

export type Row = Record<string, unknown>

/** Sortable unique id: millisecond timestamp + 80 random bits, base36. */
export function newId(now = Date.now()): string {
  const time = now.toString(36).padStart(9, '0')
  const random = BigInt(`0x${randomBytes(10).toString('hex')}`)
    .toString(36)
    .padStart(16, '0')
  return `${time}${random}`
}

const toSnake = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
const toCamel = (key: string): string => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

export interface Migration {
  version: number
  name: string
  sql: string
}

/**
 * Versioned migrations. Each runs once, in order, inside a transaction; `PRAGMA user_version`
 * records the last one applied. Never edit a released migration: add a new one.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `${buildDdl(SCHEMA_V1)}
CREATE TABLE profile_meta (
  id TEXT PRIMARY KEY CHECK (id = 'me'),
  name TEXT NOT NULL, year_level TEXT, school TEXT, exam_year INTEGER,
  study_system TEXT NOT NULL DEFAULT 'other',
  avatar_colour TEXT NOT NULL DEFAULT 'ink', avatar_accessory TEXT NOT NULL DEFAULT 'none',
  onboarding_done INTEGER NOT NULL DEFAULT 0, onboarding_step INTEGER NOT NULL DEFAULT 0,
  ai_routes TEXT NOT NULL DEFAULT '{}', study_goals TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE ai_usage (day TEXT NOT NULL, provider TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, provider));`,
  },
  {
    version: 2,
    name: 'question regions',
    sql: `ALTER TABLE questions ADD COLUMN regions TEXT NOT NULL DEFAULT '[]';`,
  },
  {
    version: 3,
    name: 'papers and question details',
    sql: `${buildDdl({ papers: PAPERS_V3 })}
${Object.entries(QUESTION_COLS_V3)
  .map(([name, type]) => `ALTER TABLE questions ADD COLUMN ${columnDdl(name, type)};`)
  .join('\n')}`,
  },
  {
    version: 4,
    name: 'explainer lessons',
    sql: buildDdl({ lessons: LESSONS_V4 }),
  },
]

export function latestVersion(migrations: Migration[] = MIGRATIONS): number {
  return migrations.reduce((max, m) => Math.max(max, m.version), 0)
}

/**
 * A profile database. Every write goes through `tx`, values are converted between the app's
 * camelCase objects and SQLite columns, and table and column names are checked against the
 * schema so nothing from the renderer is ever spliced into SQL.
 */
export class Database {
  readonly sqlite: DatabaseSync
  private depth = 0

  constructor(readonly path: string) {
    this.sqlite = new DatabaseSync(path)
    this.sqlite.exec(
      'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;',
    )
  }

  close(): void {
    this.sqlite.close()
  }

  get version(): number {
    return Number((this.sqlite.prepare('PRAGMA user_version').get() as Row)['user_version'])
  }

  needsMigration(migrations: Migration[] = MIGRATIONS): boolean {
    return this.version < latestVersion(migrations)
  }

  /** Applies pending migrations. Throws (and rolls the failed one back) if one fails. */
  migrate(migrations: Migration[] = MIGRATIONS): number[] {
    const applied: number[] = []
    const pending = migrations
      .filter((m) => m.version > this.version)
      .sort((a, b) => a.version - b.version)
    for (const migration of pending) {
      this.tx(() => {
        this.sqlite.exec(migration.sql)
        this.sqlite.exec(`PRAGMA user_version = ${migration.version}`)
      })
      applied.push(migration.version)
    }
    return applied
  }

  /** Runs `fn` in a transaction (a savepoint when nested). Rolls back if it throws. */
  tx<T>(fn: () => T): T {
    const name = `sp_${this.depth}`
    this.sqlite.exec(this.depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`)
    this.depth++
    try {
      const result = fn()
      this.depth--
      this.sqlite.exec(this.depth === 0 ? 'COMMIT' : `RELEASE ${name}`)
      return result
    } catch (error) {
      this.depth--
      this.sqlite.exec(this.depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`)
      throw error
    }
  }

  /* ---------- Raw SQL (parameters only; never interpolate values) ---------- */

  all(sql: string, ...params: SQLInputValue[]): Row[] {
    return this.sqlite.prepare(sql).all(...params) as Row[]
  }

  one(sql: string, ...params: SQLInputValue[]): Row | undefined {
    return this.sqlite.prepare(sql).get(...params) as Row | undefined
  }

  run(sql: string, ...params: SQLInputValue[]): void {
    this.sqlite.prepare(sql).run(...params)
  }

  /* ---------- Table access ---------- */

  private def(table: string): TableDef {
    const def = TABLES[table]
    if (!def) throw new Error(`Unknown table "${table}"`)
    return def
  }

  private encode(table: string, values: Row): Record<string, SQLInputValue> {
    const def = this.def(table)
    const out: Record<string, SQLInputValue> = {}
    for (const [key, value] of Object.entries(values)) {
      const column = toSnake(key)
      const type = def.cols[column]
      if (!type) continue // unknown or managed columns are ignored, never written
      if (value === undefined) continue
      if (type === 'bool') out[column] = value ? 1 : 0
      else if (type === 'json[]' || type === 'json{}') out[column] = JSON.stringify(value ?? null)
      else out[column] = (value as SQLInputValue) ?? null
    }
    return out
  }

  decode(table: string, row: Row): Row {
    const def = this.def(table)
    const out: Row = {}
    for (const [column, value] of Object.entries(row)) {
      const type = def.cols[column]
      if (type === 'bool') out[toCamel(column)] = value === 1
      else if (type === 'json[]' || type === 'json{}') {
        try {
          out[toCamel(column)] = JSON.parse(String(value))
        } catch {
          out[toCamel(column)] = type === 'json[]' ? [] : {}
        }
      } else out[toCamel(column)] = value
    }
    return out
  }

  insert(table: string, values: Row, id: string = newId()): Row {
    const encoded = this.encode(table, values)
    const now = Date.now()
    const columns = ['id', 'created_at', 'updated_at', ...Object.keys(encoded)]
    const params = [id, now, now, ...Object.values(encoded)]
    return this.tx(() => {
      this.run(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        ...params,
      )
      return this.get(table, id) as Row
    })
  }

  update(table: string, id: string, patch: Row): Row | undefined {
    const encoded = this.encode(table, patch)
    const sets = [...Object.keys(encoded).map((c) => `${c} = ?`), 'updated_at = ?']
    return this.tx(() => {
      this.run(
        `UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`,
        ...Object.values(encoded),
        Date.now(),
        id,
      )
      return this.get(table, id)
    })
  }

  get(table: string, id: string): Row | undefined {
    const def = this.def(table)
    const row = this.one(
      `SELECT * FROM ${table} WHERE id = ?${def.soft ? ' AND deleted_at IS NULL' : ''}`,
      id,
    )
    return row ? this.decode(table, row) : undefined
  }

  /** Rows matching every `where` equality, newest first unless `orderBy` (a column) is given. */
  list(
    table: string,
    where: Row = {},
    options: { orderBy?: string; desc?: boolean; limit?: number } = {},
  ): Row[] {
    const def = this.def(table)
    const clauses: string[] = def.soft ? ['deleted_at IS NULL'] : []
    const params: SQLInputValue[] = []
    for (const [key, value] of Object.entries(this.encode(table, where))) {
      if (value === null) clauses.push(`${key} IS NULL`)
      else {
        clauses.push(`${key} = ?`)
        params.push(value)
      }
    }
    let order = 'created_at'
    if (options.orderBy) {
      const column = toSnake(options.orderBy)
      if (!def.cols[column] && !['created_at', 'updated_at'].includes(column)) {
        throw new Error(`Unknown column "${column}" on ${table}`)
      }
      order = column
    }
    const desc = options.desc ?? !options.orderBy
    const limit = options.limit ? ` LIMIT ${Math.max(1, Math.floor(options.limit))}` : ''
    const rows = this.all(
      `SELECT * FROM ${table}${clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''} ORDER BY ${order} ${desc ? 'DESC' : 'ASC'}, id${limit}`,
      ...params,
    )
    return rows.map((row) => this.decode(table, row))
  }

  /** Soft-deletes where the table supports it, otherwise deletes the row. */
  remove(table: string, id: string): void {
    const def = this.def(table)
    this.tx(() => {
      if (def.soft)
        this.run(
          `UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ?`,
          Date.now(),
          Date.now(),
          id,
        )
      else this.run(`DELETE FROM ${table} WHERE id = ?`, id)
    })
  }

  /* ---------- Key/value settings ---------- */

  getSetting<T>(key: string, fallback: T): T {
    const row = this.one('SELECT value FROM settings WHERE key = ?', key)
    if (!row) return fallback
    try {
      return JSON.parse(String(row['value'])) as T
    } catch {
      return fallback
    }
  }

  setSetting(key: string, value: unknown): void {
    this.tx(() =>
      this.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        JSON.stringify(value),
      ),
    )
  }

  /** A consistent copy of the whole database in one file (used for backups and exports). */
  snapshotTo(file: string): void {
    this.sqlite.prepare('VACUUM INTO ?').run(file)
  }
}

/** Turns free text into a safe FTS5 query: each word quoted, last word as a prefix. */
export function toFtsQuery(input: string): string {
  const words = input
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .slice(0, 12)
  if (words.length === 0) return ''
  return words.map((word, i) => (i === words.length - 1 ? `"${word}"*` : `"${word}"`)).join(' ')
}

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { AtlasError } from '@shared/errors'
import type { PageText, SearchHit, SourceKind } from '@shared/models'
import { toFtsQuery, type Database, type Row } from './db/database'
import { detectKind, detectYear, splitTextIntoPages, titleFromFileName } from './ingest/detect'

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
}

export const IMPORTABLE_EXTENSIONS = Object.keys(MIME).map((ext) => ext.slice(1))

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/** Expands folders (recursively) into the importable files inside them. */
async function expand(paths: string[], limit = 2000): Promise<string[]> {
  const out: string[] = []
  const walk = async (path: string): Promise<void> => {
    if (out.length >= limit) return
    const info = await stat(path).catch(() => null)
    if (!info) return
    if (info.isDirectory()) {
      for (const entry of await readdir(path)) {
        if (!entry.startsWith('.')) await walk(join(path, entry))
      }
    } else if (MIME[extname(path).toLowerCase()]) out.push(path)
  }
  for (const path of paths) await walk(path)
  return out
}

/**
 * Stage A of ingestion, with no AI: copy each file into profile storage, hash and de-duplicate
 * it, guess its type, and store plain-text files' pages straight away. PDFs are queued; the
 * interface extracts their text with pdf.js and sends it back through `savePages`.
 */
export async function importPaths(
  db: Database,
  filesDir: string,
  input: { subjectId: string | null; paths: string[]; kind?: SourceKind },
): Promise<Row[]> {
  const files = await expand(input.paths)
  if (files.length === 0) {
    throw new AtlasError('bad_request', 'No PDF, text or Markdown files were found there.')
  }
  const results: Row[] = []

  for (const path of files) {
    const ext = extname(path).toLowerCase()
    const fileName = basename(path)
    const checksum = await sha256(path)

    const existing = db.list('sources', { checksum })[0]
    if (existing) {
      results.push(existing)
      continue
    }

    const stored = join(checksum.slice(0, 2), `${checksum}${ext}`)
    await mkdir(join(filesDir, checksum.slice(0, 2)), { recursive: true })
    await copyFile(path, join(filesDir, stored))
    const info = await stat(path)

    const isPdf = ext === '.pdf'
    let pages: string[] = []
    if (!isPdf) pages = splitTextIntoPages(await readFile(path, 'utf8'))

    const guess = input.kind
      ? { kind: input.kind, confidence: 1 }
      : detectKind(fileName, pages[0] ?? '')

    const source = db.tx(() => {
      const row = db.insert('sources', {
        subjectId: input.subjectId,
        kind: guess.kind,
        title: titleFromFileName(fileName),
        year: detectYear(fileName),
        filePath: stored,
        fileName,
        mime: MIME[ext],
        size: info.size,
        pageCount: isPdf ? null : pages.length,
        personal: guess.kind === 'textbook',
        ingestStatus: isPdf ? 'queued' : 'ready',
        checksum,
      })
      pages.forEach((text, index) =>
        db.insert('pages', { sourceId: row['id'], number: index + 1, text }),
      )
      return row
    })
    results.push(source)
  }
  return results
}

export function savePages(db: Database, sourceId: string, pages: PageText[]): void {
  const source = db.get('sources', sourceId)
  if (!source) throw new AtlasError('not_found', 'That file is no longer in the library.')
  db.tx(() => {
    db.run('DELETE FROM pages WHERE source_id = ?', sourceId)
    for (const page of pages) {
      db.insert('pages', { sourceId, number: page.number, text: page.text, ocr: false })
    }
    const patch: Row = { pageCount: pages.length, ingestStatus: 'ready', ingestError: null }
    // A weak first guess gets a second look now that the first page's text is known.
    if (source['kind'] === 'other') {
      const guess = detectKind(String(source['fileName'] ?? ''), pages[0]?.text ?? '')
      if (guess.confidence >= 0.8) patch['kind'] = guess.kind
    }
    db.update('sources', sourceId, patch)
  })
}

export function getPages(db: Database, sourceId: string): PageText[] {
  return db
    .all('SELECT number, text FROM pages WHERE source_id = ? ORDER BY number', sourceId)
    .map((row) => ({ number: Number(row['number']), text: String(row['text']) }))
}

export async function readSourceFile(
  db: Database,
  filesDir: string,
  sourceId: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const source = db.get('sources', sourceId)
  const relative = source?.['filePath']
  if (typeof relative !== 'string')
    throw new AtlasError('not_found', 'That file is no longer in the library.')
  try {
    const data = await readFile(join(filesDir, relative))
    const bytes = new Uint8Array(new ArrayBuffer(data.byteLength))
    bytes.set(data)
    return bytes
  } catch {
    throw new AtlasError('not_found', 'The stored copy of that file is missing. Import it again.')
  }
}

export async function removeSource(
  db: Database,
  filesDir: string,
  sourceId: string,
): Promise<void> {
  const source = db.get('sources', sourceId)
  if (!source) return
  db.tx(() => {
    db.run('DELETE FROM pages WHERE source_id = ?', sourceId)
    db.remove('sources', sourceId)
  })
  if (typeof source['filePath'] === 'string') {
    await rm(join(filesDir, source['filePath']), { force: true })
  }
}

/** Full-text search across page text, notes, flashcards and questions. */
export function search(
  db: Database,
  input: { query: string; subjectId?: string | null; limit?: number },
): SearchHit[] {
  const match = toFtsQuery(input.query)
  if (!match) return []
  const limit = input.limit ?? 30
  const subject = input.subjectId ?? null
  const hits: SearchHit[] = []
  const snip = (table: string, column = 0): string =>
    `snippet(${table}_fts, ${column}, '[[', ']]', ' … ', 18)`

  const pageRows = db.all(
    `SELECT p.id, p.source_id, p.number, s.title, s.subject_id, ${snip('pages')} AS snip
     FROM pages_fts JOIN pages p ON p.rowid = pages_fts.rowid JOIN sources s ON s.id = p.source_id
     WHERE pages_fts MATCH ? AND s.deleted_at IS NULL AND (? IS NULL OR s.subject_id = ?)
     ORDER BY rank LIMIT ?`,
    match,
    subject,
    subject,
    limit,
  )
  for (const r of pageRows) {
    hits.push({
      type: 'page',
      id: String(r['id']),
      title: `${String(r['title'])}, page ${Number(r['number'])}`,
      snippet: String(r['snip']),
      subjectId: (r['subject_id'] as string | null) ?? null,
      sourceId: String(r['source_id']),
      page: Number(r['number']),
    })
  }

  const noteRows = db.all(
    `SELECT n.id, n.title, n.subject_id, ${snip('notes', 1)} AS snip
     FROM notes_fts JOIN notes n ON n.rowid = notes_fts.rowid
     WHERE notes_fts MATCH ? AND n.deleted_at IS NULL AND (? IS NULL OR n.subject_id = ?)
     ORDER BY rank LIMIT ?`,
    match,
    subject,
    subject,
    Math.ceil(limit / 2),
  )
  for (const r of noteRows) {
    hits.push({
      type: 'note',
      id: String(r['id']),
      title: String(r['title']),
      snippet: String(r['snip']),
      subjectId: (r['subject_id'] as string | null) ?? null,
      sourceId: null,
      page: null,
    })
  }

  const cardRows = db.all(
    `SELECT f.id, f.front_md, f.subject_id, ${snip('flashcards', 1)} AS snip
     FROM flashcards_fts JOIN flashcards f ON f.rowid = flashcards_fts.rowid
     WHERE flashcards_fts MATCH ? AND f.deleted_at IS NULL AND (? IS NULL OR f.subject_id = ?)
     ORDER BY rank LIMIT ?`,
    match,
    subject,
    subject,
    Math.ceil(limit / 3),
  )
  for (const r of cardRows) {
    hits.push({
      type: 'flashcard',
      id: String(r['id']),
      title: String(r['front_md']).slice(0, 120),
      snippet: String(r['snip']),
      subjectId: (r['subject_id'] as string | null) ?? null,
      sourceId: null,
      page: null,
    })
  }

  const questionRows = db.all(
    `SELECT q.id, q.label, q.subject_id, q.source_id, ${snip('questions')} AS snip
     FROM questions_fts JOIN questions q ON q.rowid = questions_fts.rowid
     WHERE questions_fts MATCH ? AND q.deleted_at IS NULL AND (? IS NULL OR q.subject_id = ?)
     ORDER BY rank LIMIT ?`,
    match,
    subject,
    subject,
    Math.ceil(limit / 3),
  )
  for (const r of questionRows) {
    hits.push({
      type: 'question',
      id: String(r['id']),
      title: String(r['label'] ?? 'Question'),
      snippet: String(r['snip']),
      subjectId: (r['subject_id'] as string | null) ?? null,
      sourceId: (r['source_id'] as string | null) ?? null,
      page: null,
    })
  }
  return hits
}

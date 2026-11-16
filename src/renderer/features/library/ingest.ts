import type { Source } from '@shared/models'
import { changed, db } from '@/lib/api'
import { call } from '@/lib/ipc'
import { closePdf, openPdf, pageText } from '@/lib/pdf'

let running = false
let again = false

/**
 * Extracts text from queued PDFs, one at a time, and stores it for search. Safe to call any
 * number of times: a second call while one is running just schedules another pass. A file left
 * half-done by a quit is picked up again on the next launch.
 */
export async function processImportQueue(): Promise<void> {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      const sources = (await db.list('sources')) as Source[]
      const queue = sources.filter(
        (s) =>
          s.mime === 'application/pdf' &&
          (s.ingestStatus === 'queued' || s.ingestStatus === 'extracting'),
      )
      for (const source of queue) await extract(source)
    } while (again)
  } finally {
    running = false
    changed('sources')
  }
}

async function extract(source: Source): Promise<void> {
  try {
    await call('library:setStatus', { sourceId: source.id, status: 'extracting' })
    changed('sources')
    const bytes = await call('library:fileBytes', { sourceId: source.id })
    const doc = await openPdf(bytes)
    const pages: { number: number; text: string }[] = []
    for (let number = 1; number <= doc.numPages; number++) {
      pages.push({ number, text: await pageText(doc, number) })
    }
    await closePdf(doc)
    await call('library:savePages', { sourceId: source.id, pages })
  } catch {
    await call('library:setStatus', {
      sourceId: source.id,
      status: 'error',
      error:
        'This PDF could not be read. Check that it opens in a PDF viewer, then import it again.',
    }).catch(() => undefined)
  }
  changed('sources')
}

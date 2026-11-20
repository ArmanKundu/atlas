import { useEffect, useState } from 'react'
import { call } from '@/lib/ipc'
import { closePdf, openPdf, type PDFDocumentProxy } from '@/lib/pdf'

interface Entry {
  promise: Promise<PDFDocumentProxy>
  users: number
  timer?: ReturnType<typeof setTimeout>
}

const cache = new Map<string, Entry>()

/** Opens a library PDF once and shares it between every view that shows its pages. */
function acquire(sourceId: string): Promise<PDFDocumentProxy> {
  let entry = cache.get(sourceId)
  if (!entry) {
    const promise = call('library:fileBytes', { sourceId }).then(openPdf)
    entry = { promise, users: 0 }
    cache.set(sourceId, entry)
    promise.catch(() => cache.delete(sourceId))
  }
  if (entry.timer) clearTimeout(entry.timer)
  entry.users++
  return entry.promise
}

/** Lets go of a document; it is closed a little later if nothing else picks it up. */
function release(sourceId: string): void {
  const entry = cache.get(sourceId)
  if (!entry) return
  entry.users--
  if (entry.users > 0) return
  entry.timer = setTimeout(() => {
    if (entry.users > 0) return
    cache.delete(sourceId)
    void entry.promise.then(closePdf).catch(() => undefined)
  }, 30_000)
}

export type PdfState =
  | { status: 'loading'; doc: null }
  | { status: 'ready'; doc: PDFDocumentProxy }
  | { status: 'failed'; doc: null }

/** The shared PDF for a library source, or null while it opens. */
export function useSharedPdf(sourceId: string | null): PdfState {
  const [state, setState] = useState<{ id: string | null; value: PdfState }>({
    id: null,
    value: { status: 'loading', doc: null },
  })
  useEffect(() => {
    if (!sourceId) return
    let cancelled = false
    acquire(sourceId)
      .then((doc) => {
        if (!cancelled) setState({ id: sourceId, value: { status: 'ready', doc } })
      })
      .catch(() => {
        if (!cancelled) setState({ id: sourceId, value: { status: 'failed', doc: null } })
      })
    return () => {
      cancelled = true
      release(sourceId)
    }
  }, [sourceId])
  return state.id === sourceId && sourceId ? state.value : { status: 'loading', doc: null }
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { ChevronDown, ChevronUp, Maximize2, Minus, Plus, Search, X } from 'lucide-react'
import type { PageText, Source } from '@shared/models'
import { PillBar, PillButton, PillDivider } from '@/design/Pill'
import { EmptyState, ErrorState, Skeleton } from '@/design/States'
import { db, useLive } from '@/lib/api'
import { call } from '@/lib/ipc'
import { closePdf, openPdf, type PDFDocumentProxy } from '@/lib/pdf'

/** One PDF page. It renders only while near the viewport, so long documents stay smooth. */
function PdfPage({
  doc,
  number,
  width,
  ratio,
}: {
  doc: PDFDocumentProxy
  number: number
  width: number
  ratio: number
}) {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = holder.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      { rootMargin: '900px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let task: { cancel: () => void } | undefined
    void doc.getPage(number).then((page) => {
      const target = canvas.current
      if (cancelled || !target) return
      const base = page.getViewport({ scale: 1 })
      const scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale })
      target.width = Math.floor(viewport.width)
      target.height = Math.floor(viewport.height)
      const render = page.render({ canvas: target, viewport })
      task = render
      render.promise.catch(() => undefined)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, number, width, visible])

  return (
    <div
      ref={holder}
      id={`page-${number}`}
      data-page={number}
      className="relative mx-auto overflow-hidden rounded-sm bg-white shadow-pill"
      style={{ width, height: Math.round(width * ratio) }}
    >
      {visible ? <canvas ref={canvas} className="block size-full" /> : null}
      <span className="absolute right-2 bottom-2 rounded-full bg-black/55 px-2 py-0.5 text-2xs text-white tabular-nums">
        {number}
      </span>
    </div>
  )
}

/** The paper viewer: page images on the left, search and page text on the right. */
export function Viewer() {
  const { sourceId = '' } = useParams()
  const [params] = useSearchParams()
  const scroller = useRef<HTMLDivElement>(null)
  const [opened, setOpened] = useState<{
    sourceId: string
    doc: PDFDocumentProxy | null
    failed: string | null
  } | null>(null)
  const [ratio, setRatio] = useState(1.414)
  const [zoom, setZoom] = useState(1)
  const [fit, setFit] = useState(820)
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)

  const source = useLive(['sources'], () => db.get('sources', sourceId) as Promise<Source | null>, [
    sourceId,
  ])
  const pages = useLive(['sources'], () => call('library:pages', { sourceId }), [sourceId])
  const isPdf = source.data?.mime === 'application/pdf'
  const doc = opened?.sourceId === sourceId ? opened.doc : null
  const failed = opened?.sourceId === sourceId ? opened.failed : null

  useEffect(() => {
    if (!isPdf) return
    let cancelled = false
    let pdfDoc: PDFDocumentProxy | undefined
    void call('library:fileBytes', { sourceId })
      .then(openPdf)
      .then(async (pdf) => {
        pdfDoc = pdf
        const first = await pdf.getPage(1)
        const view = first.getViewport({ scale: 1 })
        if (cancelled) return
        setRatio(view.height / view.width)
        setOpened({ sourceId, doc: pdf, failed: null })
      })
      .catch(() => {
        if (!cancelled)
          setOpened({
            sourceId,
            doc: null,
            failed: 'This file could not be opened. Import it again from the Library.',
          })
      })
    return () => {
      cancelled = true
      if (pdfDoc) void closePdf(pdfDoc)
    }
  }, [sourceId, isPdf])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const measure = (): void => setFit(Math.max(320, Math.min(1100, element.clientWidth - 96)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const goTo = (number: number): void => {
    document.getElementById(`page-${number}`)?.scrollIntoView({ block: 'start' })
  }
  const startPage = Number(params.get('page') ?? 0)
  const ready = isPdf ? doc !== null : (pages.data?.length ?? 0) > 0
  useEffect(() => {
    if (ready && startPage > 0) requestAnimationFrame(() => goTo(startPage))
  }, [ready, startPage])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle.length < 2) return []
    return (pages.data ?? []).flatMap((page: PageText) => {
      const at = page.text.toLowerCase().indexOf(needle)
      if (at === -1) return []
      const from = Math.max(0, at - 50)
      return [
        {
          number: page.number,
          before: page.text.slice(from, at),
          hit: page.text.slice(at, at + needle.length),
          after: page.text.slice(at + needle.length, at + needle.length + 80),
        },
      ]
    })
  }, [pages.data, query])

  const step = (delta: number): void => {
    if (matches.length === 0) return
    const next = (matchIndex + delta + matches.length) % matches.length
    setMatchIndex(next)
    const match = matches[next]
    if (match) goTo(match.number)
  }

  if (source.loading)
    return (
      <div className="p-8">
        <Skeleton className="h-96" />
      </div>
    )
  if (!source.data) {
    return (
      <div className="p-8">
        <EmptyState eyebrow="Not found" title="That file is no longer in the library">
          Open the Library to see what is there.
        </EmptyState>
      </div>
    )
  }
  const width = Math.round(fit * zoom)

  return (
    <div className="flex h-full">
      <div ref={scroller} className="relative min-w-0 flex-1 overflow-auto bg-canvas">
        <div className="sticky top-3 z-10 flex justify-center gap-2 px-4">
          <PillBar label="Find in document" className="pl-3">
            <Search className="size-4 text-ink-3" aria-hidden />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setMatchIndex(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
              }}
              placeholder="Find in document"
              aria-label="Find in document"
              className="w-44 bg-transparent px-1 text-ink outline-none placeholder:text-ink-3"
            />
            <span className="px-1 text-ink-3 tabular-nums">
              {matches.length
                ? `${matchIndex + 1}/${matches.length}`
                : query.trim().length >= 2
                  ? '0/0'
                  : ''}
            </span>
            <PillButton
              label="Previous match"
              icon={<ChevronUp className="size-4" />}
              onClick={() => step(-1)}
            />
            <PillButton
              label="Next match"
              icon={<ChevronDown className="size-4" />}
              onClick={() => step(1)}
            />
            <PillButton
              label="Clear"
              icon={<X className="size-4" />}
              onClick={() => setQuery('')}
            />
          </PillBar>
          {isPdf ? (
            <PillBar label="Zoom">
              <PillButton
                label="Zoom out"
                icon={<Minus className="size-4" />}
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
              />
              <PillDivider />
              <PillButton
                label="Fit to width"
                icon={<Maximize2 className="size-4" />}
                onClick={() => setZoom(1)}
              />
              <PillDivider />
              <PillButton
                label="Zoom in"
                icon={<Plus className="size-4" />}
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
              />
            </PillBar>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 px-8 pt-4 pb-10">
          {failed ? <ErrorState title="This did not open">{failed}</ErrorState> : null}
          {isPdf ? (
            doc ? (
              Array.from({ length: doc.numPages }, (_, i) => (
                <PdfPage key={i + 1} doc={doc} number={i + 1} width={width} ratio={ratio} />
              ))
            ) : failed ? null : (
              <Skeleton className="mx-auto h-[900px] w-[640px]" />
            )
          ) : (
            (pages.data ?? []).map((page) => (
              <article
                key={page.number}
                id={`page-${page.number}`}
                className="mx-auto w-full max-w-[820px] rounded-lg bg-surface p-8 whitespace-pre-wrap shadow-pill"
              >
                {page.text}
              </article>
            ))
          )}
        </div>
      </div>

      <aside className="flex w-[300px] shrink-0 flex-col border-l border-line">
        <div className="border-b border-line px-4 py-3">
          <p className="truncate font-semibold text-ink">{source.data.title}</p>
          <p className="text-2xs text-ink-3">
            {source.data.pageCount ?? pages.data?.length ?? 0} pages
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {query.trim().length >= 2 ? (
            matches.length ? (
              matches.map((match, index) => (
                <button
                  key={match.number}
                  type="button"
                  onClick={() => {
                    setMatchIndex(index)
                    goTo(match.number)
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-hover aria-[current=true]:bg-hover"
                  aria-current={index === matchIndex}
                >
                  <span className="text-2xs text-ink-3">Page {match.number}</span>
                  <span className="block text-ink-2">
                    …{match.before}
                    <mark className="rounded-sm bg-warn-soft px-0.5 text-ink">{match.hit}</mark>
                    {match.after}…
                  </span>
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-ink-3">
                {source.data.ingestStatus === 'ready'
                  ? 'No pages contain that.'
                  : 'This file is still being read. Search works once it is ready.'}
              </p>
            )
          ) : (
            (pages.data ?? []).map((page) => (
              <button
                key={page.number}
                type="button"
                onClick={() => goTo(page.number)}
                className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-hover"
              >
                <span className="text-2xs text-ink-3">Page {page.number}</span>
                <span className="line-clamp-2 text-ink-2">
                  {page.text.slice(0, 160) || 'No text on this page'}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>
    </div>
  )
}

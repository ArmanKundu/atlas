import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Columns2,
  Eraser,
  Expand,
  Flag,
  Highlighter,
  LayoutGrid,
  Lock,
  LockOpen,
  Maximize,
  MessageSquare,
  Minus,
  MousePointer2,
  PanelLeft,
  PenLine,
  Plus,
  Redo2,
  RotateCw,
  ScanSearch,
  Search,
  SquareDashedMousePointer,
  Underline,
  Undo2,
  X,
} from 'lucide-react'
import { TextLayer } from 'pdfjs-dist'
import type { PageText, Region } from '@shared/models'
import { PillBar, PillButton, PillDivider } from '@/design/Pill'
import { ErrorState, Skeleton } from '@/design/States'
import { Tooltip } from '@/design/Tooltip'
import { useSharedPdf } from '@/features/questions/pdf-cache'
import { useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { isMac } from '@/lib/keys'
import type { PDFDocumentProxy } from '@/lib/pdf'
import { AnnotationLayer } from './AnnotationLayer'
import { SWATCHES, type AnnotationsApi, type Tool } from './annotations'

export type TextAction = 'ask' | 'explain' | 'define' | 'examiner'

export interface PdfPaneHandle {
  /** Scrolls so a point on a page (y as a page fraction) sits near the top. */
  goTo: (page: number, y?: number) => void
  focusFind: () => void
}

/** One page: canvas, selectable text, question boxes and the student's annotations. */
function Page({
  doc,
  number,
  width,
  ratio,
  rotation,
  needle,
  onPointer,
  children,
}: {
  doc: PDFDocumentProxy
  number: number
  width: number
  ratio: number
  rotation: number
  needle: string
  onPointer?: (kind: 'move' | 'click' | 'leave', page: number, x: number, y: number) => void
  children?: ReactNode
}) {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const text = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const element = holder.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((e) => e.isIntersecting)),
      {
        rootMargin: '1200px 0px',
      },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let task: { cancel: () => void } | undefined
    let layer: TextLayer | undefined
    void doc.getPage(number).then(async (page) => {
      const target = canvas.current
      const textBox = text.current
      if (cancelled || !target || !textBox) return
      const base = page.getViewport({ scale: 1, rotation })
      const cssScale = width / base.width
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale: cssScale * dpr, rotation })
      target.width = Math.floor(viewport.width)
      target.height = Math.floor(viewport.height)
      const render = page.render({ canvas: target, viewport })
      task = render
      await render.promise.catch(() => undefined)
      if (cancelled) return
      setDrawn(true)
      textBox.replaceChildren()
      textBox.style.setProperty('--scale-factor', String(cssScale))
      textBox.style.setProperty('--total-scale-factor', String(cssScale))
      textBox.style.setProperty('--user-unit', '1')
      layer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: textBox,
        viewport: page.getViewport({ scale: cssScale, rotation }),
      })
      await layer.render().catch(() => undefined)
    })
    return () => {
      cancelled = true
      task?.cancel()
      layer?.cancel()
    }
  }, [doc, number, width, visible, rotation])

  // Find: tint the words that match.
  useEffect(() => {
    const box = text.current
    if (!box) return
    const n = needle.trim().toLowerCase()
    for (const span of box.querySelectorAll('span')) {
      span.classList.toggle(
        'find-hit',
        n.length >= 2 && (span.textContent ?? '').toLowerCase().includes(n),
      )
    }
  }, [needle, drawn])

  const height = Math.round(width * (rotation % 180 === 0 ? ratio : 1 / ratio))
  return (
    <div
      ref={holder}
      id={`pdf-page-${number}`}
      data-page={number}
      className="relative mx-auto shrink-0 bg-white shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_1px_rgb(0_0_0/0.04)]"
      style={{ width, height }}
      onMouseMove={(e) => {
        if (!onPointer) return
        const r = e.currentTarget.getBoundingClientRect()
        onPointer('move', number, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
      }}
      onMouseLeave={() => onPointer?.('leave', number, 0, 0)}
      onClick={(e) => {
        if (!onPointer || window.getSelection()?.toString()) return
        const r = e.currentTarget.getBoundingClientRect()
        onPointer('click', number, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
      }}
    >
      {visible ? <canvas ref={canvas} className="absolute inset-0 block size-full" /> : null}
      {!drawn ? <Skeleton className="absolute inset-3" /> : null}
      <div ref={text} className="textLayer" />
      {rotation === 0 ? children : null}
    </div>
  )
}

/** Small page images down the left, with the current page outlined and bookmarks marked. */
function Thumb({
  doc,
  number,
  current,
  bookmarked,
  onClick,
}: {
  doc: PDFDocumentProxy
  number: number
  current: boolean
  bookmarked: boolean
  onClick: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const holder = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const element = holder.current
    if (!element) return
    const observer = new IntersectionObserver((e) => setVisible(e.some((x) => x.isIntersecting)), {
      rootMargin: '400px 0px',
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    let task: { cancel: () => void } | undefined
    void doc.getPage(number).then((page) => {
      const target = canvas.current
      if (!target) return
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: 180 / base.width })
      target.width = Math.floor(viewport.width)
      target.height = Math.floor(viewport.height)
      task = page.render({ canvas: target, viewport })
    })
    return () => task?.cancel()
  }, [doc, number, visible])
  return (
    <button
      ref={holder}
      type="button"
      onClick={onClick}
      aria-label={`Page ${number}`}
      aria-current={current}
      className={cn(
        'relative block w-full rounded-sm bg-white ring-1 ring-line',
        current && 'ring-2 ring-blue',
      )}
    >
      <canvas ref={canvas} className="block h-auto w-full" />
      {bookmarked ? (
        <Bookmark
          className="absolute top-1 right-1 size-3.5 fill-blue text-blue"
          aria-label="Bookmarked"
        />
      ) : null}
      <span className="absolute bottom-1 left-1 rounded-sm bg-black/55 px-1 text-[0.625rem] text-white tabular-nums">
        {number}
      </span>
    </button>
  )
}

const TOOLS: { tool: Tool; label: string; icon: ReactNode }[] = [
  { tool: 'select', label: 'Select', icon: <MousePointer2 className="size-[18px]" /> },
  { tool: 'highlight', label: 'Highlight', icon: <Highlighter className="size-[18px]" /> },
  { tool: 'underline', label: 'Underline', icon: <Underline className="size-[18px]" /> },
  { tool: 'comment', label: 'Comment', icon: <MessageSquare className="size-[18px]" /> },
  { tool: 'flag', label: 'Flag', icon: <Flag className="size-[18px]" /> },
  {
    tool: 'area',
    label: 'Ask about the selected area',
    icon: <ScanSearch className="size-[18px]" />,
  },
  { tool: 'pen', label: 'Pen', icon: <PenLine className="size-[18px]" /> },
  { tool: 'marker', label: 'Marker', icon: <Eraser className="size-[18px] rotate-180" /> },
]

export interface PdfPaneProps {
  sourceId: string
  overlay?: (page: number) => ReactNode
  annotations: AnnotationsApi
  tool: Tool
  onTool: (tool: Tool) => void
  color: string
  onColor: (color: string) => void
  locked: boolean
  onLocked: (locked: boolean) => void
  /** Shows the "mark a question" box tool (for building the question bank by hand). */
  canMarkQuestions?: boolean
  onArea: (region: Region) => void
  onQuestionBox: (region: Region) => void
  onTextAction: (action: TextAction, text: string) => void
  onVisiblePage?: (page: number) => void
  /** Pointer over a page, as page fractions; used to hit question boxes without blocking text. */
  onPagePointer?: (kind: 'move' | 'click' | 'leave', page: number, x: number, y: number) => void
  splitActive?: boolean
  onSplit?: () => void
  /** A secondary pane (split view): one toolbar row, no keyboard shortcuts. */
  compact?: boolean
  /** Owns the page and zoom keys. Only the main pane does. */
  keyboard?: boolean
}

/**
 * The PDF reader: two toolbar rows (navigation, find and zoom; then the tools), a thumbnail
 * strip, and the pages. Pages render only near the viewport.
 */
export const PdfPane = forwardRef<PdfPaneHandle, PdfPaneProps>(function PdfPane(props, ref) {
  const {
    sourceId,
    annotations,
    tool,
    onTool,
    color,
    onColor,
    locked,
    onLocked,
    compact,
    keyboard,
  } = props
  const pdf = useSharedPdf(sourceId)
  const doc = pdf.doc
  const root = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const findInput = useRef<HTMLInputElement>(null)
  const [ratio, setRatio] = useState(1.414)
  const [zoom, setZoom] = useState(1)
  const [fitPage, setFitPage] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [box, setBox] = useState({ w: 800, h: 700 })
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [thumbs, setThumbs] = useState(false)
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [selection, setSelection] = useState<{ x: number; y: number; text: string } | null>(null)
  const pages = useLive(['sources'], () => call('library:pages', { sourceId }), [sourceId])

  useEffect(() => {
    if (!doc) return
    void doc.getPage(1).then((p) => {
      const v = p.getViewport({ scale: 1 })
      setRatio(v.height / v.width)
    })
  }, [doc])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const measure = (): void => setBox({ w: element.clientWidth, h: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [pdf.status])

  const fitWidth = Math.max(320, Math.min(1100, box.w - 64))
  const fitPageWidth = Math.max(240, (box.h - 40) / ratio)
  const width = Math.round((fitPage ? Math.min(fitWidth, fitPageWidth) : fitWidth) * zoom)
  const numPages = doc?.numPages ?? 0

  const goTo = useCallback((number: number, y = 0) => {
    const element = document.getElementById(`pdf-page-${number}`)
    const scroll = scroller.current
    if (!element || !scroll) return
    const top = element.offsetTop + element.offsetHeight * y - (y > 0 ? 72 : 12)
    scroll.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
  }, [])
  useImperativeHandle(ref, () => ({ goTo, focusFind: () => findInput.current?.focus() }), [goTo])

  // Which page fills the view.
  useEffect(() => {
    const scroll = scroller.current
    if (!scroll || !numPages) return
    const onScroll = (): void => {
      const middle = scroll.scrollTop + scroll.clientHeight * 0.4
      let current = 1
      for (const el of scroll.querySelectorAll<HTMLElement>('[data-page]')) {
        if (el.offsetTop <= middle) current = Number(el.dataset['page'])
      }
      setPage((prev) => {
        if (prev !== current) {
          setPageInput(String(current))
          props.onVisiblePage?.(current)
        }
        return current
      })
    }
    scroll.addEventListener('scroll', onScroll, { passive: true })
    return () => scroll.removeEventListener('scroll', onScroll)
  }, [numPages, props])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle.length < 2) return []
    return (pages.data ?? [])
      .filter((p: PageText) => p.text.toLowerCase().includes(needle))
      .map((p) => p.number)
  }, [pages.data, query])
  const step = (delta: number): void => {
    if (!matches.length) return
    const next = (matchIndex + delta + matches.length) % matches.length
    setMatchIndex(next)
    goTo(matches[next] ?? 1)
  }

  const bookmarks = annotations.list.filter((a) => a.kind === 'bookmark')
  const bookmarkHere = bookmarks.find((a) => a.page === page)

  // Keyboard: pages, zoom, find, undo.
  useEffect(() => {
    if (!keyboard) return
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      const mod = isMac() ? e.metaKey : e.ctrlKey
      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        findInput.current?.focus()
        findInput.current?.select()
        return
      }
      if (typing) return
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void (e.shiftKey ? annotations.redo() : annotations.undo())
        return
      }
      if (mod || e.altKey) return
      if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault()
        goTo(Math.min(numPages, page + 1))
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault()
        goTo(Math.max(1, page - 1))
      } else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(3, z + 0.1))
      else if (e.key === '-' || e.key === '−') setZoom((z) => Math.max(0.4, z - 0.1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keyboard, annotations, goTo, numPages, page])

  // Text selection toolbar.
  const onMouseUp = (): void => {
    if (tool !== 'select') return
    requestAnimationFrame(() => {
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      const scroll = scroller.current
      if (!sel || !text || !scroll || sel.rangeCount === 0) return setSelection(null)
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      const host = scroll.getBoundingClientRect()
      setSelection({
        x: rect.left + rect.width / 2 - host.left,
        y: rect.top - host.top + scroll.scrollTop,
        text,
      })
    })
  }
  const markSelection = (kind: 'highlight' | 'underline'): void => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const byPage = new Map<number, number[][]>()
    for (const r of sel.getRangeAt(0).getClientRects()) {
      if (r.width < 1) continue
      const el = document
        .elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        ?.closest<HTMLElement>('[data-page]')
      if (!el) continue
      const p = el.getBoundingClientRect()
      const n = Number(el.dataset['page'])
      const list = byPage.get(n) ?? []
      list.push(
        [
          (r.left - p.left) / p.width,
          (r.top - p.top) / p.height,
          r.width / p.width,
          r.height / p.height,
        ].map((v) => Math.round(v * 10_000) / 10_000),
      )
      byPage.set(n, list)
    }
    for (const [n, rects] of byPage)
      void annotations.add({
        targetType: 'source',
        targetId: sourceId,
        page: n,
        kind,
        color,
        path: rects,
      })
    sel.removeAllRanges()
    setSelection(null)
  }

  if (pdf.status === 'failed')
    return (
      <div className="flex-1 p-8">
        <ErrorState title="Couldn’t load this PDF">
          The file may have moved. Import it again from the Library, then retry.
        </ErrorState>
      </div>
    )

  return (
    <div ref={root} className="flex min-w-0 flex-1 flex-col bg-canvas">
      {/* Row 1: pages, find, zoom */}
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 pt-2.5">
        <PillBar label="Pages">
          {compact ? null : (
            <PillButton
              label="Thumbnails"
              active={thumbs}
              icon={
                thumbs ? (
                  <LayoutGrid className="size-[18px]" />
                ) : (
                  <PanelLeft className="size-[18px]" />
                )
              }
              onClick={() => setThumbs((t) => !t)}
            />
          )}
          <PillButton
            label="Previous page"
            icon={<ChevronUp className="size-[18px]" />}
            onClick={() => goTo(Math.max(1, page - 1))}
          />
          <input
            value={pageInput}
            aria-label="Page number"
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') goTo(Math.min(numPages, Math.max(1, Number(pageInput) || 1)))
            }}
            className="h-7 w-9 rounded-md bg-sunken text-center tabular-nums outline-none focus:ring-2 focus:ring-focus"
          />
          <span className="pr-1 text-ink-3 tabular-nums">/ {numPages || '–'}</span>
          <PillButton
            label="Next page"
            icon={<ChevronDown className="size-[18px]" />}
            onClick={() => goTo(Math.min(numPages, page + 1))}
          />
        </PillBar>
        <PillBar label="Find" className="pl-2.5">
          <Search className="size-4 text-ink-3" aria-hidden />
          <input
            ref={findInput}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setMatchIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') step(e.shiftKey ? -1 : 1)
              if (e.key === 'Escape') setQuery('')
            }}
            placeholder="Find"
            aria-label="Find in document"
            className={cn(
              'bg-transparent px-1 text-ink outline-none placeholder:text-ink-3',
              compact ? 'w-20' : 'w-32',
            )}
          />
          <span className="min-w-8 text-center text-ink-3 tabular-nums">
            {matches.length
              ? `${matchIndex + 1}/${matches.length}`
              : query.trim().length >= 2
                ? '0/0'
                : ''}
          </span>
          <PillButton
            label="Previous result"
            icon={<ChevronUp className="size-4" />}
            onClick={() => step(-1)}
          />
          <PillButton
            label="Next result"
            icon={<ChevronDown className="size-4" />}
            onClick={() => step(1)}
          />
          <PillButton
            label="Clear find"
            icon={<X className="size-4" />}
            onClick={() => setQuery('')}
          />
        </PillBar>
        <PillBar label="Zoom">
          <PillButton
            label="Zoom out"
            icon={<Minus className="size-[18px]" />}
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
          />
          <span className="w-11 text-center text-ink-2 tabular-nums">
            {Math.round((width / Math.max(1, fitWidth)) * 100)}%
          </span>
          <PillButton
            label="Zoom in"
            icon={<Plus className="size-[18px]" />}
            onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
          />
          <PillDivider />
          <PillButton
            label="Fit width"
            active={!fitPage && zoom === 1}
            icon={<Expand className="size-[18px]" />}
            onClick={() => {
              setFitPage(false)
              setZoom(1)
            }}
          />
          <PillButton
            label="Fit page"
            active={fitPage && zoom === 1}
            icon={<Maximize className="size-[18px]" />}
            onClick={() => {
              setFitPage(true)
              setZoom(1)
            }}
          />
          <PillButton
            label="Rotate"
            icon={<RotateCw className="size-[18px]" />}
            onClick={() => setRotation((r) => (r + 90) % 360)}
          />
        </PillBar>
      </div>

      {/* Row 2: tools */}
      {compact ? null : (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 pt-2 pb-1">
          <PillBar label="Tools">
            {TOOLS.map((t) => (
              <PillButton
                key={t.tool}
                label={t.label}
                active={tool === t.tool}
                icon={t.icon}
                onClick={() => onTool(t.tool)}
                disabled={locked && t.tool !== 'select'}
              />
            ))}
            {props.canMarkQuestions ? (
              <>
                <PillDivider />
                <PillButton
                  label="Mark a question (draw a box around it)"
                  active={tool === 'question'}
                  icon={<SquareDashedMousePointer className="size-[18px]" />}
                  onClick={() => onTool('question')}
                  disabled={locked}
                />
              </>
            ) : null}
          </PillBar>
          {['highlight', 'underline', 'pen', 'marker'].includes(tool) ? (
            <PillBar label="Colour" className="px-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={color === c}
                  onClick={() => onColor(c)}
                  className={cn(
                    'size-5 rounded-full ring-offset-1 ring-offset-surface',
                    color === c && 'ring-2 ring-blue',
                  )}
                  style={{ background: c }}
                />
              ))}
              <Tooltip label="More colours">
                <label className="relative size-5 cursor-pointer overflow-hidden rounded-full bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => onColor(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Pick a colour"
                  />
                </label>
              </Tooltip>
            </PillBar>
          ) : null}
          <PillBar label="History">
            <PillButton
              label={`Undo (${isMac() ? '⌘Z' : 'Ctrl+Z'})`}
              icon={<Undo2 className="size-[18px]" />}
              disabled={!annotations.canUndo}
              onClick={() => void annotations.undo()}
            />
            <PillButton
              label={`Redo (${isMac() ? '⇧⌘Z' : 'Ctrl+Shift+Z'})`}
              icon={<Redo2 className="size-[18px]" />}
              disabled={!annotations.canRedo}
              onClick={() => void annotations.redo()}
            />
            <PillButton
              label="Clear my annotations"
              icon={<X className="size-[18px]" />}
              onClick={() => {
                if (
                  window.confirm(
                    'Clear all your annotations on this document? This cannot be undone.',
                  )
                )
                  void annotations.clearMine()
              }}
            />
            <PillButton
              label={bookmarkHere ? 'Remove bookmark' : 'Bookmark this page'}
              active={Boolean(bookmarkHere)}
              icon={<Bookmark className="size-[18px]" />}
              onClick={() =>
                void (bookmarkHere
                  ? annotations.remove(bookmarkHere)
                  : annotations.add({
                      targetType: 'source',
                      targetId: sourceId,
                      page,
                      kind: 'bookmark',
                    }))
              }
            />
            <PillDivider />
            <PillButton
              label={locked ? 'Unlock annotations' : 'Lock annotations'}
              active={locked}
              icon={
                locked ? <Lock className="size-[18px]" /> : <LockOpen className="size-[18px]" />
              }
              onClick={() => {
                onLocked(!locked)
                if (!locked) onTool('select')
              }}
            />
            <PillButton
              label="Full screen"
              icon={<Maximize className="size-[18px]" />}
              onClick={() =>
                document.fullscreenElement
                  ? void document.exitFullscreen()
                  : void root.current?.closest('[data-workspace]')?.requestFullscreen()
              }
            />
            {props.onSplit ? (
              <>
                <PillDivider />
                <PillButton
                  label="Split view with the report"
                  active={props.splitActive}
                  icon={<Columns2 className="size-[18px]" />}
                  onClick={props.onSplit}
                />
              </>
            ) : null}
          </PillBar>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {thumbs && doc ? (
          <div className="w-[104px] shrink-0 space-y-2 overflow-y-auto border-r border-line p-2">
            {Array.from({ length: numPages }, (_, i) => (
              <Thumb
                key={i}
                doc={doc}
                number={i + 1}
                current={page === i + 1}
                bookmarked={bookmarks.some((b) => b.page === i + 1)}
                onClick={() => goTo(i + 1)}
              />
            ))}
          </div>
        ) : null}
        <div
          ref={scroller}
          className="relative min-w-0 flex-1 overflow-auto"
          onMouseUp={onMouseUp}
          onScroll={() => selection && setSelection(null)}
        >
          <div className="flex flex-col gap-4 px-6 pt-3 pb-12">
            {doc ? (
              Array.from({ length: numPages }, (_, i) => (
                <Page
                  key={i + 1}
                  doc={doc}
                  number={i + 1}
                  width={width}
                  ratio={ratio}
                  rotation={rotation}
                  needle={query}
                  onPointer={tool === 'select' ? props.onPagePointer : undefined}
                >
                  {props.overlay?.(i + 1)}
                  <AnnotationLayer
                    page={i + 1}
                    sourceId={sourceId}
                    annotations={annotations.list}
                    tool={tool}
                    color={color}
                    locked={locked}
                    ratio={ratio}
                    onAdd={(v) => void annotations.add(v)}
                    onRemove={(a) => void annotations.remove(a)}
                    onArea={props.onArea}
                    onQuestionBox={props.onQuestionBox}
                  />
                </Page>
              ))
            ) : (
              <Skeleton className="mx-auto h-[860px] w-[620px] max-w-full" />
            )}
          </div>
          {selection ? (
            <div
              role="toolbar"
              aria-label="Selected text"
              className="absolute z-20 flex -translate-x-1/2 -translate-y-[calc(100%+8px)] items-center gap-0.5 rounded-lg bg-[#18181b] p-1 text-2xs font-medium text-white shadow-pop"
              style={{ left: selection.x, top: selection.y }}
              onMouseUp={(e) => e.stopPropagation()}
            >
              {(
                [
                  ['ask', 'Ask'],
                  ['explain', 'Explain simply'],
                  ['define', 'Define'],
                  ['examiner', 'What the examiner wants'],
                ] as const
              ).map(([action, label]) => (
                <button
                  key={action}
                  type="button"
                  className="h-7 rounded-md px-2 hover:bg-white/15"
                  onClick={() => {
                    props.onTextAction(action, selection.text)
                    setSelection(null)
                  }}
                >
                  {label}
                </button>
              ))}
              <span className="mx-0.5 h-4 w-px bg-white/25" />
              <button
                type="button"
                aria-label="Highlight"
                className="flex size-7 items-center justify-center rounded-md hover:bg-white/15"
                onClick={() => markSelection('highlight')}
              >
                <Highlighter className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Underline"
                className="flex size-7 items-center justify-center rounded-md hover:bg-white/15"
                onClick={() => markSelection('underline')}
              >
                <Underline className="size-4" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
})

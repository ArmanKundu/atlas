import { useRef, useState, type PointerEvent } from 'react'
import { Flag, MessageSquare } from 'lucide-react'
import type { Annotation, EntityInput, Region } from '@shared/models'
import { cn } from '@/lib/cn'
import { normaliseRegion } from '@/features/questions/regions'
import type { Tool } from './annotations'

type Point = { x: number; y: number }

/**
 * One page's drawing surface. Shows saved annotations and turns pointer input into new ones,
 * depending on the tool. In select mode it lets clicks and text selection through.
 */
export function AnnotationLayer({
  page,
  sourceId,
  annotations,
  tool,
  color,
  locked,
  ratio,
  onAdd,
  onRemove,
  onArea,
  onQuestionBox,
}: {
  page: number
  sourceId: string
  annotations: Annotation[]
  tool: Tool
  color: string
  locked: boolean
  /** Page height / width, so strokes keep their shape. */
  ratio: number
  onAdd: (values: EntityInput<'annotations'>) => void
  onRemove: (annotation: Annotation) => void
  onArea: (region: Region) => void
  onQuestionBox: (region: Region) => void
}) {
  const layer = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)
  const [stroke, setStroke] = useState<number[][]>([])
  const [comment, setComment] = useState<{ x: number; y: number; text: string } | null>(null)
  const drawing = !locked && tool !== 'select'
  const mine = annotations.filter((a) => a.page === page && a.kind !== 'bookmark')

  const point = (event: PointerEvent): Point => {
    const rect = layer.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }
  const base = { targetType: 'source' as const, targetId: sourceId, page, color }

  const finish = (end: Point): void => {
    if (!start) return
    const region = normaliseRegion(page, start.x, start.y, end.x, end.y)
    if (tool === 'pen' || tool === 'marker') {
      if (stroke.length > 1)
        onAdd({ ...base, kind: tool, path: stroke.map(([x, y]) => [round(x ?? 0), round(y ?? 0)]) })
    } else if (tool === 'comment' && !region) {
      setComment({ x: end.x, y: end.y, text: '' })
    } else if (tool === 'flag' && !region) {
      onAdd({ ...base, kind: 'flag', rect: { x: end.x, y: end.y } })
    } else if (region) {
      if (tool === 'highlight' || tool === 'underline')
        onAdd({
          ...base,
          kind: tool,
          rect: region,
          path: [[region.x, region.y, region.w, region.h]],
        })
      else if (tool === 'area') onArea(region)
      else if (tool === 'question') onQuestionBox(region)
    }
    setStart(null)
    setCurrent(null)
    setStroke([])
  }

  const draft =
    start && current ? normaliseRegion(page, start.x, start.y, current.x, current.y) : null

  return (
    <div
      ref={layer}
      data-annotation-layer
      className={cn('absolute inset-0 z-[2]', drawing ? 'cursor-crosshair' : 'pointer-events-none')}
      onPointerDown={(e) => {
        if (!drawing || e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        const p = point(e)
        setStart(p)
        setCurrent(p)
        if (tool === 'pen' || tool === 'marker') setStroke([[p.x, p.y]])
      }}
      onPointerMove={(e) => {
        if (!start) return
        const p = point(e)
        setCurrent(p)
        if (tool === 'pen' || tool === 'marker') setStroke((s) => [...s, [p.x, p.y]])
      }}
      onPointerUp={(e) => finish(point(e))}
      onPointerCancel={() => {
        setStart(null)
        setStroke([])
      }}
    >
      <svg
        viewBox={`0 0 1000 ${1000 * ratio}`}
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full"
      >
        {mine.map((a) => {
          const c = a.color ?? '#facc15'
          if (a.kind === 'highlight')
            return a.path.map((r, i) => (
              <rect
                key={`${a.id}-${i}`}
                x={(r[0] ?? 0) * 1000}
                y={(r[1] ?? 0) * 1000 * ratio}
                width={(r[2] ?? 0) * 1000}
                height={(r[3] ?? 0) * 1000 * ratio}
                fill={c}
                opacity={0.35}
                style={{ mixBlendMode: 'multiply' }}
              />
            ))
          if (a.kind === 'underline')
            return a.path.map((r, i) => {
              const y = ((r[1] ?? 0) + (r[3] ?? 0)) * 1000 * ratio
              return (
                <line
                  key={`${a.id}-${i}`}
                  x1={(r[0] ?? 0) * 1000}
                  x2={((r[0] ?? 0) + (r[2] ?? 0)) * 1000}
                  y1={y}
                  y2={y}
                  stroke={c}
                  strokeWidth={2.5}
                />
              )
            })
          if (a.kind === 'pen' || a.kind === 'marker')
            return (
              <polyline
                key={a.id}
                points={a.path
                  .map(([x, y]) => `${(x ?? 0) * 1000},${(y ?? 0) * 1000 * ratio}`)
                  .join(' ')}
                fill="none"
                stroke={c}
                strokeWidth={a.kind === 'marker' ? 14 : 2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={a.kind === 'marker' ? 0.35 : 1}
              />
            )
          return null
        })}
        {stroke.length > 1 ? (
          <polyline
            points={stroke
              .map(([x, y]) => `${(x ?? 0) * 1000},${(y ?? 0) * 1000 * ratio}`)
              .join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={tool === 'marker' ? 14 : 2.6}
            strokeLinecap="round"
            opacity={tool === 'marker' ? 0.35 : 1}
          />
        ) : null}
      </svg>
      {mine
        .filter((a) => a.kind === 'comment' || a.kind === 'flag')
        .map((a) => (
          <button
            key={a.id}
            type="button"
            title={a.kind === 'comment' ? (a.bodyMd ?? 'Comment') : 'Flagged. Click to remove.'}
            aria-label={a.kind === 'comment' ? `Comment: ${a.bodyMd ?? ''}` : 'Flag'}
            onClick={() =>
              a.kind === 'flag' || window.confirm('Remove this comment?') ? onRemove(a) : undefined
            }
            className="pointer-events-auto absolute -translate-x-1/2 -translate-y-full rounded-md bg-surface p-1 text-ink shadow-pop"
            style={{
              left: `${(a.rect.x ?? 0) * 100}%`,
              top: `${(a.rect.y ?? 0) * 100}%`,
              color: a.color ?? undefined,
            }}
          >
            {a.kind === 'comment' ? (
              <MessageSquare className="size-3.5" aria-hidden />
            ) : (
              <Flag className="size-3.5" aria-hidden />
            )}
          </button>
        ))}
      {comment ? (
        <form
          className="pointer-events-auto absolute z-10 flex w-56 flex-col gap-1.5 rounded-lg bg-surface p-2 shadow-pop"
          style={{
            left: `min(${comment.x * 100}%, calc(100% - 15rem))`,
            top: `${comment.y * 100}%`,
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault()
            if (comment.text.trim())
              onAdd({
                ...base,
                kind: 'comment',
                rect: { x: comment.x, y: comment.y },
                bodyMd: comment.text.trim(),
              })
            setComment(null)
          }}
        >
          <textarea
            autoFocus
            aria-label="Comment"
            value={comment.text}
            onChange={(e) => setComment({ ...comment, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setComment(null)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder="Add a comment"
            className="min-h-14 resize-none rounded-md bg-sunken px-2 py-1.5 text-ui text-ink outline-none"
          />
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setComment(null)}
              className="h-7 rounded-md px-2 text-2xs text-ink-2 hover:bg-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-7 rounded-md bg-accent px-2.5 text-2xs font-medium text-accent-fg"
            >
              Add
            </button>
          </div>
        </form>
      ) : null}
      {draft && tool !== 'pen' && tool !== 'marker' ? (
        <div
          aria-hidden
          className={cn(
            'absolute rounded-[2px]',
            tool === 'question' || tool === 'area'
              ? 'border-2 border-dashed border-blue bg-blue/10'
              : '',
            tool === 'underline' ? 'border-b-2' : '',
          )}
          style={{
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: `${draft.w * 100}%`,
            height: `${draft.h * 100}%`,
            background: tool === 'highlight' ? `${color}59` : undefined,
            borderColor: tool === 'underline' ? color : undefined,
          }}
        />
      ) : null}
    </div>
  )
}

const round = (v: number): number => Math.round(v * 10_000) / 10_000

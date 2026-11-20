import { useRef, useState, type PointerEvent } from 'react'
import type { Question, Region } from '@shared/models'
import { cn } from '@/lib/cn'
import { questionTitle } from './data'
import { normaliseRegion } from './regions'

/**
 * Sits over one PDF page. Shows the boxes of questions on that page and, while drawing is on,
 * turns a drag into a new box.
 */
export function PageOverlay({
  page,
  questions,
  selectedId,
  drawing,
  onSelect,
  onDraw,
}: {
  page: number
  questions: Question[]
  selectedId: string | null
  drawing: boolean
  onSelect: (id: string) => void
  onDraw: (region: Region) => void
}) {
  const layer = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)

  const point = (event: PointerEvent): { x: number; y: number } => {
    const rect = layer.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    }
  }

  const boxes = questions.flatMap((question) =>
    question.regions
      .map((region, index) => ({ question, region, index }))
      .filter(({ region }) => region.page === page),
  )
  const draft =
    start && current ? normaliseRegion(page, start.x, start.y, current.x, current.y) : null

  return (
    <div
      ref={layer}
      className={cn('absolute inset-0', drawing && 'cursor-crosshair')}
      onPointerDown={(event) => {
        if (!drawing || event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const p = point(event)
        setStart(p)
        setCurrent(p)
      }}
      onPointerMove={(event) => {
        if (start) setCurrent(point(event))
      }}
      onPointerUp={(event) => {
        if (!start) return
        const end = point(event)
        const region = normaliseRegion(page, start.x, start.y, end.x, end.y)
        setStart(null)
        setCurrent(null)
        if (region) onDraw(region)
      }}
      onPointerCancel={() => {
        setStart(null)
        setCurrent(null)
      }}
    >
      {boxes.map(({ question, region, index }) => {
        const selected = question.id === selectedId
        return (
          <button
            key={`${question.id}-${index}`}
            type="button"
            aria-label={`Open ${questionTitle(question)}`}
            aria-pressed={selected}
            onClick={() => onSelect(question.id)}
            className={cn(
              'group absolute rounded-[3px] ring-2 transition-colors',
              drawing && 'pointer-events-none',
              selected
                ? 'bg-blue/10 ring-blue'
                : 'bg-blue/[0.03] ring-blue/35 hover:bg-blue/[0.07] hover:ring-blue/70',
            )}
            style={{
              left: `${region.x * 100}%`,
              top: `${region.y * 100}%`,
              width: `${region.w * 100}%`,
              height: `${region.h * 100}%`,
            }}
          >
            {index === 0 ? (
              <span
                className={cn(
                  'absolute -top-2.5 -left-0.5 rounded-[4px] px-1.5 py-px text-2xs font-semibold text-white',
                  selected ? 'bg-blue' : 'bg-blue/70 group-hover:bg-blue',
                )}
              >
                {question.number ? `Q${question.number}` : 'Q'}
                {question.marks !== null ? ` · ${question.marks}` : ''}
              </span>
            ) : null}
          </button>
        )
      })}
      {draft ? (
        <div
          aria-hidden
          className="absolute rounded-[3px] border-2 border-dashed border-blue bg-blue/10"
          style={{
            left: `${draft.x * 100}%`,
            top: `${draft.y * 100}%`,
            width: `${draft.w * 100}%`,
            height: `${draft.h * 100}%`,
          }}
        />
      ) : null}
    </div>
  )
}

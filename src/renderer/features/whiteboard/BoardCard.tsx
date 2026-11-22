import { useEffect, useMemo, useRef } from 'react'
import { Play, Presentation } from 'lucide-react'
import { BOARD_H, BOARD_W, parseBoard } from '@shared/whiteboard'
import { drawPiece, paper, plan } from './draw'
import { openBoard } from './store'

/** An ```atlas-board block in a chat answer: a preview of the finished board and a Play button. */
export function BoardCard({ code }: { code: string }) {
  const board = useMemo(() => parseBoard(code), [code])
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx || !board) return
    const scale = el.width / BOARD_W
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    paper(ctx)
    const state = { axes: null }
    for (const step of board.steps) {
      for (const piece of plan(step.draw, state)) {
        if (piece.kind === 'clear') paper(ctx)
        else drawPiece(ctx, piece, 1)
      }
    }
  }, [board])

  if (!board) return <pre className="text-2xs text-ink-3">{code}</pre>
  return (
    <button
      type="button"
      onClick={() => openBoard(board)}
      className="not-prose group my-2 flex w-full items-center gap-4 rounded-xl p-2 pr-4 text-left ring-1 ring-line transition-colors hover:bg-sunken"
    >
      <span className="relative shrink-0 overflow-hidden rounded-lg ring-1 ring-line">
        <canvas
          ref={canvas}
          width={224}
          height={Math.round((224 * BOARD_H) / BOARD_W)}
          className="block w-28"
        />
        <span className="absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/10">
          <span className="grid size-8 place-items-center rounded-full bg-ink text-surface shadow-pop">
            <Play className="size-3.5 translate-x-px fill-current" aria-hidden />
          </span>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-2xs font-medium tracking-wide text-ink-3 uppercase">
          <Presentation className="size-3.5" aria-hidden /> Whiteboard
        </span>
        <span className="mt-0.5 block truncate font-semibold text-ink">{board.title}</span>
        <span className="block text-2xs text-ink-3">
          {board.steps.length} steps · drawn and read aloud
        </span>
      </span>
    </button>
  )
}

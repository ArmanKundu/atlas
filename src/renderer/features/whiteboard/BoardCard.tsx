import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Play, Presentation } from 'lucide-react'
import { BOARD_H, BOARD_W, parseBoard, parseBoardPartial } from '@shared/whiteboard'
import { useLive } from '@/lib/api'
import { call } from '@/lib/ipc'
import { useSetting } from '@/lib/settings'
import { drawCursor, drawPiece, paper, plan, type Piece } from './draw'
import { openBoard } from './store'
import { speakCached } from './voice-cache'

const SCALE = 2
/** The card draws faster than the player: it is a preview of the work. */
const PREVIEW_SPEED = 2.5

/**
 * An ```atlas-board block in a chat answer. While the assistant is still writing (`live`) the
 * card draws each step as soon as it is complete, so you can watch the board take shape, and
 * starts making the voice for it. When it is done, Play opens the full player.
 */
export function BoardCard({ code, live = false }: { code: string; live?: boolean }) {
  const board = useMemo(() => (live ? parseBoardPartial(code) : parseBoard(code)), [code, live])
  const canvas = useRef<HTMLCanvasElement>(null)
  const base = useRef<HTMLCanvasElement | null>(null)
  const drawn = useRef(0)
  const [voiceOn] = useSetting<boolean>('whiteboard.voice', true)
  const [voiceId] = useSetting<string>('whiteboard.voiceId', 'af_heart')
  const voice = useLive([], () => call('voice:status'))
  const [voiced, setVoiced] = useState<Set<number>>(() => new Set())

  const pieces = useMemo(() => {
    if (!board) return []
    const state = { axes: null }
    return board.steps.flatMap((step) => plan(step.draw, state))
  }, [board])

  // Draw new pieces one after another with the pen; earlier ones stay on a base layer.
  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    if (!base.current) {
      const b = document.createElement('canvas')
      b.width = BOARD_W * SCALE
      b.height = BOARD_H * SCALE
      const bctx = b.getContext('2d')
      if (bctx) {
        bctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
        paper(bctx)
      }
      base.current = b
    }
    const layer = base.current
    const bctx = layer.getContext('2d')
    if (!bctx) return
    // A finished card that was never animated (e.g. an old chat): draw it all at once.
    if (!live && drawn.current === 0) {
      for (const piece of pieces) commit(bctx, piece)
      drawn.current = pieces.length
    }
    let frame = 0
    let started = performance.now()
    const tick = (now: number): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(layer, 0, 0, el.width, el.height)
      const piece = pieces[drawn.current]
      if (!piece) return
      const ms = piece.kind === 'clear' ? 0 : piece.ms / PREVIEW_SPEED
      const f = ms ? (now - started) / ms : 1
      if (f >= 1) {
        commit(bctx, piece)
        drawn.current++
        started = now
      } else {
        ctx.setTransform(el.width / BOARD_W, 0, 0, el.width / BOARD_W, 0, 0)
        const tip = drawPiece(ctx, piece, f)
        if (tip && piece.kind !== 'clear') drawCursor(ctx, tip, piece.color)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [pieces, live])

  // Make the voice for each step as soon as the step is written, so Play starts quickly.
  const voiceReady = voice.data === 'ready'
  useEffect(() => {
    if (!board || !voiceOn || !voiceReady) return
    let alive = true
    board.steps.forEach((step, i) => {
      void speakCached(step.say, voiceId).then(() => {
        if (alive) setVoiced((s) => (s.has(i) ? s : new Set(s).add(i)))
      })
    })
    return () => {
      alive = false
    }
  }, [board, voiceOn, voiceReady, voiceId])

  if (!live && !board) return <pre className="text-2xs text-ink-3">{code}</pre>

  const steps = board?.steps.length ?? 0
  const ready = Math.min(voiced.size, steps)
  const status = live
    ? steps === 0
      ? 'Planning the board…'
      : `Drafting · step ${steps} written`
    : voiceOn && voiceReady && ready < steps
      ? `Preparing the voice · ${ready} of ${steps}`
      : `Ready · ${steps} steps, drawn and read aloud`
  const busy = live || (voiceOn && voiceReady && ready < steps)

  return (
    <div className="not-prose my-3 overflow-hidden rounded-xl ring-1 ring-line">
      <div className="relative bg-[#fbfbf9]">
        <canvas
          ref={canvas}
          width={BOARD_W * SCALE}
          height={BOARD_H * SCALE}
          className="block aspect-[1000/625] w-full"
          aria-label={board ? `Whiteboard: ${board.title}` : 'Whiteboard being drafted'}
        />
        {!live && board ? (
          <button
            type="button"
            onClick={() => openBoard(board)}
            className="group absolute inset-0 grid place-items-center bg-black/0 transition-colors hover:bg-black/5"
            aria-label={`Play ${board.title}`}
          >
            <span className="grid size-12 place-items-center rounded-full bg-ink text-surface shadow-pop transition-transform group-hover:scale-105">
              <Play className="size-5 translate-x-px fill-current" aria-hidden />
            </span>
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-3 border-t border-line px-3 py-2">
        <Presentation className="size-4 shrink-0 text-ink-3" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{board?.title ?? 'Whiteboard'}</p>
          <p className="flex items-center gap-1.5 text-2xs text-ink-3">
            {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            {status}
          </p>
        </div>
        {!live && board ? (
          <button
            type="button"
            onClick={() => openBoard(board)}
            className="rounded-md bg-ink px-3 py-1.5 text-2xs font-semibold text-surface"
          >
            Play
          </button>
        ) : null}
      </div>
    </div>
  )
}

function commit(ctx: CanvasRenderingContext2D, piece: Piece): void {
  if (piece.kind === 'clear') paper(ctx)
  else drawPiece(ctx, piece, 1)
}

import { BOARD_H, BOARD_W, compileFormula, type BoardColor, type BoardOp } from '@shared/whiteboard'

export const INK: Record<BoardColor, string> = {
  ink: '#1f2328',
  blue: '#2563eb',
  red: '#dc2626',
  green: '#16a34a',
  orange: '#f59e0b',
  purple: '#7c3aed',
}
export const HAND = '"Caveat", "Newsreader Variable", serif'

type Pt = [number, number]
type Tool = 'pen' | 'marker' | 'highlighter'

/** One thing the pen does: a stroke, some words, or wiping the board. */
export type Piece =
  | {
      kind: 'path'
      points: Pt[]
      color: string
      tool: Tool
      length: number
      ms: number
      /** Overrides the tool's line width (highlighting a tall row). */
      width?: number
    }
  | { kind: 'text'; x: number; y: number; text: string; size: number; color: string; ms: number }
  | { kind: 'clear'; ms: number }

interface Axes {
  x: number
  y: number
  w: number
  h: number
  xmin: number
  xmax: number
  ymin: number
  ymax: number
}

/** Pen speed in board pixels per second; highlighters sweep faster. */
const SPEED: Record<Tool, number> = { pen: 650, marker: 600, highlighter: 1100 }

function length(points: Pt[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (a && b) total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return total
}

type PathPiece = Extract<Piece, { kind: 'path' }>

function path(points: Pt[], color: BoardColor, tool: Tool): PathPiece {
  const len = length(points)
  return {
    kind: 'path',
    points,
    color: INK[color],
    tool,
    length: len,
    ms: Math.max(140, (len / SPEED[tool]) * 1000),
  }
}

function text(x: number, y: number, words: string, size: number, color: BoardColor): Piece {
  return {
    kind: 'text',
    x,
    y,
    text: words,
    size,
    color: INK[color],
    ms: Math.min(2400, 180 + words.length * 55),
  }
}

/** A board position for a graph point on the current axes. */
function toBoard(a: Axes, gx: number, gy: number): Pt {
  return [
    a.x + ((gx - a.xmin) / (a.xmax - a.xmin)) * a.w,
    a.y + a.h - ((gy - a.ymin) / (a.ymax - a.ymin)) * a.h,
  ]
}

function niceStep(range: number): number {
  const raw = range / 8
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

/**
 * Turns a step's drawing commands into pen pieces. `state` carries the latest axes from one
 * step to the next, so a later step can plot on axes drawn earlier.
 */
export function plan(ops: BoardOp[], state: { axes: Axes | null }): Piece[] {
  const out: Piece[] = []
  for (const op of ops) {
    switch (op.t) {
      case 'text':
        out.push(text(op.x, op.y, op.text, op.size, op.color))
        break
      case 'line':
        out.push(path([op.from, op.to], op.color, op.tool))
        break
      case 'arrow': {
        const [x1, y1] = op.from
        const [x2, y2] = op.to
        const angle = Math.atan2(y2 - y1, x2 - x1)
        const head = 16
        out.push(path([op.from, op.to], op.color, op.tool))
        out.push(
          path(
            [
              [x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45)],
              [x2, y2],
              [x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45)],
            ],
            op.color,
            op.tool,
          ),
        )
        break
      }
      case 'rect':
        out.push(
          path(
            [
              [op.x, op.y],
              [op.x + op.w, op.y],
              [op.x + op.w, op.y + op.h],
              [op.x, op.y + op.h],
              [op.x, op.y],
            ],
            op.color,
            op.tool,
          ),
        )
        break
      case 'circle': {
        const points: Pt[] = []
        for (let i = 0; i <= 64; i++) {
          const a = -Math.PI / 2 + (i / 64) * Math.PI * 2
          points.push([op.x + op.r * Math.cos(a), op.y + op.r * Math.sin(a)])
        }
        out.push(path(points, op.color, op.tool))
        break
      }
      case 'poly': {
        const first = op.points[0]
        const points = op.close && first ? [...op.points, first] : op.points
        if (points.length > 1) out.push(path(points, op.color, op.tool))
        break
      }
      case 'dot': {
        const points: Pt[] = []
        for (let i = 0; i <= 12; i++) {
          const a = (i / 12) * Math.PI * 2
          points.push([op.x + 4 * Math.cos(a), op.y + 4 * Math.sin(a)])
        }
        out.push(path(points, op.color, 'marker'))
        if (op.label) out.push(text(op.x + 10, op.y - 10, op.label, 26, op.color))
        break
      }
      case 'angle': {
        const r = (op.dir * Math.PI) / 180
        const u: Pt = [Math.cos(r), Math.sin(r)]
        const v: Pt = [Math.cos(r - Math.PI / 2), Math.sin(r - Math.PI / 2)]
        const s = op.size
        out.push(
          path(
            [
              [op.x + u[0] * s, op.y + u[1] * s],
              [op.x + (u[0] + v[0]) * s, op.y + (u[1] + v[1]) * s],
              [op.x + v[0] * s, op.y + v[1] * s],
            ],
            op.color,
            op.tool,
          ),
        )
        break
      }
      case 'axes': {
        const a: Axes = { ...op }
        state.axes = a
        if (op.grid) {
          const sx = niceStep(op.xmax - op.xmin)
          for (let gx = Math.ceil(op.xmin / sx) * sx; gx <= op.xmax; gx += sx) {
            if (Math.abs(gx) < 1e-9) continue
            out.push({
              ...path([toBoard(a, gx, op.ymin), toBoard(a, gx, op.ymax)], 'ink', 'pen'),
              color: '#d6d9de',
              ms: 40,
            })
          }
          const sy = niceStep(op.ymax - op.ymin)
          for (let gy = Math.ceil(op.ymin / sy) * sy; gy <= op.ymax; gy += sy) {
            if (Math.abs(gy) < 1e-9) continue
            out.push({
              ...path([toBoard(a, op.xmin, gy), toBoard(a, op.xmax, gy)], 'ink', 'pen'),
              color: '#d6d9de',
              ms: 40,
            })
          }
        }
        const y0 = Math.min(Math.max(0, op.ymin), op.ymax)
        const x0 = Math.min(Math.max(0, op.xmin), op.xmax)
        out.push(path([toBoard(a, op.xmin, y0), toBoard(a, op.xmax, y0)], op.color, op.tool))
        out.push(path([toBoard(a, x0, op.ymin), toBoard(a, x0, op.ymax)], op.color, op.tool))
        const [ex, ey] = toBoard(a, op.xmax, y0)
        const [tx, ty] = toBoard(a, x0, op.ymax)
        if (op.xlabel) out.push(text(ex + 8, ey + 8, op.xlabel, 26, op.color))
        if (op.ylabel) out.push(text(tx + 8, ty + 4, op.ylabel, 26, op.color))
        break
      }
      case 'curve': {
        const a = state.axes ?? {
          x: 80,
          y: 60,
          w: BOARD_W - 160,
          h: BOARD_H - 120,
          xmin: -10,
          xmax: 10,
          ymin: -5,
          ymax: 5,
        }
        const f = compileFormula(op.fn)
        if (!f) break
        const from = op.from ?? a.xmin
        const to = op.to ?? a.xmax
        const n = 400
        let run: Pt[] = []
        let last: number | null = null
        const span = a.ymax - a.ymin
        const flush = (): void => {
          if (run.length > 1) out.push(path(run, op.color, op.tool))
          run = []
        }
        for (let i = 0; i <= n; i++) {
          const gx = from + ((to - from) * i) / n
          const gy = f(gx)
          // Break the line at asymptotes (tan x) and where the curve leaves the axes.
          if (!Number.isFinite(gy) || gy < a.ymin - span || gy > a.ymax + span) {
            flush()
            last = null
            continue
          }
          if (last !== null && Math.abs(gy - last) > span * 0.8) flush()
          last = gy
          const clamped = Math.min(Math.max(gy, a.ymin), a.ymax)
          if (clamped !== gy) {
            run.push(toBoard(a, gx, clamped))
            flush()
            continue
          }
          run.push(toBoard(a, gx, gy))
        }
        flush()
        if (op.label) {
          const lx = to - (to - from) * 0.12
          const ly = f(lx)
          if (Number.isFinite(ly)) {
            const [bx, by] = toBoard(a, lx, Math.min(Math.max(ly, a.ymin), a.ymax))
            out.push(text(bx + 6, by - 14, op.label, 26, op.color))
          }
        }
        break
      }
      case 'highlight':
        out.push({
          ...path(
            [
              [op.x, op.y + op.h / 2],
              [op.x + op.w, op.y + op.h / 2],
            ],
            op.color,
            'highlighter',
          ),
          width: Math.max(12, op.h),
        } as Piece)
        break
      case 'clear':
        state.axes = null
        out.push({ kind: 'clear', ms: 450 })
        break
    }
  }
  return out
}

const WIDTH: Record<Tool, number> = { pen: 3, marker: 5.5, highlighter: 20 }

function strokeStyle(ctx: CanvasRenderingContext2D, piece: Extract<Piece, { kind: 'path' }>): void {
  ctx.strokeStyle = piece.color
  ctx.lineWidth = piece.width ?? WIDTH[piece.tool]
  ctx.lineCap = piece.tool === 'highlighter' ? 'butt' : 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = piece.tool === 'highlighter' ? 0.32 : 1
  ctx.globalCompositeOperation = piece.tool === 'highlighter' ? 'multiply' : 'source-over'
}

/**
 * Draws `piece` up to `fraction` (0 to 1) and returns where the pen tip is, so the cursor can
 * follow it.
 */
export function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  fraction: number,
): Pt | null {
  const f = Math.min(1, Math.max(0, fraction))
  if (piece.kind === 'clear') return null
  ctx.save()
  if (piece.kind === 'text') {
    ctx.font = `600 ${piece.size}px ${HAND}`
    ctx.fillStyle = piece.color
    ctx.textBaseline = 'alphabetic'
    const shown = piece.text.slice(0, Math.ceil(piece.text.length * f))
    ctx.fillText(shown, piece.x, piece.y)
    const w = ctx.measureText(shown).width
    ctx.restore()
    return [piece.x + w, piece.y - piece.size * 0.25]
  }
  strokeStyle(ctx, piece)
  const target = piece.length * f
  let walked = 0
  let tip: Pt | null = piece.points[0] ?? null
  ctx.beginPath()
  const first = piece.points[0]
  if (first) ctx.moveTo(first[0], first[1])
  for (let i = 1; i < piece.points.length; i++) {
    const a = piece.points[i - 1]
    const b = piece.points[i]
    if (!a || !b) continue
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (walked + seg >= target) {
      const t = seg === 0 ? 1 : (target - walked) / seg
      tip = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      ctx.lineTo(tip[0], tip[1])
      break
    }
    walked += seg
    ctx.lineTo(b[0], b[1])
    tip = b
  }
  ctx.stroke()
  ctx.restore()
  return tip
}

/** Paints the paper: off-white with a faint dot grid, like a real whiteboard. */
export function paper(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#fbfbf9'
  ctx.fillRect(0, 0, BOARD_W, BOARD_H)
  ctx.fillStyle = '#e4e4df'
  for (let x = 25; x < BOARD_W; x += 25)
    for (let y = 25; y < BOARD_H; y += 25) ctx.fillRect(x, y, 1.4, 1.4)
  ctx.restore()
}

/** The pen cursor, drawn on the board itself so it shows up in recorded videos. */
export function drawCursor(ctx: CanvasRenderingContext2D, tip: Pt, color: string): void {
  const [x, y] = tip
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.translate(x, y)
  ctx.rotate(-Math.PI / 4)
  ctx.shadowColor = 'rgba(0,0,0,0.18)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 3
  // Barrel, then the nib touching the board at (0, 0).
  ctx.fillStyle = '#2b2f36'
  ctx.beginPath()
  ctx.roundRect(-5, -64, 10, 50, 3)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = color
  ctx.fillRect(-5, -64, 10, 9)
  ctx.fillStyle = '#c9ccd1'
  ctx.beginPath()
  ctx.moveTo(-5, -14)
  ctx.lineTo(5, -14)
  ctx.lineTo(0, 0)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(0, -1.5, 1.8, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

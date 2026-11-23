import { z } from 'zod'

/**
 * A whiteboard explanation the assistant writes as an ```atlas-board block. Atlas draws it step
 * by step with a moving pen and reads each step aloud. Coordinates are on a 1000 × 625 board,
 * origin top left.
 */
export const BOARD_W = 1000
export const BOARD_H = 625

export const BOARD_COLORS = ['ink', 'blue', 'red', 'green', 'orange', 'purple'] as const
export type BoardColor = (typeof BOARD_COLORS)[number]
export const BOARD_TOOLS = ['pen', 'marker', 'highlighter'] as const

const num = z.coerce.number().catch(0)
const pt = z.tuple([num, num])
const color = z.enum(BOARD_COLORS).catch('ink')
const tool = z.enum(BOARD_TOOLS).catch('pen')
const style = { color: color.default('ink'), tool: tool.default('pen') }

export const BoardOpSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('text'),
    x: num,
    y: num,
    text: z.string().max(300),
    size: num.default(30),
    /** `left`: (x, y) is the start of the line of text; `center`: the middle of the text. */
    align: z.enum(['left', 'center']).catch('left').default('left'),
    ...style,
  }),
  z.object({ t: z.literal('line'), from: pt, to: pt, ...style }),
  z.object({ t: z.literal('arrow'), from: pt, to: pt, ...style }),
  z.object({ t: z.literal('rect'), x: num, y: num, w: num, h: num, ...style }),
  z.object({ t: z.literal('circle'), x: num, y: num, r: num, ...style }),
  z.object({
    t: z.literal('poly'),
    points: z.array(pt).max(60),
    close: z.boolean().default(false),
    ...style,
  }),
  z.object({
    t: z.literal('dot'),
    x: num,
    y: num,
    label: z.string().max(40).default(''),
    ...style,
  }),
  /** A small square marking a right angle at corner (x, y), opening towards `dir` in degrees. */
  z.object({
    t: z.literal('angle'),
    x: num,
    y: num,
    dir: num.default(0),
    size: num.default(18),
    ...style,
  }),
  /** Axes for graphs. Curves after it are plotted on the most recent axes. */
  z.object({
    t: z.literal('axes'),
    x: num,
    y: num,
    w: num,
    h: num,
    xmin: num.default(-10),
    xmax: num.default(10),
    ymin: num.default(-5),
    ymax: num.default(5),
    xlabel: z.string().max(20).default('x'),
    ylabel: z.string().max(20).default('y'),
    grid: z.boolean().default(true),
    ...style,
  }),
  /** y = fn(x), e.g. "sin(x)", "2*x^2 - 3", "tan(x)". */
  z.object({
    t: z.literal('curve'),
    fn: z.string().max(120),
    from: num.optional(),
    to: num.optional(),
    label: z.string().max(40).default(''),
    ...style,
  }),
  z.object({
    t: z.literal('highlight'),
    x: num,
    y: num,
    w: num,
    h: num,
    color: color.default('orange'),
  }),
  z.object({ t: z.literal('clear') }),
])
export type BoardOp = z.infer<typeof BoardOpSchema>

export const BoardStepSchema = z.object({
  say: z.string().max(1200).default(''),
  draw: z.array(z.unknown()).max(40).default([]),
})

export const BoardSchema = z.object({
  title: z.string().max(120).default('Whiteboard'),
  steps: z.array(BoardStepSchema).min(1).max(30),
})

export interface Board {
  title: string
  steps: { say: string; draw: BoardOp[] }[]
}

/* ---------- Shapes Atlas works out itself ---------- */

type P = [number, number]
const shapeStyle = { color: color.default('ink'), tool: tool.default('pen') }
const labelColor = color.default('blue')

/**
 * Higher-level shapes. The assistant names the shape and Atlas does the geometry, so squares are
 * square, right-angle marks sit in the corner, and labels sit outside the lines.
 */
const ShapeSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('square'), x: num, y: num, size: num, ...shapeStyle }),
  z.object({
    t: z.literal('triangle'),
    points: z.tuple([pt, pt, pt]),
    /** Names of the corners, e.g. ["A", "B", "C"]. */
    vertices: z.array(z.string().max(12)).max(3).default([]),
    /** Labels of the sides AB, BC and CA. Empty strings are skipped. */
    sides: z.array(z.string().max(24)).max(3).default([]),
    /** Index (0, 1 or 2) of the corner that is a right angle. */
    right: z.coerce.number().int().min(0).max(2).optional().catch(undefined),
    labelColor,
    ...shapeStyle,
  }),
  /** A square standing on the segment from → to, on the side away from `away`. */
  z.object({
    t: z.literal('squareOn'),
    from: pt,
    to: pt,
    away: pt.optional(),
    label: z.string().max(24).default(''),
    labelColor,
    ...shapeStyle,
  }),
  /** Text beside the middle of a segment, on the side away from `away`. */
  z.object({
    t: z.literal('label'),
    from: pt,
    to: pt,
    away: pt.optional(),
    text: z.string().max(40),
    size: num.default(30),
    /** Where along the segment, from 0 (at "from") to 1 (at "to"). */
    at: z.coerce.number().min(0).max(1).catch(0.5).default(0.5),
    color: labelColor,
  }),
])

const CENTRE: P = [BOARD_W / 2, BOARD_H / 2]
const sub2 = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]]
const add2 = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]]
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k]
const len = (a: P): number => Math.hypot(a[0], a[1]) || 1
const unit = (a: P): P => mul(a, 1 / len(a))

/** The unit normal of a segment that points away from `away`. */
function outward(from: P, to: P, away: P): P {
  const d = unit(sub2(to, from))
  const n: P = [-d[1], d[0]]
  const mid = mul(add2(from, to), 0.5)
  const toAway = sub2(away, mid)
  return n[0] * toAway[0] + n[1] * toAway[1] > 0 ? mul(n, -1) : n
}

function labelOp(
  from: P,
  to: P,
  away: P,
  words: string,
  size: number,
  c: BoardColor,
  at = 0.5,
): BoardOp {
  const mid = add2(from, mul(sub2(to, from), at))
  const n = outward(from, to, away)
  const gap = size * 0.75 + 6
  const spot = add2(mid, mul(n, gap))
  return {
    t: 'text',
    x: spot[0],
    y: spot[1] + size * 0.35,
    text: words,
    size,
    align: 'center',
    color: c,
    tool: 'pen',
  }
}

/** A right-angle mark at corner v between the sides towards a and b. */
function rightMark(v: P, a: P, b: P, c: BoardColor): BoardOp {
  const s = Math.min(22, len(sub2(a, v)) * 0.22, len(sub2(b, v)) * 0.22)
  const u = mul(unit(sub2(a, v)), s)
  const w = mul(unit(sub2(b, v)), s)
  return {
    t: 'poly',
    points: [add2(v, u), add2(add2(v, u), w), add2(v, w)],
    close: false,
    color: c,
    tool: 'pen',
  }
}

function expandShape(shape: z.infer<typeof ShapeSchema>): BoardOp[] {
  switch (shape.t) {
    case 'square':
      return [
        {
          t: 'rect',
          x: shape.x,
          y: shape.y,
          w: shape.size,
          h: shape.size,
          color: shape.color,
          tool: shape.tool,
        },
      ]
    case 'triangle': {
      const pts = shape.points as [P, P, P]
      const g = mul(add2(add2(pts[0], pts[1]), pts[2]), 1 / 3)
      const out: BoardOp[] = [
        { t: 'poly', points: pts, close: true, color: shape.color, tool: shape.tool },
      ]
      if (shape.right !== undefined) {
        const i = shape.right
        out.push(rightMark(pts[i] as P, pts[(i + 1) % 3] as P, pts[(i + 2) % 3] as P, shape.color))
      }
      shape.sides.forEach((words, i) => {
        if (words.trim())
          out.push(labelOp(pts[i] as P, pts[(i + 1) % 3] as P, g, words, 30, shape.labelColor))
      })
      shape.vertices.forEach((name, i) => {
        if (!name.trim()) return
        const v = pts[i] as P
        const at = add2(v, mul(unit(sub2(v, g)), 26))
        out.push({
          t: 'text',
          x: at[0],
          y: at[1] + 10,
          text: name,
          size: 28,
          align: 'center',
          color: shape.color,
          tool: 'pen',
        })
      })
      return out
    }
    case 'squareOn': {
      const from = shape.from as P
      const to = shape.to as P
      const n = outward(from, to, (shape.away as P | undefined) ?? CENTRE)
      const side = len(sub2(to, from))
      const a = add2(to, mul(n, side))
      const b = add2(from, mul(n, side))
      const out: BoardOp[] = [
        { t: 'poly', points: [from, to, a, b], close: true, color: shape.color, tool: shape.tool },
      ]
      if (shape.label.trim()) {
        const centre = mul(add2(add2(from, to), add2(a, b)), 0.25)
        const size = Math.max(20, Math.min(40, side / 4))
        out.push({
          t: 'text',
          x: centre[0],
          y: centre[1] + size * 0.35,
          text: shape.label,
          size,
          align: 'center',
          color: shape.labelColor,
          tool: 'pen',
        })
      }
      return out
    }
    case 'label':
      return [
        labelOp(
          shape.from as P,
          shape.to as P,
          (shape.away as P | undefined) ?? CENTRE,
          shape.text,
          shape.size,
          shape.color,
          shape.at,
        ),
      ]
  }
}

/** One drawing command from the assistant, as plain commands. Broken ones become nothing. */
export function expandOp(raw: unknown): BoardOp[] {
  const shape = ShapeSchema.safeParse(raw)
  if (shape.success) return expandShape(shape.data)
  const r = BoardOpSchema.safeParse(raw)
  if (!r.success) return []
  const op = r.data
  // A rectangle that is nearly square was almost always meant to be a square.
  if (
    op.t === 'rect' &&
    op.w > 0 &&
    op.h > 0 &&
    Math.abs(op.w - op.h) / Math.max(op.w, op.h) < 0.12
  ) {
    const side = (op.w + op.h) / 2
    return [{ ...op, w: side, h: side }]
  }
  return [op]
}

function fromRaw(raw: unknown): Board | null {
  const parsed = BoardSchema.safeParse(raw)
  if (!parsed.success) return null
  return {
    title: parsed.data.title,
    steps: parsed.data.steps.map((s) => ({ say: s.say, draw: s.draw.flatMap(expandOp) })),
  }
}

/** Reads a board from the assistant's JSON. Unknown or broken drawing commands are skipped. */
export function parseBoard(code: string): Board | null {
  try {
    return fromRaw(JSON.parse(code))
  } catch {
    return null
  }
}

/**
 * Reads a board that is still being written: the title and every step that is complete so far.
 * Returns null until the first step is complete.
 */
export function parseBoardPartial(code: string): Board | null {
  const whole = parseBoard(code)
  if (whole) return whole
  const at = code.indexOf('"steps"')
  if (at < 0) return null
  const open = code.indexOf('[', at)
  if (open < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  let lastEnd = -1
  for (let i = open + 1; i < code.length; i++) {
    const ch = code[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      if (depth === 0) break
      depth--
      if (depth === 0 && ch === '}') lastEnd = i
    }
  }
  if (lastEnd < 0) return null
  try {
    return fromRaw(JSON.parse(code.slice(0, lastEnd + 1) + ']}'))
  } catch {
    return null
  }
}

/* ---------- Formulas ---------- */

type Node =
  | { k: 'n'; v: number }
  | { k: 'x'; i: number }
  | { k: 'u'; op: '-'; a: Node }
  | { k: 'b'; op: '+' | '-' | '*' | '/' | '^'; a: Node; b: Node }
  | { k: 'f'; name: string; a: Node }

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  floor: Math.floor,
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

/**
 * Compiles a formula in x into a function. Only numbers, x, + − × ÷ ^, brackets and a few
 * maths functions are allowed, so nothing the assistant writes can run as code.
 */
export function compileFormula(source: string): ((x: number) => number) | null {
  const run = compileExpression(source, ['x'])
  return run ? (x) => run([x]) : null
}

/**
 * Like compileFormula, for formulas in several variables (a surface z = f(x, y), a curve in t).
 * Values are passed in the same order as `vars`. "xy" means x times y.
 */
export function compileExpression(
  source: string,
  vars: readonly string[],
): ((values: number[]) => number) | null {
  const text = source
    .toLowerCase()
    .replace(/^\s*[a-z]\s*=/, '')
    .replace(/π/g, 'pi')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\*\*/g, '^')
  const tokens = (text.match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+|[-+*/^()]|\S/g) ?? []).flatMap((t) =>
    /^[a-z]{2,}$/.test(t) &&
    !(t in CONSTS) &&
    !(t in FUNCS) &&
    [...t].every((c) => vars.includes(c))
      ? [...t]
      : [t],
  )
  let i = 0
  const peek = (): string | undefined => tokens[i]
  const next = (): string | undefined => tokens[i++]

  // Implicit multiplication: 2x, 3sin(x), (x+1)(x-1), 2pi.
  const startsFactor = (t: string | undefined): boolean =>
    !!t && (t === '(' || /^[a-z]+$/.test(t) || /^\d*\.?\d/.test(t))

  function expr(): Node {
    let left = term()
    while (peek() === '+' || peek() === '-') {
      const op = next() as '+' | '-'
      left = { k: 'b', op, a: left, b: term() }
    }
    return left
  }
  function term(): Node {
    let left = unary()
    for (;;) {
      if (peek() === '*' || peek() === '/') {
        const op = next() as '*' | '/'
        left = { k: 'b', op, a: left, b: unary() }
      } else if (startsFactor(peek())) {
        left = { k: 'b', op: '*', a: left, b: unary() }
      } else return left
    }
  }
  function unary(): Node {
    if (peek() === '-') {
      next()
      return { k: 'u', op: '-', a: unary() }
    }
    if (peek() === '+') next()
    return power()
  }
  function power(): Node {
    const base = atom()
    if (peek() === '^') {
      next()
      return { k: 'b', op: '^', a: base, b: unary() }
    }
    return base
  }
  function atom(): Node {
    const t = next()
    if (t === undefined) throw new Error('end')
    if (t === '(') {
      const inner = expr()
      if (next() !== ')') throw new Error('bracket')
      return inner
    }
    if (/^\d*\.?\d/.test(t)) return { k: 'n', v: Number(t) }
    if (vars.includes(t)) return { k: 'x', i: vars.indexOf(t) }
    if (t in CONSTS) return { k: 'n', v: CONSTS[t] ?? 0 }
    if (t in FUNCS) {
      // sin x and sin(x) both work.
      return { k: 'f', name: t, a: peek() === '(' ? atom() : power() }
    }
    throw new Error(`unknown ${t}`)
  }

  let tree: Node
  try {
    tree = expr()
    if (i !== tokens.length) return null
  } catch {
    return null
  }
  const run = (n: Node, x: number[]): number => {
    switch (n.k) {
      case 'n':
        return n.v
      case 'x':
        return x[n.i] ?? 0
      case 'u':
        return -run(n.a, x)
      case 'f':
        return (FUNCS[n.name] ?? Number)(run(n.a, x))
      case 'b': {
        const a = run(n.a, x)
        const b = run(n.b, x)
        if (n.op === '+') return a + b
        if (n.op === '-') return a - b
        if (n.op === '*') return a * b
        if (n.op === '/') return a / b
        return a ** b
      }
    }
  }
  return (values) => run(tree, values)
}

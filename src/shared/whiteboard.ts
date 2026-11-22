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

/** Reads a board from the assistant's JSON. Unknown or broken drawing commands are skipped. */
export function parseBoard(code: string): Board | null {
  let raw: unknown
  try {
    raw = JSON.parse(code)
  } catch {
    return null
  }
  const parsed = BoardSchema.safeParse(raw)
  if (!parsed.success) return null
  return {
    title: parsed.data.title,
    steps: parsed.data.steps.map((s) => ({
      say: s.say,
      draw: s.draw.flatMap((op) => {
        const r = BoardOpSchema.safeParse(op)
        return r.success ? [r.data] : []
      }),
    })),
  }
}

/* ---------- Formulas ---------- */

type Node =
  | { k: 'n'; v: number }
  | { k: 'x' }
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
  const text = source
    .toLowerCase()
    .replace(/^\s*y\s*=/, '')
    .replace(/π/g, 'pi')
    .replace(/[×·]/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/\*\*/g, '^')
  const tokens = text.match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z]+|[-+*/^()]|\S/g) ?? []
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
    if (t === 'x') return { k: 'x' }
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
  const run = (n: Node, x: number): number => {
    switch (n.k) {
      case 'n':
        return n.v
      case 'x':
        return x
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
  return (x) => run(tree, x)
}

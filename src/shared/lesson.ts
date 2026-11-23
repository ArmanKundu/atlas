import { z } from 'zod'
import { compileFormula } from './whiteboard'

/**
 * A visual lesson (the Explainer): a run of scenes, each with narration, working written on the
 * left and a diagram on the right. The AI writes it as JSON; Atlas lays it out, computes every
 * graph, area, intersection and tangent itself, animates it in time with the voice, and can
 * record it as a video. Diagram coordinates are either a graph's own x/y range or, without a
 * graph, a 0–100 square with (0, 0) at the bottom left.
 */

export const LESSON_COLORS = [
  'ink',
  'blue',
  'yellow',
  'green',
  'red',
  'purple',
  'orange',
  'pink',
  'teal',
  'grey',
] as const
export type LessonColor = (typeof LESSON_COLORS)[number]
export const LESSON_THEMES = ['board', 'paper', 'night'] as const
export type LessonTheme = (typeof LESSON_THEMES)[number]

const num = z.coerce.number().catch(0)
const pt = z.tuple([num, num])
const color = z.enum(LESSON_COLORS).catch('blue')
const id = z.string().max(40).optional().catch(undefined)
const words = (max: number) => z.string().max(max).catch('')

export const LessonItemSchema = z.discriminatedUnion('t', [
  /** A line of plain writing in the working column. */
  z.object({ t: z.literal('text'), id, text: words(300), c: color.default('ink') }),
  /** A line of LaTeX in the working column (KaTeX, with \ce{} for chemistry). */
  z.object({ t: z.literal('math'), id, tex: words(400), c: color.default('blue') }),
  /** y = fn(x) on the scene's graph. */
  z.object({
    t: z.literal('curve'),
    id,
    fn: words(160),
    from: num.optional(),
    to: num.optional(),
    c: color.default('blue'),
    label: words(60).default(''),
    dash: z.boolean().catch(false).default(false),
  }),
  /** Shaded area under one curve, or between two (by id), from x = from to x = to. */
  z.object({
    t: z.literal('area'),
    id,
    under: z.string().max(40).optional().catch(undefined),
    between: z
      .tuple([z.string().max(40), z.string().max(40)])
      .optional()
      .catch(undefined),
    from: num,
    to: num,
    c: color.default('yellow'),
    label: words(60).default(''),
  }),
  /** Marks where two curves cross, with their coordinates worked out by Atlas. */
  z.object({
    t: z.literal('meet'),
    id,
    of: z.tuple([z.string().max(40), z.string().max(40)]),
    c: color.default('red'),
    coords: z.boolean().catch(true).default(true),
  }),
  /** The tangent to a curve at x, drawn and labelled with its gradient. */
  z.object({
    t: z.literal('tangent'),
    id,
    of: z.string().max(40),
    x: num,
    c: color.default('orange'),
  }),
  z.object({
    t: z.literal('point'),
    id,
    at: pt,
    label: words(40).default(''),
    c: color.default('red'),
  }),
  z.object({
    t: z.literal('line'),
    id,
    from: pt,
    to: pt,
    c: color.default('ink'),
    dash: z.boolean().catch(false).default(false),
    label: words(40).default(''),
  }),
  z.object({
    t: z.literal('arrow'),
    id,
    from: pt,
    to: pt,
    c: color.default('ink'),
    label: words(40).default(''),
    curve: num.default(0),
  }),
  z.object({
    t: z.literal('poly'),
    id,
    points: z.array(pt).min(2).max(40),
    c: color.default('ink'),
    fill: z
      .enum([...LESSON_COLORS, 'none'])
      .catch('none')
      .default('none'),
    close: z.boolean().catch(true).default(true),
  }),
  z.object({
    t: z.literal('circle'),
    id,
    at: pt,
    r: num,
    c: color.default('ink'),
    fill: z
      .enum([...LESSON_COLORS, 'none'])
      .catch('none')
      .default('none'),
  }),
  /** A slice of a circle between two angles in degrees (0 = right, anticlockwise). */
  z.object({
    t: z.literal('sector'),
    id,
    at: pt,
    r: num,
    from: num,
    to: num,
    c: color.default('ink'),
    fill: z
      .enum([...LESSON_COLORS, 'none'])
      .catch('pink')
      .default('pink'),
    label: words(40).default(''),
  }),
  z.object({
    t: z.literal('rightangle'),
    id,
    at: pt,
    /** Direction of the first arm in degrees; the square sits between it and +90°. */
    dir: num.default(0),
    c: color.default('ink'),
  }),
  /** A label in the diagram; `tex` for maths. */
  z.object({
    t: z.literal('label'),
    id,
    at: pt,
    text: words(80).default(''),
    tex: words(120).default(''),
    c: color.default('ink'),
    size: num.default(1),
  }),
  /** A rounded box with words, for flow charts and processes (biology, chemistry, essays). */
  z.object({
    t: z.literal('box'),
    id,
    at: pt,
    w: num.default(26),
    h: num.default(12),
    text: words(80).default(''),
    c: color.default('blue'),
  }),
  /** A picture from Atlas's set: sun, earth, leaf, cell, atom, flask, dna, heart, water, etc. */
  z.object({
    t: z.literal('icon'),
    id,
    name: z.string().max(30),
    at: pt,
    size: num.default(14),
    c: color.default('ink'),
    label: words(40).default(''),
  }),
  /** A Bohr model: nucleus symbol and electrons per shell, e.g. Na with [2, 8, 1]. */
  z.object({
    t: z.literal('atom'),
    id,
    at: pt,
    symbol: words(4).default(''),
    shells: z.array(z.coerce.number().int().min(0).max(32)).max(7).default([]),
    size: num.default(30),
    c: color.default('blue'),
  }),
  /** Draws attention to something already on the board. */
  z.object({ t: z.literal('focus'), id: z.string().max(40) }),
  /** Takes something off the board. */
  z.object({ t: z.literal('remove'), id: z.string().max(40) }),
])
export type LessonItem = z.infer<typeof LessonItemSchema>

export const GraphSchema = z.object({
  x: z.tuple([num, num]).catch([-5, 5]),
  y: z.tuple([num, num]).catch([-5, 5]),
  /** Same scale on both axes (for geometry, circles and slopes that must look right). */
  equal: z.boolean().catch(false).default(false),
  grid: z.boolean().catch(true).default(true),
  xlabel: words(20).default('x'),
  ylabel: words(20).default('y'),
})
export type Graph = z.infer<typeof GraphSchema>

const pt3 = z.tuple([num, num, num]).catch([0, 0, 0])
const range = z.tuple([num, num])

/**
 * One thing in a 3D model. Space runs from about -5 to 5 on each axis with y pointing up; the
 * student can orbit, zoom and drag objects around. Labels float beside their object and are
 * kept from overlapping.
 */
export const ModelObjectSchema = z.discriminatedUnion('k', [
  z.object({
    k: z.literal('sphere'),
    id,
    at: pt3,
    r: num.default(1),
    c: color.default('blue'),
    label: words(60).default(''),
    opacity: num.default(1),
  }),
  z.object({
    k: z.literal('box'),
    id,
    at: pt3,
    size: pt3.default([1, 1, 1]),
    c: color.default('blue'),
    label: words(60).default(''),
    opacity: num.default(1),
  }),
  z.object({
    k: z.literal('cylinder'),
    id,
    from: pt3,
    to: pt3,
    r: num.default(0.2),
    c: color.default('grey'),
    label: words(60).default(''),
    opacity: num.default(1),
  }),
  z.object({
    k: z.literal('cone'),
    id,
    at: pt3,
    r: num.default(1),
    h: num.default(2),
    c: color.default('orange'),
    label: words(60).default(''),
    opacity: num.default(1),
  }),
  z.object({
    k: z.literal('torus'),
    id,
    at: pt3,
    r: num.default(1.5),
    tube: num.default(0.3),
    c: color.default('purple'),
    label: words(60).default(''),
  }),
  z.object({
    k: z.literal('arrow'),
    id,
    from: pt3,
    to: pt3,
    c: color.default('red'),
    label: words(60).default(''),
  }),
  z.object({
    k: z.literal('plane'),
    id,
    at: pt3,
    normal: pt3.default([0, 1, 0]),
    size: num.default(6),
    c: color.default('teal'),
    label: words(60).default(''),
    opacity: num.default(0.35),
  }),
  /** z = f(x, y) drawn as a surface (height is up). */
  z.object({
    k: z.literal('surface'),
    id,
    fn: words(200),
    x: range.catch([-3, 3]).default([-3, 3]),
    y: range.catch([-3, 3]).default([-3, 3]),
    c: color.default('blue'),
    label: words(60).default(''),
    opacity: num.default(0.9),
  }),
  /** A curve (x(t), y(t), z(t)), with z up. */
  z.object({
    k: z.literal('curve'),
    id,
    fn: z.tuple([words(200), words(200), words(200)]),
    t: range.catch([0, 6.283]).default([0, 6.283]),
    c: color.default('yellow'),
    label: words(60).default(''),
  }),
  z.object({
    k: z.literal('axes'),
    id,
    size: num.default(4),
    labels: z.boolean().catch(true).default(true),
  }),
  /** A ball-and-stick molecule; atoms are coloured by element. */
  z.object({
    k: z.literal('molecule'),
    id,
    atoms: z
      .array(z.object({ el: words(3), at: pt3, label: words(40).default('') }))
      .max(60)
      .catch([]),
    bonds: z
      .array(z.tuple([num, num]).or(z.tuple([num, num, num])))
      .max(80)
      .catch([])
      .default([]),
    at: pt3.default([0, 0, 0]),
    scale: num.default(1),
  }),
  z.object({ k: z.literal('label'), id, at: pt3, text: words(80) }),
])
export type ModelObject = z.infer<typeof ModelObjectSchema>

export interface LessonModel {
  objects: ModelObject[]
  /** Turn slowly until the student grabs it. */
  spin: boolean
  /** Where the camera starts, looking at the centre. */
  camera: [number, number, number]
}

const ModelSchema = z.object({
  objects: z.array(z.unknown()).max(80).catch([]),
  spin: z.boolean().catch(false).default(false),
  camera: z.tuple([num, num, num]).catch([6, 5, 8]).default([6, 5, 8]),
})

/** A quick question the tutor asks at the end of a scene; the lesson waits for an answer. */
export interface LessonCheck {
  q: string
  options: string[]
  answer: number
  why: string
}

const CheckSchema = z.object({
  q: words(400),
  options: z.array(words(200)).min(2).max(4),
  answer: z.coerce.number().int().catch(0),
  why: words(600).default(''),
})

export interface LessonScene {
  title: string
  say: string
  clear: boolean
  graph: Graph | null
  items: LessonItem[]
  /** A 3D model for the diagram side; it stays until another model or a cleared board. */
  model: LessonModel | null
  check: LessonCheck | null
}

export interface Lesson {
  title: string
  subject: string
  theme: LessonTheme
  scenes: LessonScene[]
}

const SceneSchema = z.object({
  title: words(140).default(''),
  say: words(1500).default(''),
  clear: z.boolean().catch(false).default(false),
  graph: GraphSchema.nullable().optional().catch(null),
  items: z.array(z.unknown()).max(40).catch([]).default([]),
  model: ModelSchema.nullable().optional().catch(null),
  check: CheckSchema.nullable().optional().catch(null),
})

const LessonSchema = z.object({
  title: words(140).default('Explainer'),
  subject: words(60).default(''),
  theme: z.enum(LESSON_THEMES).catch('board').default('board'),
  scenes: z.array(z.unknown()).max(40),
})

function toScene(raw: unknown): LessonScene | null {
  const s = SceneSchema.safeParse(raw)
  if (!s.success) return null
  const items = s.data.items.flatMap((item) => {
    const parsed = LessonItemSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
  const model = s.data.model
    ? {
        objects: s.data.model.objects.flatMap((o) => {
          const parsed = ModelObjectSchema.safeParse(o)
          return parsed.success ? [parsed.data] : []
        }),
        spin: s.data.model.spin,
        camera: s.data.model.camera,
      }
    : null
  const check = s.data.check
  if (!s.data.say && items.length === 0 && !model) return null
  return {
    title: s.data.title,
    say: s.data.say,
    clear: s.data.clear,
    graph: s.data.graph ?? null,
    items,
    model: model && model.objects.length > 0 ? model : null,
    check:
      check && check.q && check.options.every(Boolean)
        ? { ...check, answer: Math.max(0, Math.min(check.options.length - 1, check.answer)) }
        : null,
  }
}

function fromRaw(raw: unknown): Lesson | null {
  const lesson = LessonSchema.safeParse(raw)
  if (!lesson.success) return null
  const scenes = lesson.data.scenes.map(toScene).filter((s): s is LessonScene => s !== null)
  if (scenes.length === 0) return null
  return {
    title: lesson.data.title,
    subject: lesson.data.subject,
    theme: lesson.data.theme,
    scenes,
  }
}

/**
 * Takes the JSON out of a ```atlas-lesson block or a bare answer. Tolerates any fence label,
 * words before or after, and a missing closing fence: it keeps the first `{` up to the brace that
 * closes it (or to the end while it is still being written).
 */
function jsonPart(text: string): string {
  const fence = /```[\w-]*[ \t]*\n([\s\S]*?)(?:```|$)/.exec(text)
  const body = fence?.[1]?.includes('{') ? fence[1] : text
  const start = body.indexOf('{')
  if (start < 0) return body
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < body.length; i++) {
    const ch = body[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
    } else if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return body.slice(start, i + 1)
    }
  }
  return body.slice(start)
}

export function parseLesson(text: string): Lesson | null {
  try {
    return fromRaw(JSON.parse(jsonPart(text)))
  } catch {
    return null
  }
}

/** The parts of a JSON array (under `key`) that are complete so far, as raw text. */
export function completeElements(code: string, key: string): string[] {
  const at = code.indexOf(`"${key}"`)
  if (at < 0) return []
  const open = code.indexOf('[', at)
  if (open < 0) return []
  const out: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let i = open + 1; i < code.length; i++) {
    const ch = code[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}' || ch === ']') {
      if (depth === 0) break
      depth--
      if (depth === 0 && start >= 0) {
        out.push(code.slice(start, i + 1))
        start = -1
      }
    }
  }
  return out
}

/**
 * Reads a lesson that is still being written: the scenes that are complete so far, so the first
 * scene can play while the rest is written. Null until one scene is complete.
 */
export function parseLessonPartial(text: string): Lesson | null {
  const whole = parseLesson(text)
  if (whole) return whole
  const code = jsonPart(text)
  const scenes = completeElements(code, 'scenes')
    .map((part) => {
      try {
        return toScene(JSON.parse(part))
      } catch {
        return null
      }
    })
    .filter((s): s is LessonScene => s !== null)
  if (scenes.length === 0) return null
  const field = (name: string): string => {
    const m = new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(
      code.slice(0, code.indexOf('"scenes"')),
    )
    try {
      return m?.[1] ? (JSON.parse(`"${m[1]}"`) as string) : ''
    } catch {
      return ''
    }
  }
  const theme = field('theme')
  return {
    title: field('title') || 'Explainer',
    subject: field('subject'),
    theme: (LESSON_THEMES as readonly string[]).includes(theme) ? (theme as LessonTheme) : 'board',
    scenes,
  }
}

/* ---------- Maths Atlas works out itself ---------- */

/** x values in [a, b] where f and g cross (sign changes, refined by bisection). */
export function crossings(
  f: (x: number) => number,
  g: (x: number) => number,
  a: number,
  b: number,
  samples = 800,
): number[] {
  const h = (x: number): number => f(x) - g(x)
  const out: number[] = []
  let x0 = a
  let y0 = h(a)
  for (let i = 1; i <= samples; i++) {
    const x1 = a + ((b - a) * i) / samples
    const y1 = h(x1)
    if (Number.isFinite(y0) && Number.isFinite(y1)) {
      if (y0 === 0) out.push(x0)
      else if (y0 * y1 < 0 && Math.abs(y1 - y0) < 1e6) {
        let lo = x0
        let hi = x1
        for (let k = 0; k < 60; k++) {
          const mid = (lo + hi) / 2
          if (h(lo) * h(mid) <= 0) hi = mid
          else lo = mid
        }
        out.push((lo + hi) / 2)
      }
    }
    x0 = x1
    y0 = y1
  }
  if (Number.isFinite(y0) && y0 === 0) out.push(x0)
  return out.filter((x, i) => i === 0 || Math.abs(x - (out[i - 1] ?? x)) > 1e-6)
}

/** Simpson's rule. */
export function integrate(f: (x: number) => number, a: number, b: number, n = 400): number {
  const m = n % 2 ? n + 1 : n
  const h = (b - a) / m
  let sum = f(a) + f(b)
  for (let i = 1; i < m; i++) sum += (i % 2 ? 4 : 2) * f(a + i * h)
  return (sum * h) / 3
}

export function derivative(f: (x: number) => number, x: number): number {
  const h = 1e-4
  return (f(x + h) - f(x - h)) / (2 * h)
}

/** A short, tidy number: 2, -1.5, 3.33, 1/3 stays 0.33. */
export function nice(v: number): string {
  if (!Number.isFinite(v)) return '?'
  const r = Math.round(v * 100) / 100
  return Object.is(r, -0) ? '0' : String(r)
}

export { compileFormula }

/** The short stretch of narration being spoken at `t` of `seconds`, like video subtitles. */
export function subtitleAt(say: string, t: number, seconds: number): string {
  const words = say.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  // Break at sentence and clause ends, keeping each line short enough to read at a glance.
  const lines: string[][] = [[]]
  for (const w of words) {
    const line = lines[lines.length - 1] ?? []
    line.push(w)
    if (
      (/[.!?;:]$/.test(w) && line.length >= 4) ||
      (/,$/.test(w) && line.length >= 8) ||
      line.length >= 13
    )
      lines.push([])
  }
  const full = lines.filter((l) => l.length > 0)
  const share = Math.max(0, Math.min(0.999, t / Math.max(0.1, seconds - 0.6)))
  let at = share * words.length
  for (const line of full) {
    if (at < line.length) return line.join(' ')
    at -= line.length
  }
  return full[full.length - 1]?.join(' ') ?? ''
}

/** Roughly how long a scene's narration takes to say, for timing without a voice. */
export function speakingSeconds(say: string): number {
  const count = say.trim().split(/\s+/).filter(Boolean).length
  return Math.max(3, count / 2.6 + 0.8)
}

/** Pictures the AI may name in an `icon` item. `cell` is drawn by Atlas (membrane and nucleus). */
export const LESSON_ICONS = [
  'sun',
  'earth',
  'moon',
  'star',
  'cloud',
  'wind',
  'water',
  'waves',
  'snow',
  'flame',
  'mountain',
  'leaf',
  'sprout',
  'tree',
  'wheat',
  'apple',
  'egg',
  'cell',
  'dna',
  'microscope',
  'bug',
  'virus',
  'fish',
  'bird',
  'person',
  'brain',
  'heart',
  'eye',
  'bone',
  'pill',
  'syringe',
  'pulse',
  'atom',
  'flask',
  'beaker',
  'test-tube',
  'magnet',
  'zap',
  'battery',
  'bulb',
  'thermometer',
  'gauge',
  'clock',
  'ruler',
  'calculator',
  'rocket',
  'orbit',
  'telescope',
  'car',
  'truck',
  'factory',
  'shop',
  'house',
  'building',
  'coins',
  'money',
  'chart',
  'scale',
  'book',
] as const

/** When each item of a scene starts and finishes drawing, in seconds from the scene's start. */
export function sceneTimeline(
  scene: LessonScene,
  seconds: number,
): { start: number; end: number }[] {
  const weight = (item: LessonItem): number => {
    switch (item.t) {
      case 'math':
        return 1.4
      case 'text':
        return 1 + Math.min(1.5, item.text.length / 60)
      case 'curve':
      case 'area':
        return 1.6
      case 'box':
      case 'atom':
      case 'sector':
      case 'poly':
      case 'circle':
      case 'tangent':
      case 'meet':
        return 1.1
      case 'focus':
      case 'remove':
        return 0.3
      default:
        return 0.6
    }
  }
  const weights = scene.items.map(weight)
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const begin = Math.min(0.4, seconds * 0.04)
  const span = Math.max(0.5, seconds * 0.9 - begin)
  let at = begin
  return weights.map((w) => {
    const length = (w / total) * span
    const slot = { start: at, end: at + Math.min(length, 2.4 + w) }
    at += length
    return slot
  })
}

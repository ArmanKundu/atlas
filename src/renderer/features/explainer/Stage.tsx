import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import 'katex/dist/contrib/mhchem.mjs'
import '@fontsource/kalam/400.css'
import '@fontsource/kalam/700.css'
import {
  Activity,
  Apple,
  Atom,
  Banknote,
  BatteryFull,
  Beaker,
  Biohazard,
  Bird,
  BookOpen,
  Bone,
  Brain,
  Bug,
  Building2,
  Calculator,
  Car,
  ChartColumn,
  Clock,
  Cloud,
  Coins,
  Dna,
  Droplet,
  Earth,
  Egg,
  Eye,
  Factory,
  Fish,
  Flame,
  FlaskConical,
  Gauge,
  Heart,
  House,
  Leaf,
  Lightbulb,
  Magnet,
  Microscope,
  Moon,
  Mountain,
  Orbit,
  PersonStanding,
  Pill,
  Rocket,
  Ruler,
  Scale,
  Snowflake,
  Sprout,
  Star,
  Store,
  Sun,
  Syringe,
  Telescope,
  TestTube,
  Thermometer,
  TreePine,
  Truck,
  Waves,
  Wheat,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  compileFormula,
  crossings,
  derivative,
  nice,
  sceneTimeline,
  type Graph,
  type Lesson,
  type LessonColor,
  type LessonItem,
  type LessonModel,
  type LessonTheme,
} from '@shared/lesson'
import { Model3D } from './Model3D'
import { LabelPlacer, textWidth, type Anchor, type Box } from '@shared/label-layout'

export const STAGE_W = 1600
export const STAGE_H = 900

interface Theme {
  bg: string
  ink: string
  soft: string
  grid: string
  font: string
  colors: Record<LessonColor, string>
}

const BRIGHT: Record<LessonColor, string> = {
  ink: '#ececec',
  blue: '#58c4dd',
  yellow: '#ffd23f',
  green: '#83c167',
  red: '#fc6255',
  purple: '#b189c6',
  orange: '#ff8c3a',
  pink: '#f08fb4',
  teal: '#5cd0b3',
  grey: '#8b8f98',
}

/** Everything on the board is handwritten, like a teacher writing live. */
const HAND = '"Kalam", "Caveat", "Comic Sans MS", cursive'

const THEMES: Record<LessonTheme, Theme> = {
  board: {
    bg: '#15171c',
    ink: '#ececec',
    soft: '#9aa0aa',
    grid: 'rgba(255,255,255,0.07)',
    font: HAND,
    colors: BRIGHT,
  },
  night: {
    bg: '#0f2d55',
    ink: '#f1f4f8',
    soft: '#a9bbd3',
    grid: 'rgba(255,255,255,0.08)',
    font: HAND,
    colors: BRIGHT,
  },
  paper: {
    bg: '#fbfaf6',
    ink: '#1d1d1f',
    soft: '#6b6b70',
    grid: 'rgba(0,0,0,0.06)',
    font: HAND,
    colors: {
      ink: '#1d1d1f',
      blue: '#2a7ab8',
      yellow: '#e0a800',
      green: '#3f9b4a',
      red: '#d64545',
      purple: '#7a4fb0',
      orange: '#e0711c',
      pink: '#d2557f',
      teal: '#1f9a86',
      grey: '#8a8a8f',
    },
  },
}

const ICONS: Record<string, LucideIcon> = {
  sun: Sun,
  earth: Earth,
  moon: Moon,
  star: Star,
  cloud: Cloud,
  wind: Wind,
  water: Droplet,
  waves: Waves,
  snow: Snowflake,
  flame: Flame,
  mountain: Mountain,
  leaf: Leaf,
  sprout: Sprout,
  tree: TreePine,
  wheat: Wheat,
  apple: Apple,
  egg: Egg,
  dna: Dna,
  microscope: Microscope,
  bug: Bug,
  virus: Biohazard,
  fish: Fish,
  bird: Bird,
  person: PersonStanding,
  brain: Brain,
  heart: Heart,
  eye: Eye,
  bone: Bone,
  pill: Pill,
  syringe: Syringe,
  pulse: Activity,
  atom: Atom,
  flask: FlaskConical,
  beaker: Beaker,
  'test-tube': TestTube,
  magnet: Magnet,
  zap: Zap,
  battery: BatteryFull,
  bulb: Lightbulb,
  thermometer: Thermometer,
  gauge: Gauge,
  clock: Clock,
  ruler: Ruler,
  calculator: Calculator,
  rocket: Rocket,
  orbit: Orbit,
  telescope: Telescope,
  car: Car,
  truck: Truck,
  factory: Factory,
  shop: Store,
  house: House,
  building: Building2,
  coins: Coins,
  money: Banknote,
  chart: ChartColumn,
  scale: Scale,
  book: BookOpen,
}

/* ---------- What is on the board at a moment ---------- */

interface Placed {
  item: LessonItem
  /** 0 → 1 while it is being drawn. */
  p: number
  focus: boolean
  key: string
}

interface BoardState {
  title: string
  graph: Graph | null
  left: Placed[]
  diagram: Placed[]
  split: boolean
  /** A 3D model on the diagram side, and how far its scene has played. */
  model: LessonModel | null
  modelP: number
}

const LEFT_TYPES = new Set(['text', 'math'])

/**
 * Everything on the board at `scene`, `t` seconds in. Items stay from earlier scenes until a
 * scene clears the board or removes them.
 */
function boardAt(lesson: Lesson, scene: number, t: number, seconds: number[]): BoardState {
  let start = 0
  for (let i = scene; i >= 0; i--) {
    if (lesson.scenes[i]?.clear) {
      start = i
      break
    }
  }
  // Layout is decided for the whole stretch between clears, so nothing jumps mid-way.
  let end = lesson.scenes.length
  for (let i = scene + 1; i < lesson.scenes.length; i++) {
    if (lesson.scenes[i]?.clear) {
      end = i
      break
    }
  }
  const stretch = lesson.scenes.slice(start, end)
  const hasLeft = stretch.some((s) => s.items.some((it) => LEFT_TYPES.has(it.t)))
  const hasDiagram = stretch.some(
    (s) => s.graph || s.model || s.items.some((it) => !LEFT_TYPES.has(it.t)),
  )
  let model: LessonModel | null = null
  let modelP = 1

  let title = ''
  let graph: Graph | null = null
  const placed: Placed[] = []
  for (let i = start; i <= scene; i++) {
    const s = lesson.scenes[i]
    if (!s) continue
    if (s.title) title = s.title
    if (s.graph) graph = s.graph
    if (s.model) {
      model = s.model
      modelP = i < scene ? 1 : Math.min(1, t / Math.max(0.5, (seconds[i] ?? 6) * 0.7))
    }
    const times = sceneTimeline(s, seconds[i] ?? 6)
    s.items.forEach((item, k) => {
      const slot = times[k] ?? { start: 0, end: 0 }
      const p =
        i < scene
          ? 1
          : Math.max(0, Math.min(1, (t - slot.start) / Math.max(0.01, slot.end - slot.start)))
      if (item.t === 'remove') {
        if (p >= 1) {
          for (const other of placed) if (other.item.id === item.id) other.p = -1
        }
        return
      }
      if (item.t === 'focus') {
        if (i === scene && p > 0)
          for (const other of placed) if (other.item.id === item.id) other.focus = true
        return
      }
      if (i === scene && p <= 0) return
      placed.push({ item, p, focus: false, key: `${i}-${k}` })
    })
  }
  const live = placed.filter((x) => x.p >= 0)
  return {
    title,
    graph,
    left: live.filter((x) => LEFT_TYPES.has(x.item.t)),
    diagram: live.filter((x) => !LEFT_TYPES.has(x.item.t)),
    split: hasLeft && hasDiagram,
    model,
    modelP,
  }
}

/* ---------- Coordinates ---------- */

interface Frame {
  x: number
  y: number
  w: number
  h: number
}

interface Mapper {
  px: (x: number) => number
  py: (y: number) => number
  /** Length of one unit in pixels, along x. */
  unit: number
  xmin: number
  xmax: number
  ymin: number
  ymax: number
}

function mapper(frame: Frame, graph: Graph | null): Mapper {
  const [xmin, xmax] = graph ? graph.x : [0, 100]
  const [ymin, ymax] = graph ? graph.y : [0, 100]
  const spanX = xmax - xmin || 1
  const spanY = ymax - ymin || 1
  let sx = frame.w / spanX
  let sy = frame.h / spanY
  let ox = frame.x
  let oy = frame.y
  if (!graph || graph.equal) {
    const s = Math.min(sx, sy)
    ox += (frame.w - spanX * s) / 2
    oy += (frame.h - spanY * s) / 2
    sx = s
    sy = s
  }
  return {
    px: (x) => ox + (x - xmin) * sx,
    py: (y) => oy + (ymax - y) * sy,
    unit: sx,
    xmin,
    xmax,
    ymin,
    ymax,
  }
}

function niceStep(range: number): number {
  const raw = range / 8
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p
}

function curvePath(fn: (x: number) => number, m: Mapper, from: number, to: number): string {
  const a = Math.max(from, m.xmin)
  const b = Math.min(to, m.xmax)
  const n = 360
  const pad = (m.ymax - m.ymin) * 0.6
  let d = ''
  let pen = false
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n
    const y = fn(x)
    if (!Number.isFinite(y) || y > m.ymax + pad || y < m.ymin - pad) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${m.px(x).toFixed(1)},${m.py(y).toFixed(1)}`
    pen = true
  }
  return d
}

/* ---------- Pieces ---------- */

function Tex({ tex, color, size }: { tex: string; color: string; size: number }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, {
        throwOnError: false,
        displayMode: false,
        strict: 'ignore',
      })
    } catch {
      return tex
    }
  }, [tex])
  return (
    <span
      className="lesson-hand"
      style={{ color, fontSize: size }}
      // KaTeX output from text the AI wrote; KaTeX escapes it and `trust` is off.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

const ease = (p: number): number => 1 - (1 - p) ** 3

/** A marker pen, tip at (0, 0), shown wherever writing is happening right now. */
function PenTip({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-35)`} style={{ pointerEvents: 'none' }}>
      <circle r={9} fill={color} opacity={0.35} />
      <path d="M0,0 L7,-14 L-7,-14 Z" fill={color} />
      <rect
        x={-8}
        y={-62}
        width={16}
        height={48}
        rx={4}
        fill="#f4f4f2"
        stroke="#2b2b2b"
        strokeWidth={2}
      />
      <rect x={-8} y={-62} width={16} height={12} rx={4} fill={color} />
    </g>
  )
}

/** The point on a box's edge closest to (x, y), for a leader line to a label that moved. */
function nearestEdge(box: Box, x: number, y: number): [number, number] {
  return [Math.max(box.x, Math.min(box.x + box.w, x)), Math.max(box.y, Math.min(box.y + box.h, y))]
}

/** How wide a line of LaTeX roughly is once drawn, at `size` px. */
function texWidth(tex: string, size: number): number {
  const bare = tex
    .replace(/\\(frac|dfrac)\{([^{}]*)\}\{([^{}]*)\}/g, (_, _f, a: string, b: string) =>
      a.length > b.length ? a : b,
    )
    .replace(/\\(left|right|displaystyle|,|;|quad|qquad|text|mathrm|ce)/g, '')
    .replace(/\\[a-zA-Z]+/g, 'x')
    .replace(/[{}^_]/g, '')
  return Math.max(size, bare.length * size * 0.55)
}

/** Height a working-column line takes, so the column can scroll before it runs off the board. */
function lineHeight(item: LessonItem, width: number): number {
  if (item.t === 'math') {
    const tall = /\\(frac|dfrac|int|sum|lim|sqrt|begin|binom|prod)/.test(item.tex)
    return (tall ? 2.3 : 1.5) * 42
  }
  if (item.t === 'text') return Math.max(1, Math.ceil(textWidth(item.text, 32) / width)) * 32 * 1.35
  return 0
}

/**
 * The lesson board: a 1600 × 900 stage scaled to fit its box. Draws `scene` as it looks `t`
 * seconds in; `seconds` is how long each scene lasts.
 */
export function Stage({
  lesson,
  scene,
  t,
  seconds,
  caption,
}: {
  lesson: Lesson
  scene: number
  t: number
  seconds: number[]
  caption?: string | null
}) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const fit = (): void => setScale(el.clientWidth / STAGE_W)
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const theme = THEMES[lesson.theme]
  const board = boardAt(lesson, scene, t, seconds)
  const top = board.title ? 130 : 70
  const frame: Frame = board.split
    ? { x: 830, y: top + 10, w: 700, h: STAGE_H - top - 90 }
    : { x: 160, y: top + 10, w: STAGE_W - 320, h: STAGE_H - top - 90 }
  const m = mapper(frame, board.graph)
  const col = (c: LessonColor): string => theme.colors[c]

  // Words never land on each other: keep the working column, title and subtitles clear, and go
  // around every line and curve on the board.
  const leftX = board.split ? 80 : 200
  const leftW = board.split ? 700 : STAGE_W - 400
  const bottomRoom = caption ? 130 : 50
  const placer = new LabelPlacer({ x: 24, y: 24, w: STAGE_W - 48, h: STAGE_H - 48 - bottomRoom })
  if (board.title) placer.reserve({ x: 200, y: 20, w: STAGE_W - 400, h: top - 40 })
  if (board.left.length && board.split)
    placer.reserve({ x: leftX - 20, y: top, w: leftW + 30, h: STAGE_H - top })
  if (caption) placer.reserve({ x: 0, y: STAGE_H - bottomRoom, w: STAGE_W, h: bottomRoom })
  if (board.model) placer.reserve(frame)

  const curves = new Map<string, (x: number) => number>()
  for (const { item } of board.diagram) {
    if (item.t === 'curve' && item.id) {
      const f = compileFormula(item.fn)
      if (f) curves.set(item.id, f)
    }
  }

  for (const { item } of board.diagram) {
    if (item.t === 'curve') {
      const f = compileFormula(item.fn)
      if (!f) continue
      const a = Math.max(item.from ?? m.xmin, m.xmin)
      const b = Math.min(item.to ?? m.xmax, m.xmax)
      const pts: [number, number][] = []
      for (let i = 0; i <= 90; i++) {
        const x = a + ((b - a) * i) / 90
        const y = f(x)
        if (Number.isFinite(y) && y <= m.ymax && y >= m.ymin) pts.push([m.px(x), m.py(y)])
      }
      placer.avoidPoints(pts)
    } else if (item.t === 'line' || item.t === 'arrow') {
      const pts: [number, number][] = []
      for (let i = 0; i <= 16; i++) {
        const k = i / 16
        pts.push([
          m.px(item.from[0] + (item.to[0] - item.from[0]) * k),
          m.py(item.from[1] + (item.to[1] - item.from[1]) * k),
        ])
      }
      placer.avoidPoints(pts)
    } else if (item.t === 'box') {
      const w = item.w * m.unit
      const h = item.h * m.unit
      placer.occupy({ x: m.px(item.at[0]) - w / 2, y: m.py(item.at[1]) - h / 2, w, h })
    } else if (item.t === 'icon' || item.t === 'atom') {
      const size = item.size * m.unit
      placer.occupy({
        x: m.px(item.at[0]) - size / 2,
        y: m.py(item.at[1]) - size / 2,
        w: size,
        h: size + (item.t === 'icon' && item.label ? 44 : 0),
      })
    } else if (item.t === 'circle') {
      const r = item.r * m.unit
      const cx = m.px(item.at[0])
      const cy = m.py(item.at[1])
      const pts: [number, number][] = []
      for (let i = 0; i < 36; i++)
        pts.push([
          cx + r * Math.cos((i / 36) * Math.PI * 2),
          cy + r * Math.sin((i / 36) * Math.PI * 2),
        ])
      placer.avoidPoints(pts)
    }
  }
  if (board.graph) {
    const g = board.graph
    const ax = Math.min(Math.max(0, g.y[0]), g.y[1])
    const ay = Math.min(Math.max(0, g.x[0]), g.x[1])
    // Axes and their numbers.
    placer.occupy({ x: m.px(g.x[0]), y: m.py(ax) - 4, w: m.px(g.x[1]) - m.px(g.x[0]), h: 40 })
    placer.occupy({ x: m.px(ay) - 50, y: m.py(g.y[1]), w: 54, h: m.py(g.y[0]) - m.py(g.y[1]) })
  }

  const svg: ReactNode[] = []
  const html: ReactNode[] = []
  let pen: { x: number; y: number; color: string } | null = null

  if (board.graph) {
    const g = board.graph
    const step = niceStep(g.x[1] - g.x[0])
    const stepY = niceStep(g.y[1] - g.y[0])
    const lines: ReactNode[] = []
    if (g.grid) {
      for (let x = Math.ceil(g.x[0] / step) * step; x <= g.x[1] + 1e-9; x += step)
        lines.push(
          <line
            key={`gx${x}`}
            x1={m.px(x)}
            x2={m.px(x)}
            y1={m.py(g.y[0])}
            y2={m.py(g.y[1])}
            stroke={theme.grid}
          />,
        )
      for (let y = Math.ceil(g.y[0] / stepY) * stepY; y <= g.y[1] + 1e-9; y += stepY)
        lines.push(
          <line
            key={`gy${y}`}
            y1={m.py(y)}
            y2={m.py(y)}
            x1={m.px(g.x[0])}
            x2={m.px(g.x[1])}
            stroke={theme.grid}
          />,
        )
    }
    const ax = Math.min(Math.max(0, g.y[0]), g.y[1])
    const ay = Math.min(Math.max(0, g.x[0]), g.x[1])
    const ticks: ReactNode[] = []
    for (let x = Math.ceil(g.x[0] / step) * step; x <= g.x[1] + 1e-9; x += step) {
      if (Math.abs(x) < 1e-9) continue
      ticks.push(
        <g key={`tx${x}`}>
          <line
            x1={m.px(x)}
            x2={m.px(x)}
            y1={m.py(ax) - 6}
            y2={m.py(ax) + 6}
            stroke={theme.soft}
            strokeWidth={2}
          />
          <text x={m.px(x)} y={m.py(ax) + 30} fill={theme.soft} fontSize={20} textAnchor="middle">
            {nice(x)}
          </text>
        </g>,
      )
    }
    for (let y = Math.ceil(g.y[0] / stepY) * stepY; y <= g.y[1] + 1e-9; y += stepY) {
      if (Math.abs(y) < 1e-9) continue
      ticks.push(
        <g key={`ty${y}`}>
          <line
            y1={m.py(y)}
            y2={m.py(y)}
            x1={m.px(ay) - 6}
            x2={m.px(ay) + 6}
            stroke={theme.soft}
            strokeWidth={2}
          />
          <text x={m.px(ay) - 14} y={m.py(y) + 7} fill={theme.soft} fontSize={20} textAnchor="end">
            {nice(y)}
          </text>
        </g>,
      )
    }
    svg.push(
      <g key="axes">
        {lines}
        <line
          x1={m.px(g.x[0])}
          x2={m.px(g.x[1]) + 14}
          y1={m.py(ax)}
          y2={m.py(ax)}
          stroke={theme.ink}
          strokeWidth={2.5}
          markerEnd="url(#lesson-arrow)"
        />
        <line
          y1={m.py(g.y[0])}
          y2={m.py(g.y[1]) - 14}
          x1={m.px(ay)}
          x2={m.px(ay)}
          stroke={theme.ink}
          strokeWidth={2.5}
          markerEnd="url(#lesson-arrow)"
        />
        {ticks}
        <text
          x={m.px(g.x[1]) + 10}
          y={m.py(ax) - 16}
          fill={theme.ink}
          fontSize={26}
          fontStyle="italic"
          fontFamily={theme.font}
        >
          {g.xlabel}
        </text>
        <text
          x={m.px(ay) + 16}
          y={m.py(g.y[1]) - 4}
          fill={theme.ink}
          fontSize={26}
          fontStyle="italic"
          fontFamily={theme.font}
        >
          {g.ylabel}
        </text>
      </g>,
    )
  }

  const label = (
    key: string,
    x: number,
    y: number,
    text: string,
    color: string,
    p: number,
    anchor: Anchor = 'start',
    size = 26,
  ): ReactNode => {
    if (!text) return null
    const spot = placer.place(x, y, text, size, anchor)
    const moved = Math.hypot(spot.x - x, spot.y - y) > size * 1.6
    const near = nearestEdge(spot.box, x, y - size * 0.35)
    return (
      <g key={key} opacity={ease(p)}>
        {moved ? (
          <line
            x1={x}
            y1={y - size * 0.35}
            x2={near[0]}
            y2={near[1]}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="4 5"
            opacity={0.6}
          />
        ) : null}
        <text
          x={spot.x}
          y={spot.y}
          fill={color}
          fontSize={size}
          textAnchor={anchor}
          fontFamily={theme.font}
          paintOrder="stroke"
          stroke={theme.bg}
          strokeWidth={6}
          strokeLinejoin="round"
        >
          {text}
        </text>
      </g>
    )
  }

  // Areas go underneath everything else.
  const order = [...board.diagram].sort(
    (a, b) => Number(b.item.t === 'area') - Number(a.item.t === 'area'),
  )
  for (const { item, p, focus, key } of order) {
    const glow = focus ? { filter: 'url(#lesson-glow)' } : {}
    const draw = { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - ease(p) }
    switch (item.t) {
      case 'curve': {
        const f = compileFormula(item.fn)
        if (!f) break
        const d = curvePath(f, m, item.from ?? m.xmin, item.to ?? m.xmax)
        const lx = Math.min(item.to ?? m.xmax, m.xmax) - (m.xmax - m.xmin) * 0.04
        const ly = f(lx)
        if (p > 0 && p < 1) {
          const a = Math.max(item.from ?? m.xmin, m.xmin)
          const b = Math.min(item.to ?? m.xmax, m.xmax)
          const px = a + (b - a) * ease(p)
          const py = f(px)
          if (Number.isFinite(py) && py <= m.ymax && py >= m.ymin)
            pen = { x: m.px(px), y: m.py(py), color: col(item.c) }
        }
        svg.push(
          <g key={key} {...glow}>
            <path
              d={d}
              fill="none"
              stroke={col(item.c)}
              strokeWidth={focus ? 6 : 4}
              strokeLinecap="round"
              strokeLinejoin="round"
              {...draw}
              {...(item.dash ? { strokeDasharray: '1 0' } : {})}
            />
            {Number.isFinite(ly) && ly <= m.ymax && ly >= m.ymin
              ? label(`${key}l`, m.px(lx), m.py(ly) - 16, item.label, col(item.c), p, 'end')
              : null}
          </g>,
        )
        break
      }
      case 'area': {
        const top = item.between
          ? curves.get(item.between[0])
          : item.under
            ? curves.get(item.under)
            : undefined
        const bottom = item.between ? curves.get(item.between[1]) : () => 0
        if (!top || !bottom) break
        const a = Math.max(item.from, m.xmin)
        const b = Math.min(item.to, m.xmax)
        const n = 160
        const pts: string[] = []
        for (let i = 0; i <= n; i++) {
          const x = a + ((b - a) * i) / n
          pts.push(`${m.px(x)},${m.py(top(x))}`)
        }
        for (let i = n; i >= 0; i--) {
          const x = a + ((b - a) * i) / n
          pts.push(`${m.px(x)},${m.py(bottom(x))}`)
        }
        const midX = (a + b) / 2
        svg.push(
          <g key={key}>
            <polygon
              points={pts.join(' ')}
              fill={col(item.c)}
              opacity={0.42 * ease(p) * (focus ? 1.5 : 1)}
            />
            {label(
              `${key}l`,
              m.px(midX),
              m.py((top(midX) + bottom(midX)) / 2) + 9,
              item.label,
              theme.ink,
              p,
              'middle',
            )}
          </g>,
        )
        break
      }
      case 'meet': {
        const f = curves.get(item.of[0])
        const g = curves.get(item.of[1])
        if (!f || !g) break
        const xs = crossings(f, g, m.xmin, m.xmax)
        svg.push(
          <g key={key}>
            {xs.map((x, i) => {
              const y = f(x)
              const q = Math.max(0, Math.min(1, p * xs.length - i))
              return (
                <g key={i}>
                  <circle cx={m.px(x)} cy={m.py(y)} r={9 * ease(q)} fill={col(item.c)} />
                  {item.coords
                    ? label(
                        `${key}${i}`,
                        m.px(x) + 14,
                        m.py(y) - 14,
                        `(${nice(x)}, ${nice(y)})`,
                        col(item.c),
                        q,
                      )
                    : null}
                </g>
              )
            })}
          </g>,
        )
        break
      }
      case 'tangent': {
        const f = curves.get(item.of)
        if (!f) break
        const y0 = f(item.x)
        const slope = derivative(f, item.x)
        const half = (m.xmax - m.xmin) * 0.22 * ease(p)
        svg.push(
          <g key={key}>
            <line
              x1={m.px(item.x - half)}
              y1={m.py(y0 - slope * half)}
              x2={m.px(item.x + half)}
              y2={m.py(y0 + slope * half)}
              stroke={col(item.c)}
              strokeWidth={3.5}
              strokeLinecap="round"
            />
            <circle cx={m.px(item.x)} cy={m.py(y0)} r={8} fill={col(item.c)} opacity={ease(p)} />
            {label(
              `${key}l`,
              m.px(item.x) + 16,
              m.py(y0) + 34,
              `gradient ${nice(slope)}`,
              col(item.c),
              p,
            )}
          </g>,
        )
        break
      }
      case 'point':
        svg.push(
          <g key={key} {...glow}>
            <circle
              cx={m.px(item.at[0])}
              cy={m.py(item.at[1])}
              r={9 * ease(p)}
              fill={col(item.c)}
            />
            {label(
              `${key}l`,
              m.px(item.at[0]) + 14,
              m.py(item.at[1]) - 14,
              item.label,
              col(item.c),
              p,
            )}
          </g>,
        )
        break
      case 'line':
      case 'arrow': {
        const [x1, y1] = [m.px(item.from[0]), m.py(item.from[1])]
        const [x2, y2] = [m.px(item.to[0]), m.py(item.to[1])]
        const bend = item.t === 'arrow' ? item.curve : 0
        const mx = (x1 + x2) / 2 - (y2 - y1) * bend * 0.3
        const my = (y1 + y2) / 2 + (x2 - x1) * bend * 0.3
        const d = bend ? `M${x1},${y1} Q${mx},${my} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`
        if (p > 0 && p < 1) {
          const k = ease(p)
          const u = 1 - k
          pen = bend
            ? {
                x: u * u * x1 + 2 * u * k * mx + k * k * x2,
                y: u * u * y1 + 2 * u * k * my + k * k * y2,
                color: col(item.c),
              }
            : { x: x1 + (x2 - x1) * k, y: y1 + (y2 - y1) * k, color: col(item.c) }
        }
        svg.push(
          <g key={key} {...glow}>
            <path
              d={d}
              fill="none"
              stroke={col(item.c)}
              strokeWidth={focus ? 5.5 : 3.5}
              strokeLinecap="round"
              {...draw}
              {...(item.t === 'line' && item.dash
                ? { strokeDasharray: '0.02 0.015', strokeDashoffset: 0, opacity: ease(p) }
                : {})}
              markerEnd={item.t === 'arrow' && p > 0.9 ? `url(#lesson-head-${item.c})` : undefined}
            />
            {label(`${key}l`, mx + 12, my - 12, item.label, col(item.c), p)}
          </g>,
        )
        break
      }
      case 'poly': {
        const d =
          item.points.map(([x, y], i) => `${i ? 'L' : 'M'}${m.px(x)},${m.py(y)}`).join('') +
          (item.close ? 'Z' : '')
        svg.push(
          <g key={key} {...glow}>
            {item.fill !== 'none' ? (
              <path d={d} fill={col(item.fill)} opacity={0.5 * ease(p)} />
            ) : null}
            <path
              d={d}
              fill="none"
              stroke={col(item.c)}
              strokeWidth={3.5}
              strokeLinejoin="round"
              {...draw}
            />
          </g>,
        )
        break
      }
      case 'circle':
        svg.push(
          <g key={key} {...glow}>
            {item.fill !== 'none' ? (
              <circle
                cx={m.px(item.at[0])}
                cy={m.py(item.at[1])}
                r={item.r * m.unit}
                fill={col(item.fill)}
                opacity={0.45 * ease(p)}
              />
            ) : null}
            <circle
              cx={m.px(item.at[0])}
              cy={m.py(item.at[1])}
              r={item.r * m.unit}
              fill="none"
              stroke={col(item.c)}
              strokeWidth={3.5}
              transform={`rotate(-90 ${m.px(item.at[0])} ${m.py(item.at[1])})`}
              {...draw}
            />
          </g>,
        )
        break
      case 'sector': {
        const cx = m.px(item.at[0])
        const cy = m.py(item.at[1])
        const r = item.r * m.unit
        const a1 = (item.from * Math.PI) / 180
        const a2 = ((item.from + (item.to - item.from) * ease(p)) * Math.PI) / 180
        const large = Math.abs(a2 - a1) > Math.PI ? 1 : 0
        const sweep = a2 > a1 ? 0 : 1
        const d = `M${cx},${cy} L${cx + r * Math.cos(a1)},${cy - r * Math.sin(a1)} A${r},${r} 0 ${large} ${sweep} ${cx + r * Math.cos(a2)},${cy - r * Math.sin(a2)} Z`
        const mid = (a1 + a2) / 2
        svg.push(
          <g key={key} {...glow}>
            <path
              d={d}
              fill={item.fill === 'none' ? 'none' : col(item.fill)}
              fillOpacity={0.5}
              stroke={col(item.c)}
              strokeWidth={3}
            />
            {label(
              `${key}l`,
              cx + r * 0.58 * Math.cos(mid),
              cy - r * 0.58 * Math.sin(mid) + 9,
              item.label,
              theme.ink,
              p,
              'middle',
            )}
          </g>,
        )
        break
      }
      case 'rightangle': {
        const s = 22
        const a = (item.dir * Math.PI) / 180
        const b = a + Math.PI / 2
        const cx = m.px(item.at[0])
        const cy = m.py(item.at[1])
        const p1x = cx + s * Math.cos(a)
        const p1y = cy - s * Math.sin(a)
        const p1 = [p1x, p1y]
        const p3 = [cx + s * Math.cos(b), cy - s * Math.sin(b)]
        const p2 = [p1x + s * Math.cos(b), p1y - s * Math.sin(b)]
        svg.push(
          <path
            key={key}
            d={`M${p1.join(',')} L${p2.join(',')} L${p3.join(',')}`}
            fill="none"
            stroke={col(item.c)}
            strokeWidth={2.5}
            opacity={ease(p)}
          />,
        )
        break
      }
      case 'label':
        if (item.tex) {
          html.push(
            <div
              key={key}
              className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
              style={{ left: m.px(item.at[0]), top: m.py(item.at[1]), opacity: ease(p) }}
            >
              <Tex tex={item.tex} color={col(item.c)} size={34 * item.size} />
            </div>,
          )
        } else
          svg.push(
            label(
              key,
              m.px(item.at[0]),
              m.py(item.at[1]) + 9,
              item.text,
              col(item.c),
              p,
              'middle',
              28 * item.size,
            ),
          )
        break
      case 'box': {
        const w = item.w * m.unit
        const h = item.h * m.unit
        const x = m.px(item.at[0]) - w / 2
        const y = m.py(item.at[1]) - h / 2
        svg.push(
          <g key={key} opacity={ease(p)} transform={`translate(0 ${(1 - ease(p)) * 16})`} {...glow}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={16}
              fill={col(item.c)}
              fillOpacity={0.18}
              stroke={col(item.c)}
              strokeWidth={3}
            />
          </g>,
        )
        html.push(
          <div
            key={`${key}t`}
            className="absolute flex items-center justify-center text-center leading-tight"
            style={{
              left: x,
              top: y + (1 - ease(p)) * 16,
              width: w,
              height: h,
              color: theme.ink,
              fontSize: 26,
              fontFamily: theme.font,
              opacity: ease(p),
              padding: 10,
            }}
          >
            {item.text}
          </div>,
        )
        break
      }
      case 'icon': {
        const size = item.size * m.unit
        const cx = m.px(item.at[0])
        const cy = m.py(item.at[1])
        const s = 0.6 + 0.4 * ease(p)
        const Icon = ICONS[item.name]
        svg.push(
          <g key={key} opacity={ease(p)} transform={`translate(${cx} ${cy}) scale(${s})`} {...glow}>
            {item.name === 'cell' || !Icon ? (
              <g>
                <ellipse
                  rx={size / 2}
                  ry={size / 2.6}
                  fill={col(item.c)}
                  fillOpacity={0.15}
                  stroke={col(item.c)}
                  strokeWidth={3}
                />
                <circle
                  cx={size * 0.08}
                  cy={-size * 0.02}
                  r={size / 9}
                  fill={col(item.c)}
                  fillOpacity={0.55}
                />
              </g>
            ) : (
              <Icon
                x={-size / 2}
                y={-size / 2}
                width={size}
                height={size}
                color={col(item.c)}
                strokeWidth={1.6}
              />
            )}
            {item.label ? (
              <text
                y={size / 2 + 34}
                fill={theme.ink}
                fontSize={26}
                textAnchor="middle"
                fontFamily={theme.font}
              >
                {item.label}
              </text>
            ) : null}
          </g>,
        )
        break
      }
      case 'atom': {
        const cx = m.px(item.at[0])
        const cy = m.py(item.at[1])
        const r0 = (item.size * m.unit) / 2
        const shells = item.shells.length
        svg.push(
          <g key={key}>
            <circle cx={cx} cy={cy} r={r0 * 0.28} fill={col(item.c)} opacity={ease(p)} />
            <text
              x={cx}
              y={cy + 10}
              fill={theme.bg}
              fontSize={28}
              fontWeight={700}
              textAnchor="middle"
              opacity={ease(p)}
            >
              {item.symbol}
            </text>
            {item.shells.map((count, si) => {
              const r = r0 * (0.28 + ((si + 1) * 0.72) / Math.max(1, shells))
              const q = Math.max(0, Math.min(1, p * shells - si))
              return (
                <g key={si} opacity={ease(q)}>
                  <circle cx={cx} cy={cy} r={r} fill="none" stroke={theme.soft} strokeWidth={2} />
                  {Array.from({ length: count }, (_, e) => {
                    const a = (e / count) * Math.PI * 2 - Math.PI / 2
                    return (
                      <circle
                        key={e}
                        cx={cx + r * Math.cos(a)}
                        cy={cy + r * Math.sin(a)}
                        r={7}
                        fill={theme.ink}
                      />
                    )
                  })}
                </g>
              )
            })}
          </g>,
        )
        break
      }
      default:
        break
    }
  }

  // The working column scrolls up like a notebook once it is full; the newest line slides in.
  const columnRoom = STAGE_H - top - bottomRoom - 40
  let used = 0
  board.left.forEach(({ item, p }, i) => {
    const h = lineHeight(item, leftW) + 20
    used += i === board.left.length - 1 ? h * Math.min(1, p * 4) : h
  })
  const scroll = Math.max(0, used - columnRoom)
  const writing = board.left.some(({ p }) => p > 0 && p < 1)

  return (
    <div
      ref={box}
      className="relative aspect-video w-full overflow-hidden"
      style={{ background: theme.bg }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}
      >
        <svg
          width={STAGE_W}
          height={STAGE_H}
          viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
          className="absolute inset-0"
        >
          <defs>
            <marker
              id="lesson-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={theme.ink} />
            </marker>
            {(Object.keys(theme.colors) as LessonColor[]).map((c) => (
              <marker
                key={c}
                id={`lesson-head-${c}`}
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path d="M0,0 L10,5 L0,10 z" fill={theme.colors[c]} />
              </marker>
            ))}
            <clipPath id="lesson-frame">
              <rect x={frame.x - 30} y={frame.y - 30} width={frame.w + 60} height={frame.h + 60} />
            </clipPath>
            <filter id="lesson-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g clipPath={board.graph ? 'url(#lesson-frame)' : undefined}>{svg}</g>
          {pen && !writing ? <PenTip x={pen.x} y={pen.y} color={pen.color} /> : null}
        </svg>
        {board.title ? (
          <h2
            className="absolute right-0 left-0 text-center"
            style={{
              top: 34,
              color: theme.ink,
              fontFamily: theme.font,
              fontSize: 52,
              fontWeight: 500,
              letterSpacing: '-0.01em',
            }}
          >
            {board.title}
            <span
              aria-hidden
              className="mx-auto mt-1 block h-[3px] rounded-full"
              style={{
                width: Math.min(900, textWidth(board.title, 52)),
                background: theme.colors.yellow,
                opacity: 0.8,
              }}
            />
          </h2>
        ) : null}
        {board.left.length ? (
          <div
            className="absolute overflow-hidden"
            style={{
              left: leftX - 30,
              top: top,
              width: leftW + 60,
              height: STAGE_H - top - bottomRoom,
              maskImage:
                scroll > 0 ? 'linear-gradient(to bottom, transparent 0, #000 70px)' : undefined,
            }}
          >
            <div
              className="flex flex-col gap-5"
              style={{ padding: '20px 30px', transform: `translateY(${-scroll}px)` }}
            >
              {board.left.map(({ item, p, focus, key }) => {
                const w =
                  item.t === 'math'
                    ? Math.min(leftW, texWidth(item.tex, 42))
                    : item.t === 'text'
                      ? Math.min(leftW, textWidth(item.text, 32))
                      : 0
                const live = p > 0 && p < 1
                return (
                  <div
                    key={key}
                    className="relative"
                    style={{ minHeight: lineHeight(item, leftW) * 0.8 }}
                  >
                    <div
                      style={{
                        width: 'fit-content',
                        maxWidth: leftW,
                        clipPath: `inset(-30% ${(1 - ease(p)) * 100}% -30% -2%)`,
                        filter: focus ? `drop-shadow(0 0 10px ${theme.colors.yellow})` : undefined,
                      }}
                    >
                      {item.t === 'math' ? (
                        <Tex tex={item.tex} color={col(item.c)} size={42} />
                      ) : item.t === 'text' ? (
                        <p
                          style={{
                            color: col(item.c),
                            fontSize: 32,
                            fontFamily: theme.font,
                            lineHeight: 1.35,
                          }}
                        >
                          {item.text}
                        </p>
                      ) : null}
                    </div>
                    {live && (item.t === 'math' || item.t === 'text') ? (
                      <svg
                        className="pointer-events-none absolute overflow-visible"
                        style={{ left: w * ease(p), top: item.t === 'math' ? 46 : 36 }}
                        width={1}
                        height={1}
                      >
                        <PenTip x={0} y={0} color={col(item.c)} />
                      </svg>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
        <div className="absolute inset-0">{html}</div>
        {board.model ? (
          <div
            className="absolute"
            style={{ left: frame.x, top: frame.y - 20, width: frame.w, height: frame.h + 20 }}
          >
            <Model3D
              model={board.model}
              progress={board.modelP}
              colors={theme.colors}
              ink={theme.colors.ink}
              width={frame.w}
              height={frame.h + 20}
            />
          </div>
        ) : null}
        {caption ? (
          <div className="absolute right-0 bottom-6 left-0 flex justify-center px-24">
            <p
              className="rounded-xl px-5 py-2.5 text-center"
              style={{
                background: 'rgba(0,0,0,0.55)',
                color: '#fff',
                fontSize: 27,
                lineHeight: 1.3,
                maxWidth: 1100,
              }}
            >
              {caption}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

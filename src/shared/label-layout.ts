/**
 * Keeps words on a lesson board from landing on top of each other. Every label is placed in
 * order: it tries the spot the drawing asked for, then nearby spots in widening rings, and takes
 * the one that overlaps the least with labels already placed, lines being drawn and anything
 * reserved (the working column, the title, the subtitles). Earlier labels never move, so nothing
 * jumps while a lesson plays.
 */

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type Anchor = 'start' | 'middle' | 'end'

export interface Placement {
  /** Where to draw the text (same anchor and baseline the caller uses). */
  x: number
  y: number
  /** The box the text takes up. */
  box: Box
  /** True when no spot was completely clear. */
  crowded: boolean
}

/** Rough width of handwriting at `size` px; generous so estimates err on the side of room. */
export function textWidth(text: string, size: number): number {
  let w = 0
  for (const ch of text) w += /[\s.,:;'|!]/.test(ch) ? 0.3 : /[mwMW]/.test(ch) ? 0.8 : 0.55
  return w * size
}

/** The box a single line of text takes up, for an SVG text at (x, baseline y). */
export function textBox(x: number, y: number, text: string, size: number, anchor: Anchor): Box {
  const w = textWidth(text, size)
  const left = anchor === 'start' ? x : anchor === 'middle' ? x - w / 2 : x - w
  return { x: left - 6, y: y - size * 0.95, w: w + 12, h: size * 1.25 }
}

export function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/** Offsets tried around the wanted spot, nearest first. */
function candidates(size: number): [number, number][] {
  const out: [number, number][] = [[0, 0]]
  const step = size * 0.9
  for (let ring = 1; ring <= 6; ring++) {
    const r = step * ring
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      out.push([Math.round(Math.cos(a) * r * 1.4), Math.round(Math.sin(a) * r)])
    }
  }
  return out
}

export class LabelPlacer {
  private readonly placed: Box[] = []
  private readonly blocked: Box[] = []
  private readonly points: [number, number][] = []

  constructor(private readonly bounds: Box) {}

  /** Space nothing should be written over (working column, title, subtitles). */
  reserve(box: Box): void {
    this.blocked.push(box)
  }

  /** Points along lines and curves, so labels sit beside them rather than across them. */
  avoidPoints(points: [number, number][]): void {
    for (const p of points) this.points.push(p)
  }

  /** Something already drawn that labels should go around (a box, an icon). */
  occupy(box: Box): void {
    this.placed.push(box)
  }

  place(x: number, y: number, text: string, size: number, anchor: Anchor = 'start'): Placement {
    let best: Placement | null = null
    let bestScore = Infinity
    for (const [dx, dy] of candidates(size)) {
      const box = textBox(x + dx, y + dy, text, size, anchor)
      let score = Math.hypot(dx, dy) * 0.6
      const b = this.bounds
      const outside =
        Math.max(0, b.x - box.x) +
        Math.max(0, box.x + box.w - (b.x + b.w)) +
        Math.max(0, b.y - box.y) +
        Math.max(0, box.y + box.h - (b.y + b.h))
      score += outside * 40
      for (const other of this.placed) score += overlap(box, other) * 4
      for (const other of this.blocked) score += overlap(box, other) * 6
      for (const [px, py] of this.points) {
        if (px > box.x && px < box.x + box.w && py > box.y && py < box.y + box.h) score += 260
      }
      if (score < bestScore) {
        bestScore = score
        best = { x: x + dx, y: y + dy, box, crowded: score > Math.hypot(dx, dy) * 0.6 + 1 }
      }
      // A clear spot at the wanted place or the first ring is good enough.
      if (score === 0) break
    }
    const chosen = best ?? { x, y, box: textBox(x, y, text, size, anchor), crowded: true }
    this.placed.push(chosen.box)
    return chosen
  }
}

/**
 * Geometry for the mascot: the app icon's soft spiky blob, generated instead of hand-traced so
 * the silhouette stays consistent at any size and is easy to tune.
 *
 * All coordinates are in a 200 × 200 view box.
 */

export const VIEW_BOX = 200
export const BODY_CENTRE = { x: 100, y: 112 } as const

export interface Eye {
  cx: number
  cy: number
  r: number
  pupil: number
}

/** As on the icon: the right eye is a little larger and sits a little higher. */
export const EYES: readonly [Eye, Eye] = [
  { cx: 80, cy: 114, r: 17, pupil: 8 },
  { cx: 119, cy: 106, r: 19.5, pupil: 9 },
]

/** The icon's resting glance: up and to the right. */
export const REST_GAZE = { x: 0.62, y: -0.5 } as const

const SPIKES = 7
const SAMPLES = 420
const INNER_RADIUS = 47
const SPIKE_LENGTH = 50
/** Relative spike lengths, clockwise from the top. Slightly uneven, like the icon. */
const SPIKE_SCALE = [1, 0.84, 0.94, 0.8, 0.78, 0.9, 0.86] as const

/**
 * Radius of the blob at `angle` (radians, 0 = straight up, clockwise), before smoothing.
 * A sharpened triangle wave gives narrow spikes and wide valleys; spikes shrink toward the
 * bottom so the character sits instead of floating.
 */
export function rawRadius(angle: number): number {
  const turn = angle / (2 * Math.PI)
  const position = turn * SPIKES
  const phase = position - Math.floor(position)
  const wave = Math.abs(2 * phase - 1) ** 1.25
  const spike = Math.round(position) % SPIKES
  const sit = 0.55 + 0.45 * ((1 + Math.cos(angle)) / 2)
  return INNER_RADIUS + SPIKE_LENGTH * wave * (SPIKE_SCALE[spike] ?? 1) * sit
}

/** Circular moving average: rounds both the spike tips and the valleys. */
export function smoothCircular(
  values: readonly number[],
  window: number,
  passes: number,
): number[] {
  let current = [...values]
  const half = Math.floor(window / 2)
  const n = current.length
  for (let pass = 0; pass < passes; pass++) {
    const next = new Array<number>(n)
    for (let i = 0; i < n; i++) {
      let sum = 0
      for (let k = -half; k <= half; k++) sum += current[(i + k + n) % n] ?? 0
      next[i] = sum / (2 * half + 1)
    }
    current = next
  }
  return current
}

function round(value: number): string {
  return value.toFixed(2)
}

/** The closed SVG path of the body. */
export function buildBodyPath(): string {
  const raw = Array.from({ length: SAMPLES }, (_, i) => rawRadius((i / SAMPLES) * 2 * Math.PI))
  const radii = smoothCircular(raw, 9, 2)
  const points = radii.map((radius, i) => {
    const angle = (i / SAMPLES) * 2 * Math.PI
    const x = BODY_CENTRE.x + radius * Math.sin(angle)
    const y = BODY_CENTRE.y - radius * Math.cos(angle)
    return `${round(x)} ${round(y)}`
  })
  return `M${points.join('L')}Z`
}

export const BODY_PATH = buildBodyPath()

/**
 * Where the pupil sits for a gaze direction. `gaze` is a vector with length ≤ 1; the pupil
 * travels to the rim of the eye, so it is cut by the edge rather than floating in the middle.
 */
export function pupilOffset(eye: Eye, gaze: { x: number; y: number }): { x: number; y: number } {
  const length = Math.hypot(gaze.x, gaze.y)
  const scale = length > 1 ? 1 / length : 1
  const travel = eye.r - eye.pupil * 0.82
  return { x: gaze.x * scale * travel, y: gaze.y * scale * travel }
}

/** Turns a pointer position into a gaze vector for an element centred at (cx, cy). */
export function gazeToward(
  pointer: { x: number; y: number },
  centre: { x: number; y: number },
  reach = 160,
): { x: number; y: number } {
  const dx = pointer.x - centre.x
  const dy = pointer.y - centre.y
  const distance = Math.hypot(dx, dy)
  if (distance < 1) return { x: 0, y: 0 }
  const strength = Math.min(1, distance / reach)
  return { x: (dx / distance) * strength, y: (dy / distance) * strength }
}

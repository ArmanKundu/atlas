import { describe, expect, it } from 'vitest'
import {
  BODY_CENTRE,
  BODY_PATH,
  EYES,
  VIEW_BOX,
  gazeToward,
  pupilOffset,
  rawRadius,
  smoothCircular,
} from '@/mascot/shape'

function pathPoints(path: string): { x: number; y: number }[] {
  return path
    .replace(/^M|Z$/g, '')
    .split('L')
    .map((pair) => {
      const [x, y] = pair.split(' ').map(Number)
      return { x: x ?? NaN, y: y ?? NaN }
    })
}

describe('mascot body', () => {
  it('is a closed path that stays inside the view box', () => {
    expect(BODY_PATH.startsWith('M')).toBe(true)
    expect(BODY_PATH.endsWith('Z')).toBe(true)
    for (const { x, y } of pathPoints(BODY_PATH)) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(VIEW_BOX)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(VIEW_BOX)
    }
  })

  it('has seven spikes, the tallest pointing up', () => {
    const radii = pathPoints(BODY_PATH).map((p) =>
      Math.hypot(p.x - BODY_CENTRE.x, p.y - BODY_CENTRE.y),
    )
    const n = radii.length
    let peaks = 0
    for (let i = 0; i < n; i++) {
      const prev = radii[(i - 1 + n) % n] ?? 0
      const next = radii[(i + 1) % n] ?? 0
      const here = radii[i] ?? 0
      if (here > prev && here >= next) peaks++
    }
    expect(peaks).toBe(7)
    expect(radii.indexOf(Math.max(...radii))).toBe(0)
  })

  it('keeps both eyes inside the body', () => {
    for (const eye of EYES) {
      const distance = Math.hypot(eye.cx - BODY_CENTRE.x, eye.cy - BODY_CENTRE.y)
      expect(distance + eye.r).toBeLessThan(rawRadius(Math.PI))
    }
  })
})

describe('smoothCircular', () => {
  it('preserves the mean and reduces the range', () => {
    const values = [0, 10, 0, 10, 0, 10, 0, 10]
    const smooth = smoothCircular(values, 3, 1)
    const mean = (list: number[]): number => list.reduce((a, b) => a + b, 0) / list.length
    expect(mean(smooth)).toBeCloseTo(mean(values))
    expect(Math.max(...smooth) - Math.min(...smooth)).toBeLessThan(10)
  })
})

describe('gaze', () => {
  const [eye] = EYES

  it('keeps the pupil inside the eye for any gaze, even an over-long one', () => {
    for (const gaze of [
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 5, y: 5 },
      { x: -0.3, y: 0.2 },
    ]) {
      const offset = pupilOffset(eye, gaze)
      expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(eye.r)
    }
  })

  it('looks toward the pointer and saturates with distance', () => {
    const centre = { x: 100, y: 100 }
    expect(gazeToward(centre, centre)).toEqual({ x: 0, y: 0 })

    const near = gazeToward({ x: 140, y: 100 }, centre, 160)
    expect(near.x).toBeCloseTo(0.25)
    expect(near.y).toBeCloseTo(0)

    const far = gazeToward({ x: 100, y: -900 }, centre, 160)
    expect(far.x).toBeCloseTo(0)
    expect(far.y).toBeCloseTo(-1)
  })
})

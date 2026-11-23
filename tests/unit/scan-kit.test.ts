import { describe, expect, it } from 'vitest'
import { scanKit } from '../../src/shared/scan-kit'

const kit = scanKit()

/** A dark desk with a light, slightly rotated page on it. */
function photo(w: number, h: number, corners: [number, number][]): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4)
  const inside = (x: number, y: number): boolean => {
    let hit = false
    for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
      const [xi, yi] = corners[i] as [number, number]
      const [xj, yj] = corners[j] as [number, number]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
    }
    return hit
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = inside(x, y) ? 235 : 70
      const o = (y * w + x) * 4
      px[o] = v
      px[o + 1] = v
      px[o + 2] = v - 10
      px[o + 3] = 255
    }
  return px
}

describe('scanKit', () => {
  it('finds the corners of a tilted page', () => {
    const w = 300
    const h = 400
    const corners: [number, number][] = [
      [60, 50],
      [250, 70],
      [235, 360],
      [40, 340],
    ]
    const quad = kit.detectQuad(photo(w, h, corners), w, h)
    expect(quad).not.toBeNull()
    quad?.forEach(([fx, fy], i) => {
      const [cx, cy] = corners[i] as [number, number]
      expect(Math.abs(fx * w - cx)).toBeLessThan(6)
      expect(Math.abs(fy * h - cy)).toBeLessThan(6)
    })
  })

  it('returns null when there is no page', () => {
    const px = new Uint8ClampedArray(100 * 100 * 4).fill(80)
    expect(kit.detectQuad(px, 100, 100)).toBeNull()
  })

  it('straightens the page into a rectangle of page pixels', () => {
    const w = 300
    const h = 400
    const corners: [number, number][] = [
      [60, 50],
      [250, 70],
      [235, 360],
      [40, 340],
    ]
    const src = photo(w, h, corners)
    const [W, H] = kit.pageSize(corners, 2000)
    const out = kit.warp(src, w, h, corners, W, H)
    // The middle and the corners of the straightened page are page-coloured, not desk.
    for (const [x, y] of [
      [W / 2, H / 2],
      [4, 4],
      [W - 5, H - 5],
    ] as const) {
      const o = ((Math.round(y) * W + Math.round(x)) * 4) | 0
      expect(out[o]).toBeGreaterThan(200)
    }
  })

  it('black and white keeps ink and whitens the paper', () => {
    const w = 80
    const h = 80
    const px = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const x = i % w
      const ink = x >= 38 && x <= 41
      const v = ink ? 60 : 180 - x // paper gets darker to the right, like a shadow
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v
      px[i * 4 + 3] = 255
    }
    kit.filter(px, w, h, 'bw')
    expect(px[(40 * w + 40) * 4]).toBe(0)
    expect(px[(40 * w + 5) * 4]).toBe(255)
    expect(px[(40 * w + 75) * 4]).toBe(255)
  })
})

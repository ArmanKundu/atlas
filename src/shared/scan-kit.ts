/**
 * Page scanning maths used by the phone scanner page: find a page's corners in a photo,
 * straighten it, and clean it up. It is one self-contained function so the phone page can embed
 * its source text (`scanKit.toString()`) and the tests can call it directly. Do not use imports
 * or anything outside the function body in here.
 */
export function scanKit() {
  type Pt = [number, number]
  type Filter = 'original' | 'color' | 'gray' | 'bw'

  const luma = (r: number, g: number, b: number): number => r * 0.299 + g * 0.587 + b * 0.114

  function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
    const tmp = new Float32Array(w * h)
    const out = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      let acc = 0
      for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))] ?? 0
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / (2 * r + 1)
        const add = Math.min(w - 1, x + r + 1)
        const sub = Math.max(0, x - r)
        acc += (src[y * w + add] ?? 0) - (src[y * w + sub] ?? 0)
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x] ?? 0
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc / (2 * r + 1)
        const add = Math.min(h - 1, y + r + 1)
        const sub = Math.max(0, y - r)
        acc += (tmp[add * w + x] ?? 0) - (tmp[sub * w + x] ?? 0)
      }
    }
    return out
  }

  function otsu(values: Float32Array): number {
    const hist = new Float64Array(256)
    for (const v of values) {
      const bin = Math.max(0, Math.min(255, v | 0))
      hist[bin] = (hist[bin] ?? 0) + 1
    }
    const total = values.length
    let sum = 0
    for (let i = 0; i < 256; i++) sum += i * (hist[i] ?? 0)
    let sumB = 0
    let wB = 0
    let best = 0
    let threshold = 127
    for (let i = 0; i < 256; i++) {
      wB += hist[i] ?? 0
      if (wB === 0) continue
      const wF = total - wB
      if (wF === 0) break
      sumB += i * (hist[i] ?? 0)
      const mB = sumB / wB
      const mF = (sum - sumB) / wF
      const between = wB * wF * (mB - mF) * (mB - mF)
      if (between > best) {
        best = between
        threshold = i
      }
    }
    return threshold
  }

  function area(q: Pt[]): number {
    let a = 0
    for (let i = 0; i < q.length; i++) {
      const p = q[i] as Pt
      const n = q[(i + 1) % q.length] as Pt
      a += p[0] * n[1] - n[0] * p[1]
    }
    return Math.abs(a) / 2
  }

  /**
   * Finds the page in a small RGBA image (about 400 px across). Returns its corners as
   * fractions of the image size, clockwise from top left, or null if no page stands out.
   */
  function detectQuad(rgba: Uint8ClampedArray, w: number, h: number): Pt[] | null {
    const gray = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++)
      gray[i] = luma(rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0)
    const soft = boxBlur(boxBlur(gray, w, h, 2), w, h, 2)
    const t = otsu(soft)
    // Paper is lighter than what it lies on. Keep the biggest light region.
    const mask = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) mask[i] = (soft[i] ?? 0) > t ? 1 : 0
    const label = new Int32Array(w * h)
    const stack = new Int32Array(w * h)
    let bestId = 0
    let bestSize = 0
    let id = 0
    for (let start = 0; start < w * h; start++) {
      if (!mask[start] || label[start]) continue
      id++
      let size = 0
      let top = 0
      stack[top++] = start
      label[start] = id
      while (top > 0) {
        const p = stack[--top] ?? 0
        size++
        const x = p % w
        const y = (p - x) / w
        const near = [
          x > 0 ? p - 1 : -1,
          x < w - 1 ? p + 1 : -1,
          y > 0 ? p - w : -1,
          y < h - 1 ? p + w : -1,
        ]
        for (const q of near) {
          if (q >= 0 && mask[q] && !label[q]) {
            label[q] = id
            stack[top++] = q
          }
        }
      }
      if (size > bestSize) {
        bestSize = size
        bestId = id
      }
    }
    if (bestSize < w * h * 0.12) return null
    let tl: Pt = [0, 0]
    let tr: Pt = [0, 0]
    let br: Pt = [0, 0]
    let bl: Pt = [0, 0]
    let minSum = Infinity
    let maxSum = -Infinity
    let minDiff = Infinity
    let maxDiff = -Infinity
    for (let p = 0; p < w * h; p++) {
      if (label[p] !== bestId) continue
      const x = p % w
      const y = (p - x) / w
      if (x + y < minSum) {
        minSum = x + y
        tl = [x, y]
      }
      if (x + y > maxSum) {
        maxSum = x + y
        br = [x, y]
      }
      if (x - y > maxDiff) {
        maxDiff = x - y
        tr = [x, y]
      }
      if (x - y < minDiff) {
        minDiff = x - y
        bl = [x, y]
      }
    }
    const quad: Pt[] = [tl, tr, br, bl]
    if (area(quad) < w * h * 0.12) return null
    return quad.map(([x, y]) => [(x + 0.5) / w, (y + 0.5) / h] as Pt)
  }

  /** Solves A·x = b (8×8) by Gaussian elimination. */
  function solve(a: number[][], b: number[]): number[] {
    const n = b.length
    const m = a.map((row, i) => [...row, b[i] ?? 0])
    for (let c = 0; c < n; c++) {
      let pivot = c
      for (let r = c + 1; r < n; r++)
        if (Math.abs(m[r]?.[c] ?? 0) > Math.abs(m[pivot]?.[c] ?? 0)) pivot = r
      const tmp = m[c] as number[]
      m[c] = m[pivot] as number[]
      m[pivot] = tmp
      const row = m[c] as number[]
      const d = row[c] || 1e-12
      for (let k = c; k <= n; k++) row[k] = (row[k] ?? 0) / d
      for (let r = 0; r < n; r++) {
        if (r === c) continue
        const other = m[r] as number[]
        const f = other[c] ?? 0
        for (let k = c; k <= n; k++) other[k] = (other[k] ?? 0) - f * (row[k] ?? 0)
      }
    }
    return m.map((row) => row[n] ?? 0)
  }

  /** The output size for a page with these corners (in pixels), capped at `max` on the long side. */
  function pageSize(quad: Pt[], max: number): [number, number] {
    const d = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1])
    const [tl, tr, br, bl] = quad as [Pt, Pt, Pt, Pt]
    let w = (d(tl, tr) + d(bl, br)) / 2
    let h = (d(tl, bl) + d(tr, br)) / 2
    const s = Math.min(1, max / Math.max(w, h))
    w = Math.max(1, Math.round(w * s))
    h = Math.max(1, Math.round(h * s))
    return [w, h]
  }

  /**
   * Straightens the page: maps the corners (in source pixels, clockwise from top left) onto a
   * W×H rectangle with bilinear sampling. Returns RGBA pixels.
   */
  function warp(
    src: Uint8ClampedArray,
    sw: number,
    sh: number,
    quad: Pt[],
    W: number,
    H: number,
  ): Uint8ClampedArray {
    const dst: Pt[] = [
      [0, 0],
      [W, 0],
      [W, H],
      [0, H],
    ]
    const A: number[][] = []
    const B: number[] = []
    for (let i = 0; i < 4; i++) {
      const [x, y] = dst[i] as Pt
      const [u, v] = quad[i] as Pt
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
      B.push(u)
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y])
      B.push(v)
    }
    const [a, b, c, d, e, f, g, hh] = solve(A, B) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ]
    const out = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const den = g * x + hh * y + 1
        const u = Math.min(sw - 1.001, Math.max(0, (a * x + b * y + c) / den))
        const v = Math.min(sh - 1.001, Math.max(0, (d * x + e * y + f) / den))
        const x0 = u | 0
        const y0 = v | 0
        const fx = u - x0
        const fy = v - y0
        const i00 = (y0 * sw + x0) * 4
        const i10 = i00 + 4
        const i01 = i00 + sw * 4
        const i11 = i01 + 4
        const o = (y * W + x) * 4
        for (let k = 0; k < 3; k++) {
          const top = (src[i00 + k] ?? 0) * (1 - fx) + (src[i10 + k] ?? 0) * fx
          const bottom = (src[i01 + k] ?? 0) * (1 - fx) + (src[i11 + k] ?? 0) * fx
          out[o + k] = top * (1 - fy) + bottom * fy
        }
        out[o + 3] = 255
      }
    }
    return out
  }

  /** Cleans up a straightened page in place. */
  function filter(px: Uint8ClampedArray, w: number, h: number, kind: Filter): void {
    if (kind === 'original') return
    const n = w * h
    const gray = new Float32Array(n)
    for (let i = 0; i < n; i++)
      gray[i] = luma(px[i * 4] ?? 0, px[i * 4 + 1] ?? 0, px[i * 4 + 2] ?? 0)
    if (kind === 'bw') {
      // Adaptive threshold against the local average, so shadows and uneven light disappear.
      const r = Math.max(8, Math.round(Math.max(w, h) / 40))
      const mean = boxBlur(gray, w, h, r)
      for (let i = 0; i < n; i++) {
        const v = (gray[i] ?? 0) < (mean[i] ?? 0) * 0.88 ? 0 : 255
        px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v
      }
      return
    }
    // Lift the paper to white using the local background, then stretch the contrast.
    const r = Math.max(10, Math.round(Math.max(w, h) / 25))
    const bg = boxBlur(gray, w, h, r)
    for (let i = 0; i < n; i++) {
      const lift = 245 / Math.max(60, (bg[i] ?? 0) + 18)
      for (let k = 0; k < 3; k++) {
        const v = kind === 'gray' ? (gray[i] ?? 0) : (px[i * 4 + k] ?? 0)
        let out = v * lift
        out = (out - 20) * 1.12
        px[i * 4 + k] = out > 236 ? 255 : out
      }
    }
  }

  return { detectQuad, warp, filter, pageSize }
}

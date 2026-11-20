import type { Region } from '@shared/models'
import type { PDFDocumentProxy } from '@/lib/pdf'

/** Keeps a drawn box inside the page and gives it a sensible minimum size. */
export function normaliseRegion(
  page: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Region | null {
  const clamp = (v: number): number => Math.min(1, Math.max(0, v))
  const x = clamp(Math.min(ax, bx))
  const y = clamp(Math.min(ay, by))
  const w = clamp(Math.max(ax, bx)) - x
  const h = clamp(Math.max(ay, by)) - y
  if (w < 0.02 || h < 0.01) return null
  const round = (v: number): number => Math.round(v * 10_000) / 10_000
  return { page, x: round(x), y: round(y), w: round(w), h: round(h) }
}

/** The text the PDF has inside a box, in reading order. Scanned pages give an empty string. */
export async function regionText(doc: PDFDocumentProxy, region: Region): Promise<string> {
  const page = await doc.getPage(region.page)
  const view = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const left = region.x * view.width
  const right = (region.x + region.w) * view.width
  const top = region.y * view.height
  const bottom = (region.y + region.h) * view.height
  let text = ''
  for (const item of content.items) {
    if (!('str' in item)) continue
    const [, , , , ex, ey] = item.transform as number[]
    const x = ex ?? 0
    // PDF space runs bottom-up; the box is measured top-down.
    const y = view.height - (ey ?? 0)
    if (x >= left - 2 && x <= right && y >= top && y <= bottom + 4) {
      text += item.str + (item.hasEOL ? '\n' : '')
    }
  }
  page.cleanup()
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Text of every box of a question, joined. */
export async function questionText(doc: PDFDocumentProxy, regions: Region[]): Promise<string> {
  const parts = await Promise.all(regions.map((region) => regionText(doc, region)))
  return parts.filter(Boolean).join('\n\n')
}

/** Guesses "Question 3" or "3a" from the start of the text in a box. */
export function guessNumber(text: string): string | null {
  const match = /^\s*(?:question\s+)?(\d{1,2}[a-z]?(?:\.\d)?)\b/i.exec(text)
  return match?.[1] ?? null
}

/** Guesses the marks from "(3 marks)" or "3 marks" in the text. */
export function guessMarks(text: string): number | null {
  const all = [...text.matchAll(/\(?\b(\d{1,2})\s*marks?\b\)?/gi)].map((m) => Number(m[1]))
  if (all.length === 0) return null
  return all.reduce((sum, n) => sum + n, 0)
}

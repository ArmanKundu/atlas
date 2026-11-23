import type { Question } from '@shared/models'

/** One line of a question's stem, without Markdown or LaTeX noise. */
export function stemPreview(stem: string, max = 180): string {
  const flat = stem
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[#*_`>$\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export function questionName(q: Pick<Question, 'year' | 'paper' | 'number' | 'label'>): string {
  return (
    [q.year, q.paper, q.number ? `Q${q.number}` : null].filter(Boolean).join(' · ') ||
    q.label ||
    'Question'
  )
}

/** Syllabus units a level covers ("Units 3 and 4" → [3, 4]); none for anything else. */
export function unitsFor(level: string | null): number[] {
  const m = /units?\s*(\d)\s*(?:and|&|-|to)\s*(\d)/i.exec(level ?? '')
  if (!m) return []
  const a = Number(m[1])
  const b = Number(m[2])
  return [a, b].filter((u) => u >= 1 && u <= 4)
}

import type { SourceKind } from '@shared/models'

export interface KindGuess {
  kind: SourceKind
  /** 0 to 1. Below 0.8 the UI asks the user to confirm. */
  confidence: number
}

interface Rule {
  kind: SourceKind
  pattern: RegExp
  /** Confidence when the file name matches / when only the first page matches. */
  name: number
  page: number
}

// Order matters: an examiner report or a solutions booklet also says "examination".
const RULES: Rule[] = [
  {
    kind: 'study_design',
    pattern: /study\s*design|syllabus|subject\s*guide|specification|course\s*outline|curriculum/,
    name: 0.95,
    page: 0.85,
  },
  {
    kind: 'examiner_report',
    pattern:
      /examiner'?s?\s*report|examination\s*report|assessment\s*report|chief\s*assessor|marker'?s?\s*(report|comments)|notes\s*from\s*the\s*marking/,
    name: 0.95,
    page: 0.9,
  },
  {
    kind: 'solutions',
    pattern:
      /solutions?|worked\s*answers|suggested\s*answers|answers?\b|marking\s*(guide|scheme|guidelines|key)|mark\s*scheme/,
    name: 0.9,
    page: 0.8,
  },
  {
    kind: 'data_book',
    pattern: /data\s*book(let)?|formula\s*(sheet|book(let)?)|periodic\s*table|reference\s*sheet/,
    name: 0.95,
    page: 0.85,
  },
  {
    kind: 'exam',
    pattern:
      /written\s*examination|examination|\bexam\b|trial\s*paper|practice\s*paper|\bpaper\s*[12ab]\b|question\s*and\s*answer\s*book/,
    name: 0.9,
    page: 0.85,
  },
  {
    kind: 'worksheet',
    pattern: /worksheet|homework|problem\s*set|exercise\s*sheet|tutorial\s*sheet/,
    name: 0.85,
    page: 0.7,
  },
  {
    kind: 'textbook',
    pattern: /textbook|text\s*book|\bchapter\s*\d+|\bedition\b/,
    name: 0.8,
    page: 0.6,
  },
  {
    kind: 'class_notes',
    pattern: /lecture|class\s*notes|\bnotes\b|slides|summary/,
    name: 0.75,
    page: 0.55,
  },
]

/** Guesses the document type from the file name and the first page's text. No AI involved. */
export function detectKind(fileName: string, firstPageText = ''): KindGuess {
  const name = fileName.toLowerCase().replace(/[_\-.]+/g, ' ')
  const page = firstPageText.toLowerCase().slice(0, 2500)

  for (const rule of RULES) {
    if (rule.pattern.test(name)) return { kind: rule.kind, confidence: rule.name }
  }
  for (const rule of RULES) {
    if (rule.pattern.test(page)) return { kind: rule.kind, confidence: rule.page }
  }
  return { kind: 'other', confidence: 0.3 }
}

/** A four-digit year in the file name, if there is exactly one plausible candidate. */
export function detectYear(fileName: string): number | null {
  const years = [...fileName.matchAll(/(?<!\d)(19[89]\d|20[0-4]\d)(?!\d)/g)].map((m) =>
    Number(m[1]),
  )
  const unique = [...new Set(years)]
  return unique.length === 1 ? (unique[0] ?? null) : null
}

/** A readable title from a file name: no extension, separators to spaces. */
export function titleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, '')
  const cleaned = base
    .replace(/(?<=\S)[_-]+(?=\S)/g, ' ')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || fileName
}

/** Splits plain text into page-sized chunks on form feeds, or on paragraph breaks near `size`. */
export function splitTextIntoPages(text: string, size = 3200): string[] {
  const byFormFeed = text
    .split('\f')
    .map((part) => part.trim())
    .filter(Boolean)
  if (byFormFeed.length > 1) return byFormFeed
  const pages: string[] = []
  let current = ''
  for (const paragraph of text.split(/\n{2,}/)) {
    if (current && current.length + paragraph.length > size) {
      pages.push(current.trim())
      current = ''
    }
    current += `${paragraph}\n\n`
    while (current.length > size * 2) {
      pages.push(current.slice(0, size))
      current = current.slice(size)
    }
  }
  if (current.trim()) pages.push(current.trim())
  return pages
}

import type { PaperGroup } from './models'

/**
 * Recognising past papers from file names, and pairing each paper with its examiner report.
 * Works on the names official papers are published under ("2023MM1-w.pdf",
 * "2021mathmethods1-report.pdf", "NHT 2022chem-nht-w.pdf") and on titles a person typed.
 */

export type FileRole = 'paper' | 'report' | 'solutions' | 'aid'

export interface FileGuess {
  role: FileRole
  year: number
  sitting: 'main' | 'nht'
  /** Exam number for subjects with two exams (Methods 1 and 2), or null. */
  exam: string | null
  subjectKey: string | null
}

/** Subject keys, how a file name mentions them, and the first year of the current study design. */
export const SUBJECT_KEYS: { key: string; name: RegExp; file: RegExp; since: number }[] = [
  {
    key: 'methods',
    name: /method/i,
    file: /\bmm ?[12]|mm[12]|math(s)?methods|methods/i,
    since: 2023,
  },
  {
    key: 'specialist',
    name: /specialist/i,
    file: /\bsm ?[12]|sm[12]|spec(ialist)?maths?|specmath/i,
    since: 2023,
  },
  { key: 'chemistry', name: /chem/i, file: /chem/i, since: 2024 },
  { key: 'english', name: /^english$|english(?! ?lang)/i, file: /english(?!-?lang)/i, since: 2024 },
  { key: 'accounting', name: /account/i, file: /account/i, since: 2023 },
  { key: 'biology', name: /biolog/i, file: /bio/i, since: 2022 },
  { key: 'physics', name: /physic/i, file: /physic/i, since: 2024 },
]

export function subjectKeyFor(subjectName: string): string | null {
  return SUBJECT_KEYS.find((s) => s.name.test(subjectName))?.key ?? null
}

/** Reads year, sitting, exam number and role from a file name. Null when it is not a paper. */
export function classifyFile(name: string): FileGuess | null {
  const base = name.replace(/\.(pdf|docx?)$/i, '')
  const yearMatch = /(20\d\d)/.exec(base) ?? /examrep(\d\d)\b/i.exec(base)
  if (!yearMatch?.[1]) return null
  const year = yearMatch[1].length === 2 ? 2000 + Number(yearMatch[1]) : Number(yearMatch[1])
  const lower = base.toLowerCase()
  if (/lang/.test(lower) && /english/.test(lower)) return null // English Language is its own subject
  if (/answer ?book/.test(lower)) return null

  let role: FileRole = 'paper'
  if (/report|examrep|exam-rep|markguide|marking/.test(lower)) role = 'report'
  else if (/solution|answers|suggested/.test(lower)) role = 'solutions'
  else if (/data ?book|formula/.test(lower)) role = 'aid'
  else if (!/-w\b|exam|paper|\bw$/.test(lower) && !/(mm|sm|specmaths?|chem|english)/.test(lower))
    return null

  const sitting = /nht|\bnh-/.test(lower) ? 'nht' : 'main'
  const withoutYear = lower.replace(/20\d\d/g, ' ')
  const examMatch =
    /(?:mm|sm|methods|mathmethods|mathsmethods|specmaths?|specialistmaths?)[ _-]?([12])(?!\d)/.exec(
      withoutYear,
    )
  const subjectKey = SUBJECT_KEYS.find((s) => s.file.test(lower))?.key ?? null
  return { role, year, sitting, exam: examMatch?.[1] ?? null, subjectKey }
}

export interface PaperFile {
  id: string
  name: string
  subjectId: string | null
}

export interface PairedPaper {
  paper: PaperFile
  report: PaperFile | null
  solutions: PaperFile | null
  year: number
  sitting: 'main' | 'nht'
  exam: string | null
  subjectKey: string | null
  title: string
  group: PaperGroup
}

const SHORT: Record<string, string> = { methods: 'Methods', specialist: 'Specialist' }

/** The title a paper is shown under, like "2024 VCAA Exam 2" or "2023 VCAA Exam (NHT)". */
export function paperTitle(year: number, sitting: string, exam: string | null): string {
  return `${year} VCAA Exam${exam ? ` ${exam}` : ''}${sitting === 'nht' ? ' (NHT)' : ''}`
}

export function paperGroup(year: number, sitting: string, subjectKey: string | null): PaperGroup {
  const since = SUBJECT_KEYS.find((s) => s.key === subjectKey)?.since ?? 0
  if (year < since) return 'earlier'
  return sitting === 'nht' ? 'nht' : 'official'
}

/** Groups files into papers, each with the report and solutions of the same year and sitting. */
export function pairPapers(files: PaperFile[]): PairedPaper[] {
  const guesses = files.flatMap((file) => {
    const guess = classifyFile(file.name)
    return guess ? [{ file, guess }] : []
  })
  const key = (g: FileGuess): string => `${g.subjectKey}|${g.year}|${g.sitting}|${g.exam ?? ''}`
  const find = (role: FileRole, k: string): PaperFile | null =>
    guesses.find((x) => x.guess.role === role && key(x.guess) === k)?.file ?? null
  return guesses
    .filter((x) => x.guess.role === 'paper')
    .map(({ file, guess }) => {
      const k = key(guess)
      return {
        paper: file,
        report: find('report', k),
        solutions: find('solutions', k),
        year: guess.year,
        sitting: guess.sitting,
        exam: guess.exam,
        subjectKey: guess.subjectKey,
        title: paperTitle(guess.year, guess.sitting, guess.exam),
        group: paperGroup(guess.year, guess.sitting, guess.subjectKey),
      }
    })
    .sort(
      (a, b) =>
        b.year - a.year ||
        a.sitting.localeCompare(b.sitting) ||
        (a.exam ?? '').localeCompare(b.exam ?? ''),
    )
}

export const SHORT_SUBJECT = SHORT

/**
 * Reads a question reference typed into "Find a question": "2019 B4", "2023 Q7",
 * "MM 2023 E1 Q7", "Spesh 2024 E2 B3c", "question 9 NHT".
 */
export function parseReference(input: string): {
  year: number | null
  sitting: 'main' | 'nht' | null
  exam: string | null
  section: string | null
  number: string | null
} | null {
  const text = input.trim().toLowerCase()
  if (!text || text.length > 60) return null
  const year = /\b(20\d\d)\b/.exec(text)?.[1]
  const exam = /\be(?:xam)? ?([12])\b/.exec(text)?.[1] ?? null
  const q =
    /\b([abc])\s?(\d{1,2}[a-z]?)\b/.exec(text) ?? /\b(?:q|question)\s?(\d{1,2}[a-z]?)\b/.exec(text)
  if (!q) return null
  const section = q.length === 3 && /^[abc]$/.test(q[1] ?? '') ? (q[1] ?? '').toUpperCase() : null
  const number = (section ? q[2] : q[1]) ?? null
  if (!year && !section && !/\b(q|question)\b/.test(text)) return null
  return {
    year: year ? Number(year) : null,
    sitting: /nht/.test(text) ? 'nht' : year ? 'main' : null,
    exam,
    section,
    number,
  }
}

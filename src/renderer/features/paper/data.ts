import type { Attempt, Paper, Question, Source, Subject } from '@shared/models'
import { pairPapers, subjectKeyFor } from '@shared/papers'
import { db } from '@/lib/api'
import { detectCommandTerms } from './terms'

export const GROUP_LABEL: Record<Paper['grp'], string> = {
  official: 'Official · current study design',
  nht: 'Official · NHT',
  earlier: 'Official · earlier study designs',
  mine: 'Your papers',
}

export type Difficulty = 'Easy' | 'Medium' | 'Hard' | 'Very hard'

/** Difficulty from the state average (percent of marks), or the stored 1–4 rating. */
export function difficultyOf(
  question: Pick<Question, 'difficulty' | 'stateAverage' | 'mc'>,
): Difficulty | null {
  let avg = question.stateAverage
  if (avg === null && question.mc.answer && question.mc.pct)
    avg = question.mc.pct[question.mc.answer] ?? null
  if (avg !== null) {
    if (avg >= 70) return 'Easy'
    if (avg >= 50) return 'Medium'
    if (avg >= 30) return 'Hard'
    return 'Very hard'
  }
  if (question.difficulty === null) return null
  return (
    (['Easy', 'Medium', 'Hard', 'Very hard'] as const)[
      Math.max(0, Math.min(3, question.difficulty - 1))
    ] ?? null
  )
}

export const DIFFICULTY_CLASS: Record<Difficulty, string> = {
  Easy: 'bg-success-soft text-success',
  Medium: 'bg-warn-soft text-warn',
  Hard: 'bg-danger-soft text-danger',
  'Very hard': 'bg-danger text-white',
}

export function isMultipleChoice(question: Pick<Question, 'mc' | 'qtype'>): boolean {
  return Boolean(question.mc.answer) || question.qtype === 'mcq'
}

export function termsOf(question: Pick<Question, 'commandTerms' | 'stemMd'>): string[] {
  return question.commandTerms.length ? question.commandTerms : detectCommandTerms(question.stemMd)
}

/** "40 MCQ · 10 Section B", "9 questions · 40 marks", or the page count when nothing is marked. */
export function structureLine(
  paper: Paper,
  questions: Question[],
  pageCount: number | null,
): string {
  if (paper.structure) return paper.structure
  if (questions.length === 0)
    return pageCount ? `${pageCount} pages · no questions marked yet` : 'No questions marked yet'
  const mcq = questions.filter(isMultipleChoice).length
  const written = questions.length - mcq
  const marks = questions.reduce((sum, q) => sum + (q.marks ?? 0), 0)
  if (mcq > 0) return `${mcq} MCQ · ${written} Section B`
  return `${questions.length} question${questions.length === 1 ? '' : 's'}${marks ? ` · ${marks} mark${marks === 1 ? '' : 's'}` : ''}`
}

/** "2024 VCAA Exam · Section B · 4 marks · page 27" */
export function questionSubtitle(paper: Paper | undefined, question: Question): string {
  return [
    paper?.title,
    question.section ? `Section ${question.section}` : null,
    question.marks !== null ? `${question.marks} ${question.marks === 1 ? 'mark' : 'marks'}` : null,
    question.regions[0] ? `page ${question.regions[0].page}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Short reference used in lists: "2024 B3", "2023nht B4", "2019 Q7". */
export function questionRef(paper: Paper | undefined, question: Question): string {
  const year = paper ? `${paper.year ?? ''}${paper.sitting === 'nht' ? 'nht' : ''}` : ''
  const exam = paper?.exam ? ` E${paper.exam}` : ''
  const q = question.section
    ? `${question.section}${question.number ?? ''}`
    : `Q${question.number ?? ''}`
  return `${year}${exam} ${q}`.trim()
}

/**
 * Makes paper rows for exam files in the library that do not have one yet, pairing each with its
 * report. Matches files to the subject by the subject they were imported under or by file name.
 */
export async function syncPapers(
  subject: Subject,
  sources: Source[],
  papers: Paper[],
): Promise<number> {
  const key = subjectKeyFor(subject.name)
  const known = new Set(
    papers.flatMap((p) => [p.paperSourceId, p.reportSourceId, p.solutionsSourceId]),
  )
  const files = sources
    .filter((s) => s.mime === 'application/pdf')
    .map((s) => ({ id: s.id, name: s.fileName ?? s.title, subjectId: s.subjectId }))
  let made = 0
  for (const pair of pairPapers(files)) {
    const mine = pair.paper.subjectId
      ? pair.paper.subjectId === subject.id
      : key !== null && pair.subjectKey === key
    if (!mine || known.has(pair.paper.id)) continue
    await db.create('papers', {
      subjectId: subject.id,
      title: pair.title,
      grp: pair.group,
      year: pair.year,
      sitting: pair.sitting,
      exam: pair.exam,
      paperSourceId: pair.paper.id,
      reportSourceId: pair.report?.id ?? null,
      solutionsSourceId: pair.solutions?.id ?? null,
      minutes: key === 'methods' || key === 'specialist' ? (pair.exam === '1' ? 60 : 120) : 150,
      readingMinutes: 15,
    })
    made++
  }
  return made
}

/** Best attempt score on a paper's questions as "31/40", from the latest attempt of each. */
export function paperScore(
  questions: Question[],
  attempts: Attempt[],
): { score: number; max: number; at: number } | null {
  const ids = new Set(questions.map((q) => q.id))
  const latest = new Map<string, Attempt>()
  for (const a of attempts) {
    if (!ids.has(a.questionId) || a.score === null) continue
    const prev = latest.get(a.questionId)
    if (!prev || prev.createdAt < a.createdAt) latest.set(a.questionId, a)
  }
  if (latest.size === 0) return null
  let score = 0
  let max = 0
  let at = 0
  for (const a of latest.values()) {
    score += a.score ?? 0
    max += a.max ?? 0
    at = Math.max(at, a.createdAt)
  }
  return { score, max, at }
}

const STOP = new Set(
  'the a an of to and in is it for on with that this be by as at from or are was what how which'.split(
    ' ',
  ),
)
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
}

/** How well a half-remembered query matches a question, 0 to 100. */
export function matchScore(queryTokens: string[], text: string): number {
  if (queryTokens.length === 0) return 0
  const have = new Set(tokens(text))
  let hit = 0
  for (const t of queryTokens) {
    if (have.has(t)) hit += 1
    else if ([...have].some((h) => h.startsWith(t.slice(0, 5)) && t.length >= 5)) hit += 0.6
  }
  return Math.round((hit / queryTokens.length) * 100)
}

/** Questions that share ideas and command terms with this one, best first. */
export function similarQuestions(question: Question, all: Question[], limit = 8) {
  const mine = new Set(tokens(question.stemMd))
  const terms = new Set(termsOf(question))
  return all
    .filter((q) => q.id !== question.id && q.subjectId === question.subjectId)
    .map((q) => {
      const theirs = new Set(tokens(q.stemMd))
      const shared = [...mine].filter((t) => theirs.has(t))
      const sharedTerms = termsOf(q).filter((t) => terms.has(t))
      const topicHits = q.topicIds.filter((t) => question.topicIds.includes(t)).length
      const score =
        shared.length / Math.max(4, Math.sqrt(mine.size * theirs.size)) +
        sharedTerms.length * 0.15 +
        topicHits * 0.4
      return { question: q, score, shared: shared.slice(0, 4), sharedTerms }
    })
    .filter((x) => x.score > 0.18)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Everything the AI should know about a question, as plain text. */
export function questionContext(
  question: Question,
  paper: Paper | undefined,
  answers: { kind: string; contentMd: string }[],
  given?: string,
): string {
  const lines = [
    `${paper?.title ?? 'Past paper'}, ${questionTitleText(question)}${question.marks !== null ? ` (${question.marks} marks)` : ''}`,
    '',
    'Question:',
    question.stemMd,
  ]
  if (question.mc.answer) {
    lines.push('', `Correct option: ${question.mc.answer}`)
    if (question.mc.pct)
      lines.push(
        `Students choosing each option: ${Object.entries(question.mc.pct)
          .map(([k, v]) => `${k} ${v}%`)
          .join(', ')}`,
      )
    if (question.mc.comment) lines.push(`Examiner comment: ${question.mc.comment}`)
  }
  for (const part of question.parts)
    if (part.text) lines.push('', `Marking notes, part ${part.part}:`, part.text)
  for (const a of answers)
    lines.push(
      '',
      a.kind === 'examiner_report' ? 'Examiner comments:' : 'Marking notes / solution:',
      a.contentMd,
    )
  if (question.reportMistakes.length)
    lines.push(
      '',
      'Common mistakes (examiner report):',
      ...question.reportMistakes.map((m) => `- ${m}`),
    )
  if (given) lines.push('', "Student's answer:", given)
  return lines.join('\n')
}

function questionTitleText(q: Pick<Question, 'section' | 'number' | 'label'>): string {
  if (q.label) return q.label
  return `Question ${q.section ? `${q.section}` : ''}${q.number ?? ''}`
}

export interface CheckResult {
  ok: boolean
  text: string
}

/**
 * The no-AI "Instant check": command term, points against marks, restating the question,
 * vague wording, and using the data given.
 */
export function instantCheck(question: Question, answer: string, terms: string[]): CheckResult[] {
  const out: CheckResult[] = []
  const text = answer.trim()
  if (!text) return [{ ok: false, text: 'Write an answer first.' }]
  const marks = question.marks ?? 1
  const points = text.split(/(?<=[.!?])\s+|\n+|;\s*/).filter((s) => s.trim().length > 8).length
  out.push(
    points >= marks
      ? {
          ok: true,
          text: `${points} distinct points for ${marks} ${marks === 1 ? 'mark' : 'marks'}.`,
        }
      : {
          ok: false,
          text: `${points} distinct ${points === 1 ? 'point' : 'points'} for ${marks} marks. Aim for one clear point per mark.`,
        },
  )
  const term = terms[0]
  if (term === 'explain' || term === 'justify')
    out.push(
      /because|therefore|so that|which means|as a result|due to|leads to|causes/i.test(text)
        ? { ok: true, text: `“${term}”: you give a reason or cause.` }
        : {
            ok: false,
            text: `“${term}” wants a reason or cause. Link with “because”, “so”, “which leads to”.`,
          },
    )
  else if (term === 'compare' || term === 'contrast')
    out.push(
      /whereas|while|both|however|unlike|similarly|in contrast/i.test(text)
        ? { ok: true, text: `“${term}”: you refer to both sides.` }
        : {
            ok: false,
            text: `“${term}” needs both things side by side: use “whereas”, “both”, “unlike”.`,
          },
    )
  else if (term === 'evaluate' || term === 'discuss')
    out.push(
      /strength|weakness|advantage|disadvantage|however|on the other hand|limitation/i.test(text)
        ? { ok: true, text: `“${term}”: you weigh more than one side.` }
        : { ok: false, text: `“${term}” needs a judgement with points for and against.` },
    )
  else if (term) out.push({ ok: true, text: `Command term: “${term}”.` })

  const stem = new Set(tokens(question.stemMd))
  const mine = tokens(text)
  const overlap = mine.filter((t) => stem.has(t)).length / Math.max(1, mine.length)
  if (mine.length < 25 && overlap > 0.6)
    out.push({
      ok: false,
      text: 'Much of this restates the question. Add what the question does not already say.',
    })

  const vague = text.match(/\b(stuff|things?|affects?|changes?|good|bad|a lot|basically)\b/gi)
  if (vague && vague.length)
    out.push({
      ok: false,
      text: `Vague wording: “${[...new Set(vague.map((v) => v.toLowerCase()))].join('”, “')}”. Say exactly how, which way and by how much.`,
    })

  const stemHasData =
    /\d/.test(question.stemMd) &&
    /(table|graph|data|figure|shown|%|mol|g\b|kJ|\$)/i.test(question.stemMd)
  if (stemHasData && !/\d/.test(text))
    out.push({
      ok: false,
      text: 'The question gives data. Quote figures from it to support your answer.',
    })
  if (
    terms.includes('calculate') &&
    /\d/.test(text) &&
    !/[a-zA-Z%$]\s*$|\b(mol|g|kg|L|mL|kJ|J|m|s|%|M)\b/.test(text)
  )
    out.push({
      ok: false,
      text: 'Check your final answer has units and sensible significant figures.',
    })
  return out
}

/** Marking points to tick, from the stored solution: one per line, bullet or sentence. */
export function markingPoints(
  question: Question,
  answers: { kind: string; contentMd: string }[],
): string[] {
  const source = [
    ...question.parts.map((p) => p.text ?? ''),
    ...answers
      .filter((a) => a.kind === 'official_solution' || a.kind === 'sample')
      .map((a) => a.contentMd),
  ].join('\n')
  const items = source
    .split(/\n+|(?<=[.;])\s+(?=[A-Z])/)
    .map((s) => s.replace(/^\s*([-*•]|\d+[.)]|[a-z][.)])\s*/, '').trim())
    .filter((s) => s.length > 6)
  return items.slice(0, 12)
}

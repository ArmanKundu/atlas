import type { Answer, Attempt, MISTAKE_TYPES, Question } from '@shared/models'
import { db, useLive } from '@/lib/api'

export const MISTAKE_LABELS: Record<(typeof MISTAKE_TYPES)[number], string> = {
  concept: 'Did not understand the idea',
  careless: 'Careless slip',
  command_term: 'Missed what the question asked',
  working: 'Working or method',
  knowledge_gap: 'Did not know the content',
  time: 'Ran out of time',
}

export type QuestionStatus = 'new' | 'right' | 'partial' | 'wrong'

/** Where a question stands, from its most recent attempt. */
export function statusOf(attempts: Attempt[]): QuestionStatus {
  const last = [...attempts].sort((a, b) => b.createdAt - a.createdAt)[0]
  if (!last || last.score === null) return 'new'
  const max = last.max ?? 0
  if (max > 0 && last.score >= max) return 'right'
  if (last.score <= 0) return 'wrong'
  return 'partial'
}

export const STATUS_LABEL: Record<QuestionStatus, string> = {
  new: 'Not tried',
  right: 'Full marks',
  partial: 'Part marks',
  wrong: 'No marks',
}

export const STATUS_TONE = {
  new: 'neutral',
  right: 'success',
  partial: 'warn',
  wrong: 'danger',
} as const

/** "Question 3a" or the label, for headings. */
export function questionTitle(question: Pick<Question, 'number' | 'label'>): string {
  if (question.label) return question.label
  return question.number ? `Question ${question.number}` : 'Question'
}

/** A question with its saved answers and attempts, kept fresh. */
export function useQuestionDetail(id: string | null) {
  return useLive(
    ['questions', 'answers', 'attempts'],
    async () => {
      if (!id) return null
      const [question, answers, attempts] = await Promise.all([
        db.get('questions', id),
        db.list('answers', { where: { questionId: id }, orderBy: 'createdAt' }),
        db.list('attempts', { where: { questionId: id } }),
      ])
      return question
        ? { question, answers: answers as Answer[], attempts: attempts as Attempt[] }
        : null
    },
    [id],
  )
}

/** Saves (or clears) the one answer of a kind on a question. */
export async function saveAnswer(
  questionId: string,
  kind: Answer['kind'],
  existing: Answer | undefined,
  content: string,
): Promise<void> {
  const text = content.trim()
  if (existing && !text) await db.remove('answers', existing.id)
  else if (existing) {
    if (existing.contentMd !== text) await db.update('answers', existing.id, { contentMd: text })
  } else if (text) await db.create('answers', { questionId, kind, contentMd: text })
}

import { ChevronLeft, ChevronRight, Pencil } from 'lucide-react'
import type { Attempt, Paper, Question, Topic } from '@shared/models'
import { Tooltip } from '@/design/Tooltip'
import { cn } from '@/lib/cn'
import { DIFFICULTY_CLASS, difficultyOf, termsOf } from './data'
import { COMMAND_TERMS } from './terms'

const QTYPE_LABEL: Record<string, string> = {
  mcq: 'Multiple choice',
  short: 'Short answer',
  extended: 'Extended response',
  data: 'Data analysis',
  calc: 'Calculation',
  essay: 'Essay',
  analysis: 'Analysis',
  proof: 'Proof',
}

/** Breadcrumb, title and the chips row, shared by Overview, Practice and More. */
export function InspectorHeader({
  paper,
  question,
  topics,
  attempts,
  onPrev,
  onNext,
  onEdit,
}: {
  paper: Paper
  question: Question
  topics: Topic[]
  attempts: Attempt[]
  onPrev?: () => void
  onNext?: () => void
  onEdit: () => void
}) {
  const terms = termsOf(question)
  const difficulty = difficultyOf(question)
  const topicNames = question.topicIds
    .map((id) => topics.find((t) => t.id === id)?.title)
    .filter((t): t is string => Boolean(t))
  const last = [...attempts].sort((a, b) => b.createdAt - a.createdAt)[0]
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-2xs text-blue">
          {paper.title}
          {question.section ? ` · Section ${question.section}` : ''}
        </p>
        <div className="flex shrink-0 items-center">
          <Tooltip label="Edit question">
            <button
              type="button"
              aria-label="Edit question"
              onClick={onEdit}
              className="flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
            >
              <Pencil className="size-3.5" aria-hidden />
            </button>
          </Tooltip>
          <button
            type="button"
            aria-label="Previous question"
            disabled={!onPrev}
            onClick={onPrev}
            className="flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-hover disabled:opacity-30"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next question"
            disabled={!onNext}
            onClick={onNext}
            className="flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-hover disabled:opacity-30"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <h2 className="mt-0.5 text-[1.375rem] leading-7 font-semibold tracking-[-0.02em] text-ink">
        {question.label ?? `Question ${question.number ?? ''}`}
        <span className="text-[0.9375rem] font-normal tracking-normal text-ink-3">
          {question.marks !== null
            ? ` · ${question.marks} ${question.marks === 1 ? 'mark' : 'marks'}`
            : ''}
          {question.regions[0] ? ` · page ${question.regions[0].page}` : ''}
        </span>
      </h2>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {topicNames.map((t) => (
          <span key={t} className="rounded-md bg-blue px-2 py-0.5 text-2xs font-medium text-white">
            {t}
          </span>
        ))}
        {terms.map((t) => (
          <Tooltip key={t} label={COMMAND_TERMS[t] ?? t}>
            <span className="rounded-md px-2 py-0.5 text-2xs font-medium text-ink-2 ring-1 ring-line-strong ring-inset">
              {t}
            </span>
          </Tooltip>
        ))}
        {question.qtype ? (
          <span className="rounded-md bg-active px-2 py-0.5 text-2xs font-medium text-ink-2">
            {QTYPE_LABEL[question.qtype] ?? question.qtype}
          </span>
        ) : null}
        {difficulty ? (
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-2xs font-medium',
              DIFFICULTY_CLASS[difficulty],
            )}
          >
            {difficulty}
          </span>
        ) : null}
      </div>
      {last ? (
        <p className="mt-2 text-2xs text-ink-3">
          Your last try: {last.score ?? 'not marked'}
          {last.score !== null ? `/${last.max ?? '–'}` : ''} on{' '}
          {new Date(last.createdAt).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
          })}
        </p>
      ) : null}
    </div>
  )
}

export const QTYPES = QTYPE_LABEL

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Badge } from '@/design/Form'
import { Button, IconButton } from '@/design/Button'
import { Segmented } from '@/design/Segmented'
import { Skeleton } from '@/design/States'
import { questionTitle, STATUS_LABEL, STATUS_TONE, statusOf, useQuestionDetail } from './data'
import { QuestionDetails } from './QuestionDetails'
import { QuestionPractice } from './QuestionPractice'

type Tab = 'practice' | 'details' | 'history'

/**
 * The right-hand panel for one question: practise it with the solution hidden, edit its details,
 * or look back at earlier attempts.
 */
export function QuestionInspector({
  questionId,
  initialTab = 'practice',
  onClose,
  onAddBox,
  onNext,
}: {
  questionId: string
  initialTab?: Tab
  onClose?: () => void
  /** Draw another box for this question, for one that runs over a page break. */
  onAddBox?: () => void
  onNext?: () => void
}) {
  const detail = useQuestionDetail(questionId)
  const [tab, setTab] = useState<Tab>(initialTab)
  const data = detail.data

  if (!data) {
    return detail.loading ? (
      <div className="p-4">
        <Skeleton className="h-40" />
      </div>
    ) : (
      <p className="p-4 text-ink-3">This question has been removed.</p>
    )
  }
  const { question, answers, attempts } = data
  const status = statusOf(attempts)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{questionTitle(question)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {question.marks !== null ? (
              <Badge>
                {question.marks} {question.marks === 1 ? 'mark' : 'marks'}
              </Badge>
            ) : null}
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
            {question.regions.length > 1 ? <Badge>{question.regions.length} boxes</Badge> : null}
          </div>
        </div>
        {onClose ? (
          <IconButton label="Close question" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </IconButton>
        ) : null}
      </div>
      <div className="px-4 pt-3">
        <Segmented
          label="Question view"
          value={tab}
          onChange={setTab}
          className="w-full [&>*]:flex-1"
          options={[
            { value: 'practice', label: 'Practice' },
            { value: 'details', label: 'Details' },
            { value: 'history', label: `History${attempts.length ? ` (${attempts.length})` : ''}` },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === 'practice' ? (
          <QuestionPractice question={question} answers={answers} onNext={onNext} />
        ) : null}
        {tab === 'details' ? (
          <>
            <QuestionDetails
              key={question.id + question.updatedAt}
              question={question}
              answers={answers}
              onDeleted={onClose}
            />
            {onAddBox ? (
              <Button
                variant="secondary"
                className="mt-4 w-full"
                icon={<Plus className="size-4" />}
                onClick={onAddBox}
              >
                Add another box (question continues)
              </Button>
            ) : null}
          </>
        ) : null}
        {tab === 'history' ? (
          attempts.length ? (
            <ol className="flex flex-col gap-2">
              {attempts.map((attempt) => (
                <li key={attempt.id} className="rounded-lg p-3 ring-1 ring-line ring-inset">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink tabular-nums">
                      {attempt.score ?? '–'} / {attempt.max ?? '–'}
                    </span>
                    <span className="text-2xs text-ink-3">
                      {new Date(attempt.createdAt).toLocaleString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                      {attempt.seconds ? ` · ${Math.round(attempt.seconds / 60)} min` : ''}
                    </span>
                  </div>
                  {attempt.givenAnswerMd ? (
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-ink-2">
                      {attempt.givenAnswerMd}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-ink-3">No attempts yet. Try it under Practice.</p>
          )
        ) : null}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Check, Eye, RotateCcw } from 'lucide-react'
import { MISTAKE_TYPES, type Answer, type Question } from '@shared/models'
import { Button } from '@/design/Button'
import { Field, Select, Textarea } from '@/design/Form'
import { Markdown } from '@/design/Markdown'
import { Segmented } from '@/design/Segmented'
import { useToast } from '@/design/Toast'
import { db, changed } from '@/lib/api'
import { cn } from '@/lib/cn'
import { MISTAKE_LABELS } from './data'

type Stage = 'answering' | 'marking' | 'mistake' | 'done'

const ANSWER_LABEL: Record<Answer['kind'], string> = {
  official_solution: 'Solution',
  examiner_report: 'Examiner report',
  sample: 'Sample answer',
  ai: 'AI answer',
}

/**
 * Practise one question: write an answer (or work on paper), then reveal the solution, give
 * yourself a mark, and log what went wrong if it was not full marks.
 */
export function QuestionPractice(props: {
  question: Question
  answers: Answer[]
  onNext?: () => void
}) {
  // Each try is a fresh round, so "Try again" and a new question both start clean.
  const [round, setRound] = useState(0)
  return (
    <PracticeRound
      key={`${props.question.id}:${round}`}
      {...props}
      onRetry={() => setRound((n) => n + 1)}
    />
  )
}

function PracticeRound({
  question,
  answers,
  onNext,
  onRetry,
}: {
  question: Question
  answers: Answer[]
  onNext?: () => void
  onRetry: () => void
}) {
  const toast = useToast()
  const [stage, setStage] = useState<Stage>('answering')
  const [given, setGiven] = useState('')
  const [startedAt] = useState(() => Date.now())
  const [seconds, setSeconds] = useState(0)
  const [score, setScore] = useState<number | null>(null)
  const [confidence, setConfidence] = useState<'1' | '2' | '3'>('2')
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [mistakeType, setMistakeType] = useState<(typeof MISTAKE_TYPES)[number]>('concept')
  const [mistakeNote, setMistakeNote] = useState('')
  const max = question.marks ?? 1

  useEffect(() => {
    if (stage !== 'answering') return
    const tick = (): void => setSeconds(Math.round((Date.now() - startedAt) / 1000))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [stage, startedAt])

  const saveMark = async (): Promise<void> => {
    if (score === null) return
    const attempt = await db.create('attempts', {
      questionId: question.id,
      givenAnswerMd: given.trim() || null,
      score,
      max,
      selfMarked: true,
      confidence: Number(confidence),
      seconds,
    })
    changed('stats')
    setAttemptId(attempt.id)
    if (score < max) setStage('mistake')
    else {
      setStage('done')
      toast({ title: 'Full marks saved' })
    }
  }

  const logMistake = async (): Promise<void> => {
    await db.create('mistakes', {
      attemptId,
      questionId: question.id,
      subjectId: question.subjectId,
      type: mistakeType,
      note: mistakeNote.trim() || null,
      status: 'open',
      reviewDue: Date.now() + 3 * 86_400_000,
    })
    changed('stats')
    toast({ title: 'Added to your mistakes', description: 'It comes back for review in 3 days.' })
    setStage('done')
  }

  const minutes = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  return (
    <div className="flex flex-col gap-4">
      {stage === 'answering' ? (
        <>
          <Field label="Your answer" hint="Optional. You can also work on paper, then check.">
            <Textarea
              value={given}
              onChange={(e) => setGiven(e.target.value)}
              placeholder="Write your answer"
              className="min-h-32"
            />
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-2xs text-ink-3 tabular-nums" aria-label={`Time ${minutes}`}>
              {minutes}
            </span>
            <Button
              variant="primary"
              icon={<Eye className="size-4" />}
              onClick={() => setStage('marking')}
            >
              Check answer
            </Button>
          </div>
        </>
      ) : null}

      {stage !== 'answering' ? (
        <div className="flex flex-col gap-3">
          {given.trim() ? (
            <div className="rounded-lg bg-sunken p-3">
              <p className="mb-1 text-2xs font-medium text-ink-3">Your answer</p>
              <p className="whitespace-pre-wrap text-ink">{given}</p>
            </div>
          ) : null}
          {answers.length ? (
            answers.map((answer) => (
              <div key={answer.id} className="rounded-lg p-3 ring-1 ring-line ring-inset">
                <p className="mb-1 text-2xs font-medium text-ink-3">{ANSWER_LABEL[answer.kind]}</p>
                <Markdown>{answer.contentMd}</Markdown>
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-sunken p-3 text-ink-2">
              No solution saved for this question yet. Add one under Details, then mark yourself
              against it.
            </p>
          )}
        </div>
      ) : null}

      {stage === 'marking' ? (
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1.5 font-medium text-ink">Your mark</p>
            <div role="radiogroup" aria-label="Your mark" className="flex flex-wrap gap-1.5">
              {Array.from({ length: Math.min(max, 20) + 1 }, (_, n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={score === n}
                  onClick={() => setScore(n)}
                  className={cn(
                    'h-8 min-w-8 rounded-md px-2 font-medium tabular-nums ring-1 ring-line-strong ring-inset',
                    score === n ? 'bg-blue text-white ring-blue' : 'text-ink hover:bg-hover',
                  )}
                >
                  {n}
                </button>
              ))}
              <span className="self-center pl-1 text-ink-3">out of {max}</span>
            </div>
          </div>
          <div>
            <p className="mb-1.5 font-medium text-ink">How sure were you?</p>
            <Segmented
              label="How sure were you"
              value={confidence}
              onChange={setConfidence}
              options={[
                { value: '1', label: 'Guessed' },
                { value: '2', label: 'Unsure' },
                { value: '3', label: 'Sure' },
              ]}
            />
          </div>
          <div className="flex justify-end">
            <Button
              variant="primary"
              icon={<Check className="size-4" />}
              disabled={score === null}
              onClick={() => void saveMark()}
            >
              Save mark
            </Button>
          </div>
        </div>
      ) : null}

      {stage === 'mistake' ? (
        <div className="flex flex-col gap-3 rounded-lg bg-sunken p-3">
          <p className="font-medium text-ink">
            {score} out of {max}. What went wrong?
          </p>
          <Field label="Kind of mistake">
            <Select
              value={mistakeType}
              onChange={(e) => setMistakeType(e.target.value as typeof mistakeType)}
            >
              {MISTAKE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MISTAKE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note to yourself" hint="What to remember next time.">
            <Textarea
              value={mistakeNote}
              onChange={(e) => setMistakeNote(e.target.value)}
              className="min-h-16"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStage('done')}>
              Skip
            </Button>
            <Button variant="primary" onClick={() => void logMistake()}>
              Log mistake
            </Button>
          </div>
        </div>
      ) : null}

      {stage === 'done' ? (
        <div className="flex items-center justify-between rounded-lg bg-sunken p-3">
          <p className="text-ink">
            Saved: {score} out of {max} in {minutes}.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={onRetry}>
              Try again
            </Button>
            {onNext ? (
              <Button variant="primary" onClick={onNext}>
                Next question
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

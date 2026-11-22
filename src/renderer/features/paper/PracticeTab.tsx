import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, CircleCheck, CircleX, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react'
import {
  MISTAKE_TYPES,
  type Answer,
  type Attempt,
  type Paper,
  type Question,
  type SubjectKind,
} from '@shared/models'
import { Button } from '@/design/Button'
import { Field, Select, Textarea } from '@/design/Form'
import { Markdown } from '@/design/Markdown'
import { Segmented } from '@/design/Segmented'
import { useToast } from '@/design/Toast'
import { MISTAKE_LABELS } from '@/features/questions/data'
import { changed, db } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { useSetting } from '@/lib/settings'
import {
  instantCheck,
  isMultipleChoice,
  markingPoints,
  questionContext,
  termsOf,
  type CheckResult,
} from './data'

/** Whole seconds since a moment; used when an attempt is saved. */
function secondsSince(from: number): number {
  return Math.round((Date.now() - from) / 1000)
}

type Row = { date: string; item: string; dr: string; cr: string }
const num = (v: string): number => Number(v.replace(/[$,\s]/g, '')) || 0

/** Accounting answers: a ledger or statement grid with running totals. */
function LedgerGrid({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const rows: Row[] = useMemo(() => {
    try {
      const parsed = JSON.parse(value) as Row[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [value])
  const list = rows.length ? rows : [{ date: '', item: '', dr: '', cr: '' }]
  const set = (next: Row[]): void => onChange(JSON.stringify(next))
  const totalDr = list.reduce((s, r) => s + num(r.dr), 0)
  const totalCr = list.reduce((s, r) => s + num(r.cr), 0)
  const cell = 'h-8 w-full bg-transparent px-1.5 outline-none focus:bg-blue-soft'
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-line-strong">
      <table className="w-full text-2xs">
        <thead className="bg-sunken text-ink-2">
          <tr>
            <th className="w-16 px-1.5 py-1 text-left font-medium">Date</th>
            <th className="px-1.5 py-1 text-left font-medium">Particulars</th>
            <th className="w-20 px-1.5 py-1 text-right font-medium">Dr $</th>
            <th className="w-20 px-1.5 py-1 text-right font-medium">Cr $</th>
            <th className="w-7" />
          </tr>
        </thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={i} className="border-t border-line">
              {(['date', 'item', 'dr', 'cr'] as const).map((k) => (
                <td key={k}>
                  <input
                    aria-label={`${k} row ${i + 1}`}
                    value={r[k]}
                    onChange={(e) =>
                      set(list.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))
                    }
                    className={cn(cell, (k === 'dr' || k === 'cr') && 'text-right tabular-nums')}
                  />
                </td>
              ))}
              <td>
                <button
                  type="button"
                  aria-label="Remove row"
                  onClick={() => set(list.filter((_, j) => j !== i))}
                  className="flex size-7 items-center justify-center text-ink-3 hover:text-danger"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </td>
            </tr>
          ))}
          <tr className="border-t border-line-strong bg-sunken font-semibold tabular-nums">
            <td />
            <td className="px-1.5 py-1.5">
              <button
                type="button"
                onClick={() => set([...list, { date: '', item: '', dr: '', cr: '' }])}
                className="flex items-center gap-1 font-medium text-blue"
              >
                <Plus className="size-3.5" aria-hidden /> Add row
              </button>
            </td>
            <td className="px-1.5 text-right">{totalDr.toLocaleString()}</td>
            <td
              className={cn(
                'px-1.5 text-right',
                totalDr !== totalCr && totalCr > 0 && 'text-danger',
              )}
            >
              {totalCr.toLocaleString()}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** One answer box, shaped by the subject: maths preview, ledger grid, or essay with a word count. */
function AnswerBox({
  kind,
  label,
  value,
  onChange,
  startedAt,
}: {
  kind: SubjectKind
  label: string
  value: string
  onChange: (v: string) => void
  startedAt: number
}) {
  const box = useRef<HTMLTextAreaElement>(null)
  const [now, setNow] = useState(startedAt)
  useEffect(() => {
    if (kind !== 'essay') return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [kind])
  // Grow with the text.
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(96, el.scrollHeight)}px`
  }, [value])

  if (kind === 'accounting' && (value === '' || value.startsWith('[')))
    return (
      <div>
        <p className="mb-1 text-2xs font-medium text-ink-2">{label}</p>
        <LedgerGrid value={value} onChange={onChange} />
        <button
          type="button"
          className="mt-1 text-2xs text-ink-3 hover:text-ink"
          onClick={() => onChange(' ')}
        >
          Write in words instead
        </button>
      </div>
    )
  const words = value.trim() ? value.trim().split(/\s+/).length : 0
  const mins = Math.floor((now - startedAt) / 60_000)
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-2xs">
        <span className="font-medium text-ink-2">{label}</span>
        {kind === 'essay' ? (
          <span className="text-ink-3 tabular-nums">
            {words} words · {mins} min
          </span>
        ) : null}
        {kind === 'maths' ? <span className="text-ink-3">LaTeX works: $x^2$</span> : null}
      </div>
      <textarea
        ref={box}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          kind === 'maths' ? 'Working and answer. Use $…$ for maths.' : 'Write your answer'
        }
        className={cn(
          'w-full resize-none rounded-lg bg-surface px-3 py-2 leading-5 text-ink ring-1 ring-line-strong ring-inset outline-none focus:ring-2 focus:ring-focus',
          kind === 'essay' && 'font-serif text-[0.9375rem] leading-6',
        )}
      />
      {kind === 'maths' && /[$\\]/.test(value) ? (
        <div className="mt-1.5 rounded-md bg-sunken px-3 py-2">
          <Markdown>{value}</Markdown>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Practice: answer boxes per part (or A–D for multiple choice), then check it three ways:
 * an instant check with no AI, ticking the marking points yourself, or marking by the AI.
 */
export function PracticeTab({
  paper,
  question,
  answers,
  attempts,
  kind,
}: {
  paper: Paper
  question: Question
  answers: Answer[]
  attempts: Attempt[]
  kind: SubjectKind
}) {
  const toast = useToast()
  const [saved, setSaved] = useSetting<Record<string, string>>(`answer.${question.id}`, {})
  const [startedAt] = useState(() => Date.now())
  const [checks, setChecks] = useState<CheckResult[] | null>(null)
  const [selfMark, setSelfMark] = useState<boolean[] | null>(null)
  const [coach, setCoach] = useState<{ busy: boolean; text: string | null; error: string | null }>({
    busy: false,
    text: null,
    error: null,
  })
  const [confidence, setConfidence] = useState<'1' | '2' | '3' | '4'>('2')
  const [lost, setLost] = useState<{ attemptId: string; score: number; max: number } | null>(null)
  const [mistakeType, setMistakeType] = useState<(typeof MISTAKE_TYPES)[number]>('concept')
  const [note, setNote] = useState('')
  const marks = question.marks ?? 1
  const parts = question.parts.length > 1 ? question.parts.map((p) => p.part) : ['']
  const given = parts
    .map((p) => (parts.length > 1 ? `(${p}) ` : '') + (saved[p] ?? ''))
    .join('\n\n')
    .trim()
  const last = [...attempts].sort((a, b) => b.createdAt - a.createdAt)[0]
  const mc = isMultipleChoice(question)
  const points = markingPoints(question, answers)

  const record = async (score: number, how: 'self' | 'ai' | 'auto'): Promise<void> => {
    const attempt = await db.create('attempts', {
      questionId: question.id,
      givenAnswerMd: given || null,
      score,
      max: marks,
      selfMarked: how === 'self',
      aiMarked: how === 'ai',
      confidence: Number(confidence),
      seconds: secondsSince(startedAt),
    })
    changed('stats')
    if (score < marks) setLost({ attemptId: attempt.id, score, max: marks })
    else toast({ title: 'Full marks saved' })
  }

  const markWithCoach = async (): Promise<void> => {
    setCoach({ busy: true, text: null, error: null })
    try {
      const res = await call('ai:complete', {
        task: 'mark',
        prompt: questionContext(question, paper, answers, given),
        subjectId: question.subjectId,
      })
      setCoach({ busy: false, text: res.text, error: null })
      const m = /Score:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)/i.exec(res.text)
      if (m) await record(Math.min(marks, Number(m[1])), 'ai')
    } catch (e) {
      setCoach({
        busy: false,
        text: null,
        error: e instanceof Error ? e.message : 'Marking failed.',
      })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <p className="flex items-center gap-1.5 font-semibold text-ink">
          <span className="size-2 rounded-full bg-blue" aria-hidden /> Your answer
        </p>
        <span className="text-2xs text-ink-3">
          {last ? `last: ${last.score ?? '–'}/${last.max ?? marks}` : 'not attempted yet'}
        </span>
      </div>

      {mc ? (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Your answer">
          {(question.mc.options ?? ['A', 'B', 'C', 'D']).map((o) => {
            const picked = saved[''] === o
            const right = o === question.mc.answer
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={picked}
                onClick={() => {
                  if (saved['']) return
                  setSaved({ '': o })
                  if (question.mc.answer) void record(right ? marks : 0, 'auto')
                }}
                className={cn(
                  'flex h-12 items-center gap-3 rounded-lg px-4 text-left text-[0.9375rem] font-semibold ring-1 ring-line-strong ring-inset',
                  !saved[''] && 'hover:bg-hover',
                  saved[''] && right && 'bg-success-soft text-success ring-success',
                  picked && !right && 'bg-danger-soft text-danger ring-danger',
                )}
              >
                {o}
                {saved[''] && right ? (
                  <CircleCheck className="ml-auto size-5" aria-label="Correct answer" />
                ) : null}
                {picked && !right ? (
                  <CircleX className="ml-auto size-5" aria-label="Your choice, wrong" />
                ) : null}
              </button>
            )
          })}
          {saved[''] ? (
            <div className="rounded-lg bg-sunken p-3">
              <p className="font-semibold text-ink">
                {saved[''] === question.mc.answer
                  ? 'Correct.'
                  : question.mc.answer
                    ? `Not quite: the answer is ${question.mc.answer}.`
                    : 'Answer saved.'}
              </p>
              {question.mc.comment ? (
                <p className="mt-1 text-ink-2">{question.mc.comment}</p>
              ) : null}
              <button
                type="button"
                className="mt-2 text-2xs text-blue hover:underline"
                onClick={() => setSaved({})}
              >
                Try again
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          {parts.map((p) => (
            <AnswerBox
              key={p}
              kind={kind}
              label={p ? `Part ${p}` : 'Answer'}
              value={saved[p] ?? ''}
              onChange={(v) => setSaved({ ...saved, [p]: v })}
              startedAt={startedAt}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Wand2 className="size-4" />}
              onClick={() => setChecks(instantCheck(question, given, termsOf(question)))}
            >
              Instant check
            </Button>
            <Button
              variant="secondary"
              icon={<Check className="size-4" />}
              disabled={!given}
              onClick={() => setSelfMark(points.map(() => false))}
            >
              Self-mark against the report
            </Button>
            <Button
              variant="primary"
              icon={<Sparkles className="size-4" />}
              disabled={!given || coach.busy}
              onClick={() => void markWithCoach()}
            >
              {coach.busy ? 'Marking…' : 'Mark with Coach'}
            </Button>
          </div>
          <div>
            <p className="mb-1.5 text-2xs font-medium text-ink-2">How sure are you?</p>
            <Segmented
              label="How sure are you"
              value={confidence}
              onChange={setConfidence}
              options={[
                { value: '1', label: 'Guess' },
                { value: '2', label: 'Unsure' },
                { value: '3', label: 'Fairly' },
                { value: '4', label: 'Sure' },
              ]}
            />
          </div>
        </>
      )}

      {checks ? (
        <ul className="flex flex-col gap-1.5 rounded-lg bg-sunken p-3" aria-label="Instant check">
          {checks.map((c, i) => (
            <li key={i} className="flex gap-2">
              {c.ok ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-label="Fine" />
              ) : (
                <CircleX className="mt-0.5 size-4 shrink-0 text-warn" aria-label="Check" />
              )}
              <span className="text-ink">{c.text}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {selfMark ? (
        <div className="rounded-lg p-3 ring-1 ring-line ring-inset">
          <p className="mb-2 font-semibold text-ink">Tick each marking point you hit</p>
          {points.length ? (
            <ul className="flex flex-col gap-1.5">
              {points.map((pt, i) => (
                <li key={i}>
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={selfMark[i] ?? false}
                      onChange={(e) =>
                        setSelfMark(selfMark.map((v, j) => (j === i ? e.target.checked : v)))
                      }
                      className="mt-0.5 size-4 shrink-0 accent-[var(--atlas-blue)]"
                    />
                    <span className="text-ink">{pt}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3">
              No marking points are stored for this question. Give yourself a mark out of {marks}:
            </p>
          )}
          <div className="mt-3 flex items-center justify-between">
            {points.length ? (
              <span className="text-ink-2 tabular-nums">
                {Math.min(marks, selfMark.filter(Boolean).length)} / {marks}
              </span>
            ) : (
              <div className="flex gap-1">
                {Array.from({ length: marks + 1 }, (_, n) => (
                  <Button
                    key={n}
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSelfMark(null)
                      void record(n, 'self')
                    }}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            )}
            {points.length ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const s = Math.min(marks, selfMark.filter(Boolean).length)
                  setSelfMark(null)
                  void record(s, 'self')
                }}
              >
                Save mark
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {coach.text ? (
        <div className="rounded-lg p-3 ring-1 ring-line ring-inset">
          <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold text-ink-2">
            <Sparkles className="size-3.5 text-blue" aria-hidden /> Coach’s marking
          </p>
          <Markdown>{coach.text}</Markdown>
        </div>
      ) : null}
      {coach.error ? <p className="text-danger">{coach.error}</p> : null}

      {lost ? (
        <div className="flex flex-col gap-3 rounded-lg bg-sunken p-3">
          <p className="font-medium text-ink">
            {lost.score} out of {lost.max}. Log a mistake?
          </p>
          <Field label="Kind of mistake">
            <Select
              value={mistakeType}
              onChange={(e) => setMistakeType(e.target.value as typeof mistakeType)}
            >
              {MISTAKE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MISTAKE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note to yourself">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-14" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLost(null)}>
              Not now
            </Button>
            <Button
              variant="primary"
              onClick={() =>
                void db
                  .create('mistakes', {
                    attemptId: lost.attemptId,
                    questionId: question.id,
                    subjectId: question.subjectId,
                    type: mistakeType,
                    note: note.trim() || null,
                    status: 'open',
                    reviewDue: Date.now() + 3 * 86_400_000,
                  })
                  .then(() => {
                    changed('stats')
                    setLost(null)
                    setNote('')
                    toast({ title: 'Added to your mistakes' })
                  })
              }
            >
              Log mistake
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

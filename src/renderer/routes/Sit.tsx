import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Clock, X } from 'lucide-react'
import type { Paper, Question } from '@shared/models'
import { Button } from '@/design/Button'
import { Textarea } from '@/design/Form'
import { Skeleton } from '@/design/States'
import { useToast } from '@/design/Toast'
import { useAnnotations } from '@/features/paper/annotations'
import { isMultipleChoice } from '@/features/paper/data'
import { PdfPane, type PdfPaneHandle } from '@/features/paper/PdfPane'
import { questionTitle } from '@/features/questions/data'
import { changed, db, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'

interface Sitting {
  startedAt: number
  readingMs: number
  writingMs: number
  questionIds: string[]
  answers: Record<string, string>
  paperOnly: boolean
}

const WARN_AT = [30, 15, 10, 5, 1]

function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Exam mode: the paper, a countdown with reading time (answers locked while reading), an answer
 * panel that saves as you type, warnings near the end, and Submit, which leads to marking.
 * A sitting survives closing the app and resumes where it was.
 */
export function Sit() {
  const { paperId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const data = useLive(
    ['papers', 'questions'],
    async () => {
      const paper = (await db.get('papers', paperId)) as Paper | null
      if (!paper) return null
      const questions = (await db.list('questions', {
        where: { sourceId: paper.paperSourceId },
        orderBy: 'createdAt',
      })) as Question[]
      return { paper, questions }
    },
    [paperId],
  )
  const key = `sit.${paperId}`
  const [sitting, setSitting] = useState<Sitting | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const warned = useRef(new Set<string>())
  const pane = useRef<PdfPaneHandle>(null)
  const annotations = useAnnotations(data.data?.paper.paperSourceId ?? null)

  // Resume a sitting in progress, or start one from the setup sheet's choices.
  useEffect(() => {
    if (!data.data || sitting) return
    const { questions } = data.data
    void call('settings:get', { key }).then((saved) => {
      const resume = saved as Sitting | null
      if (resume && resume.startedAt + resume.readingMs + resume.writingMs > Date.now()) {
        setSitting(resume)
        toast({ title: 'Picked up where you left off', tone: 'info' })
        return
      }
      const scope = params.get('scope') ?? 'full'
      const section = params.get('section')
      let ids = questions.map((q) => q.id)
      if (scope === 'section' && section)
        ids = questions.filter((q) => q.section === section).map((q) => q.id)
      if (scope === 'mini') ids = [...ids].sort(() => Math.random() - 0.5).slice(0, 6)
      const next: Sitting = {
        startedAt: Date.now(),
        readingMs: Number(params.get('reading') ?? 15) * 60_000,
        writingMs: Number(params.get('minutes') ?? 120) * 60_000,
        questionIds: ids,
        answers: {},
        paperOnly: params.get('paperOnly') === '1' || ids.length === 0,
      }
      setSitting(next)
      void call('settings:set', { key, value: next })
    })
  }, [data.data, sitting, key, params, toast])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  const readingLeft = sitting ? sitting.startedAt + sitting.readingMs - now : 0
  const reading = readingLeft > 0
  const writingLeft = sitting ? sitting.startedAt + sitting.readingMs + sitting.writingMs - now : 0
  const over = Boolean(sitting) && !reading && writingLeft <= 0

  // Warnings at halfway and near the end.
  useEffect(() => {
    if (!sitting || reading) return
    const minsLeft = writingLeft / 60_000
    const half = sitting.writingMs / 120_000
    const fire = (id: string, title: string): void => {
      if (warned.current.has(id)) return
      warned.current.add(id)
      toast({ title, tone: 'info' })
    }
    if (minsLeft <= half && minsLeft > half - 0.05) fire('half', 'Halfway through writing time')
    for (const m of WARN_AT)
      if (minsLeft <= m && minsLeft > m - 0.05)
        fire(`m${m}`, `${m} ${m === 1 ? 'minute' : 'minutes'} left`)
    if (writingLeft <= 0) fire('end', 'Time is up. Pens down.')
  }, [sitting, reading, writingLeft, toast])

  // Reading time: the A–D keys do nothing.
  useEffect(() => {
    if (!reading) return
    const block = (e: KeyboardEvent): void => {
      if (
        /^[abcd]$/i.test(e.key) &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      )
        e.preventDefault()
    }
    window.addEventListener('keydown', block, true)
    return () => window.removeEventListener('keydown', block, true)
  }, [reading])

  const questions = useMemo(() => {
    const all = data.data?.questions ?? []
    return (sitting?.questionIds ?? [])
      .map((id) => all.find((q) => q.id === id))
      .filter((q): q is Question => Boolean(q))
  }, [data.data, sitting])

  const setAnswer = (id: string, value: string): void => {
    if (!sitting || reading) return
    const next = { ...sitting, answers: { ...sitting.answers, [id]: value } }
    setSitting(next)
    void call('settings:set', { key, value: next })
  }

  const submit = async (): Promise<void> => {
    if (!sitting || !data.data) return
    const elapsed = Math.round(
      Math.min(now - sitting.startedAt - sitting.readingMs, sitting.writingMs) / 1000,
    )
    let auto = 0
    for (const q of questions) {
      const given = sitting.answers[q.id]?.trim()
      if (!given) continue
      const mc = isMultipleChoice(q) && q.mc.answer
      const right = mc ? given.toUpperCase() === q.mc.answer?.toUpperCase() : false
      if (mc) auto++
      await db.create('attempts', {
        questionId: q.id,
        givenAnswerMd: given,
        score: mc ? (right ? (q.marks ?? 1) : 0) : null,
        max: q.marks ?? 1,
        selfMarked: false,
        seconds: Math.round(elapsed / Math.max(1, questions.length)),
      })
    }
    await call('settings:set', { key, value: null })
    changed('stats', 'attempts')
    toast({
      title: 'Submitted',
      description: auto
        ? `${auto} multiple-choice answers marked. Mark the written ones against the report.`
        : 'Now mark your answers against the report.',
    })
    const first =
      questions.find((q) => sitting.answers[q.id] && !isMultipleChoice(q)) ?? questions[0]
    void navigate(`/paper/${data.data.paper.id}${first ? `?q=${first.id}&tab=practice` : ''}`)
  }

  if (!data.data || !sitting)
    return (
      <div className="p-8">
        <Skeleton className="h-96" />
      </div>
    )
  const { paper } = data.data

  return (
    <div data-workspace className="flex h-full flex-col bg-surface">
      <header className="app-drag flex h-12 shrink-0 items-center gap-3 border-b border-line px-4 pl-20">
        <p className="min-w-0 flex-1 truncate font-semibold text-ink">{paper.title}</p>
        <div
          role="timer"
          aria-live="off"
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-semibold tabular-nums',
            reading
              ? 'bg-blue-soft text-blue'
              : writingLeft < 5 * 60_000
                ? 'bg-danger-soft text-danger'
                : 'bg-sunken text-ink',
          )}
        >
          <Clock className="size-4" aria-hidden />
          {reading ? `Reading ${clock(readingLeft)}` : over ? 'Time is up' : clock(writingLeft)}
        </div>
        <Button
          variant="primary"
          className="app-no-drag"
          onClick={() => void submit()}
          disabled={reading}
        >
          Submit
        </Button>
        <Button
          variant="ghost"
          className="app-no-drag"
          icon={<X className="size-4" />}
          onClick={() => {
            if (window.confirm('Leave the exam? Your answers are saved and you can resume.'))
              void navigate('/exam')
          }}
        >
          Leave
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <PdfPane
          ref={pane}
          sourceId={paper.paperSourceId}
          annotations={annotations}
          tool="select"
          onTool={() => undefined}
          color="#facc15"
          onColor={() => undefined}
          locked
          onLocked={() => undefined}
          onArea={() => undefined}
          onQuestionBox={() => undefined}
          onTextAction={() => undefined}
          compact
          keyboard
        />
        {sitting.paperOnly ? null : (
          <aside className="flex w-[380px] shrink-0 flex-col border-l border-line">
            <div className="border-b border-line px-4 py-3">
              <p className="font-semibold text-ink">Your answers</p>
              <p className="text-2xs text-ink-3">
                {reading ? 'Reading time: answers are locked.' : 'Saved as you type.'}
              </p>
            </div>
            <ol className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {questions.map((q) => {
                const value = sitting.answers[q.id] ?? ''
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      className="mb-1.5 flex w-full items-baseline justify-between text-left"
                      onClick={() =>
                        q.regions[0] && pane.current?.goTo(q.regions[0].page, q.regions[0].y)
                      }
                    >
                      <span className="font-medium text-ink">{questionTitle(q)}</span>
                      <span className="text-2xs text-ink-3">
                        {q.marks !== null ? `${q.marks} mk` : ''}
                      </span>
                    </button>
                    {isMultipleChoice(q) ? (
                      <div className="flex gap-1.5" role="radiogroup" aria-label={questionTitle(q)}>
                        {(q.mc.options ?? ['A', 'B', 'C', 'D']).map((o) => (
                          <button
                            key={o}
                            type="button"
                            role="radio"
                            aria-checked={value === o}
                            disabled={reading}
                            onClick={() => setAnswer(q.id, o)}
                            className={cn(
                              'h-9 flex-1 rounded-md font-semibold ring-1 ring-line-strong ring-inset disabled:opacity-50',
                              value === o
                                ? 'bg-blue text-white ring-blue'
                                : 'text-ink hover:bg-hover',
                            )}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Textarea
                        value={value}
                        readOnly={reading}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        aria-label={`Answer to ${questionTitle(q)}`}
                        className="min-h-24"
                      />
                    )}
                  </li>
                )
              })}
            </ol>
          </aside>
        )}
      </div>
    </div>
  )
}

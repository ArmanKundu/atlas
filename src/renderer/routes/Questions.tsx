import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Check, FileText, Play, RotateCcw } from 'lucide-react'
import type { Attempt, Mistake, Question, Source } from '@shared/models'
import { Button } from '@/design/Button'
import { Badge, Select, SubjectDot } from '@/design/Form'
import { Markdown } from '@/design/Markdown'
import { Page, PageHeader } from '@/design/Page'
import { Segmented } from '@/design/Segmented'
import { EmptyState, SkeletonList } from '@/design/States'
import { useToast } from '@/design/Toast'
import {
  MISTAKE_LABELS,
  questionTitle,
  STATUS_LABEL,
  STATUS_TONE,
  statusOf,
  type QuestionStatus,
  useQuestionDetail,
} from '@/features/questions/data'
import { QuestionInspector } from '@/features/questions/QuestionInspector'
import { QuestionPractice } from '@/features/questions/QuestionPractice'
import { RegionImage } from '@/features/questions/RegionImage'
import { db, useLive } from '@/lib/api'
import { useSubjects } from '@/lib/app-state'
import { useNow } from '@/lib/now'

type Tab = 'all' | 'practice' | 'mistakes'

/** The question as it appears on the paper, or its text when it has no paper. */
function QuestionBody({ question }: { question: Question }) {
  return question.sourceId && question.regions.length ? (
    <RegionImage sourceId={question.sourceId} regions={question.regions} width={720} />
  ) : (
    <Markdown>{question.stemMd}</Markdown>
  )
}

function useQuestionData() {
  return useLive(['questions', 'attempts', 'mistakes', 'sources'], async () => {
    const [questions, attempts, mistakes, sources] = await Promise.all([
      db.list('questions', { orderBy: 'createdAt' }) as Promise<Question[]>,
      db.list('attempts') as Promise<Attempt[]>,
      db.list('mistakes') as Promise<Mistake[]>,
      db.list('sources') as Promise<Source[]>,
    ])
    const bySource = new Map(sources.map((s) => [s.id, s]))
    const attemptsBy = new Map<string, Attempt[]>()
    for (const attempt of attempts) {
      const list = attemptsBy.get(attempt.questionId) ?? []
      list.push(attempt)
      attemptsBy.set(attempt.questionId, list)
    }
    return { questions, attemptsBy, mistakes, bySource }
  })
}

/** One question with its paper, practised in place. Used by a practice session. */
function PracticeCard({ questionId, onNext }: { questionId: string; onNext?: () => void }) {
  const detail = useQuestionDetail(questionId)
  const data = detail.data
  if (!data) return <SkeletonList rows={3} />
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-xl p-4 ring-1 ring-line ring-inset">
        <div className="mb-3 flex items-center gap-2">
          <p className="font-semibold text-ink">{questionTitle(data.question)}</p>
          {data.question.marks !== null ? <Badge>{data.question.marks} marks</Badge> : null}
        </div>
        <QuestionBody question={data.question} />
      </div>
      <div>
        <QuestionPractice question={data.question} answers={data.answers} onNext={onNext} />
      </div>
    </div>
  )
}

/** Questions marked on papers: browse them, practise a set, and work through mistakes. */
export function Questions() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'all'
  const setTab = (next: Tab): void => setParams({ tab: next }, { replace: true })
  const subjects = useSubjects()
  const toast = useToast()
  const now = useNow()
  const data = useQuestionData()
  const [subjectId, setSubjectId] = useState('')
  const [status, setStatus] = useState<'' | QuestionStatus>('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [queue, setQueue] = useState<string[] | null>(null)
  const [position, setPosition] = useState(0)

  const subjectName = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const rows = useMemo(() => {
    if (!data.data) return []
    return data.data.questions
      .map((question) => ({
        question,
        status: statusOf(data.data?.attemptsBy.get(question.id) ?? []),
      }))
      .filter((row) => !subjectId || row.question.subjectId === subjectId)
      .filter((row) => !status || row.status === status)
  }, [data.data, subjectId, status])

  const startPractice = (): void => {
    // Weakest first: never right, then never tried, then the rest.
    const order: Record<QuestionStatus, number> = { wrong: 0, partial: 1, new: 2, right: 3 }
    const ids = [...rows]
      .sort((a, b) => order[a.status] - order[b.status])
      .map((r) => r.question.id)
    setQueue(ids)
    setPosition(0)
    setTab('practice')
  }

  const openMistakes = (data.data?.mistakes ?? []).filter((m) => m.status === 'open')
  const questionById = new Map((data.data?.questions ?? []).map((q) => [q.id, q]))
  const filters = (
    <div className="flex items-center gap-2">
      <Select
        value={subjectId}
        onChange={(e) => setSubjectId(e.target.value)}
        className="w-44"
        aria-label="Subject"
      >
        <option value="">All subjects</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Select
        value={status}
        onChange={(e) => setStatus(e.target.value as '' | QuestionStatus)}
        className="w-36"
        aria-label="Status"
      >
        <option value="">Any result</option>
        {(Object.keys(STATUS_LABEL) as QuestionStatus[]).map((key) => (
          <option key={key} value={key}>
            {STATUS_LABEL[key]}
          </option>
        ))}
      </Select>
    </div>
  )

  return (
    <Page width="full" className="max-w-[1280px]">
      <PageHeader
        title="Questions"
        description="Questions you have marked on past papers. Practise them with the solution hidden, then mark yourself."
        actions={
          rows.length ? (
            <Button variant="primary" icon={<Play className="size-4" />} onClick={startPractice}>
              Practise {rows.length === 1 ? '1 question' : `${rows.length} questions`}
            </Button>
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Questions view"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: `All${data.data ? ` (${data.data.questions.length})` : ''}` },
            { value: 'practice', label: 'Practice' },
            {
              value: 'mistakes',
              label: `Mistakes${openMistakes.length ? ` (${openMistakes.length})` : ''}`,
            },
          ]}
        />
        {tab === 'all' ? filters : null}
      </div>

      {data.loading && !data.data ? <SkeletonList rows={5} /> : null}

      {tab === 'all' && data.data ? (
        data.data.questions.length === 0 ? (
          <EmptyState eyebrow="No questions yet" title="Mark questions on a past paper">
            Open a paper from the{' '}
            <Link to="/library" className="text-blue hover:underline">
              Library
            </Link>
            , turn on Mark questions and drag a box around each one. They appear here to practise.
          </EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <ul className="flex flex-col divide-y divide-line rounded-xl ring-1 ring-line ring-inset">
              {rows.map(({ question, status: s }) => {
                const subject = subjectName.get(question.subjectId)
                const source = question.sourceId
                  ? data.data?.bySource.get(question.sourceId)
                  : undefined
                return (
                  <li key={question.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(question.id)}
                      aria-current={openId === question.id}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-hover aria-[current=true]:bg-blue-soft"
                    >
                      {subject ? <SubjectDot colour={subject.colour} className="mt-1.5" /> : null}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-ink">{questionTitle(question)}</span>
                          {source ? (
                            <span className="truncate text-2xs text-ink-3">{source.title}</span>
                          ) : null}
                        </span>
                        <span className="line-clamp-2 text-ink-2">{question.stemMd}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {question.marks !== null ? <Badge>{question.marks}</Badge> : null}
                        <Badge tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Badge>
                      </span>
                    </button>
                  </li>
                )
              })}
              {rows.length === 0 ? (
                <li className="px-4 py-6 text-ink-3">Nothing matches these filters.</li>
              ) : null}
            </ul>
            <div className="lg:sticky lg:top-0 lg:self-start">
              {openId && questionById.get(openId) ? (
                <div className="flex max-h-[calc(100vh-180px)] flex-col overflow-hidden rounded-xl ring-1 ring-line ring-inset">
                  {(() => {
                    const q = questionById.get(openId)
                    return q?.sourceId ? (
                      <div className="flex items-center justify-between border-b border-line px-4 py-2">
                        <span className="text-2xs text-ink-3">
                          {data.data?.bySource.get(q.sourceId)?.title ?? 'Paper'}
                        </span>
                        <Link
                          to={`/viewer/${q.sourceId}?page=${q.regions[0]?.page ?? 1}`}
                          className="flex items-center gap-1 text-2xs font-medium text-blue hover:underline"
                        >
                          <FileText className="size-3.5" aria-hidden />
                          Open on the paper
                        </Link>
                      </div>
                    ) : null
                  })()}
                  <QuestionInspector
                    key={openId}
                    questionId={openId}
                    onClose={() => setOpenId(null)}
                  />
                </div>
              ) : (
                <p className="rounded-xl p-6 text-ink-3 ring-1 ring-line ring-inset">
                  Choose a question to practise it or edit its solution.
                </p>
              )}
            </div>
          </div>
        )
      ) : null}

      {tab === 'practice' ? (
        queue && queue.length ? (
          position < queue.length ? (
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-active">
                  <div
                    className="h-full rounded-full bg-blue transition-[width]"
                    style={{ width: `${(position / queue.length) * 100}%` }}
                  />
                </div>
                <span className="text-2xs text-ink-3 tabular-nums">
                  {position + 1} of {queue.length}
                </span>
                <Button variant="ghost" size="sm" onClick={() => setQueue(null)}>
                  End session
                </Button>
              </div>
              <PracticeCard
                key={queue[position]}
                questionId={queue[position] ?? ''}
                onNext={() => setPosition((p) => p + 1)}
              />
            </div>
          ) : (
            <EmptyState
              eyebrow="Session done"
              title={`You worked through ${queue.length} questions`}
            >
              <div className="mt-3 flex justify-center gap-2">
                <Button
                  variant="secondary"
                  icon={<RotateCcw className="size-4" />}
                  onClick={() => setPosition(0)}
                >
                  Go again
                </Button>
                <Button variant="primary" onClick={() => setTab('mistakes')}>
                  Review mistakes
                </Button>
              </div>
            </EmptyState>
          )
        ) : (
          <EmptyState eyebrow="Practice" title="Start a practice session">
            Pick a subject and result under All, then press Practise. Questions you got wrong come
            first.
            <div className="mt-3 flex justify-center">
              <Button
                variant="primary"
                icon={<Play className="size-4" />}
                disabled={!rows.length}
                onClick={startPractice}
              >
                Practise {rows.length} questions
              </Button>
            </div>
          </EmptyState>
        )
      ) : null}

      {tab === 'mistakes' && data.data ? (
        openMistakes.length === 0 ? (
          <EmptyState eyebrow="Mistakes" title="No open mistakes">
            When you mark yourself below full marks, you can log what went wrong. It shows up here
            to review.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {openMistakes
              .sort((a, b) => (a.reviewDue ?? 0) - (b.reviewDue ?? 0))
              .map((mistake) => {
                const question = mistake.questionId
                  ? questionById.get(mistake.questionId)
                  : undefined
                const due = mistake.reviewDue !== null && mistake.reviewDue <= now
                return (
                  <li
                    key={mistake.id}
                    className="flex items-start gap-3 rounded-xl p-4 ring-1 ring-line ring-inset"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">
                          {question ? questionTitle(question) : 'Question removed'}
                        </span>
                        <Badge tone="danger">{MISTAKE_LABELS[mistake.type]}</Badge>
                        {due ? <Badge tone="blue">Due for review</Badge> : null}
                      </div>
                      {mistake.note ? <p className="mt-1 text-ink-2">{mistake.note}</p> : null}
                      {question ? (
                        <p className="mt-1 line-clamp-1 text-ink-3">{question.stemMd}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {question ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setQueue([question.id])
                            setPosition(0)
                            setTab('practice')
                          }}
                        >
                          Try again
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Check className="size-3.5" />}
                        onClick={() =>
                          void db
                            .update('mistakes', mistake.id, { status: 'fixed' })
                            .then(() => toast({ title: 'Marked as fixed' }))
                        }
                      >
                        Fixed
                      </Button>
                    </div>
                  </li>
                )
              })}
          </ul>
        )
      ) : null}
    </Page>
  )
}

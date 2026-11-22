import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FolderSearch,
  Layers,
  Search,
  Shuffle,
  Upload,
} from 'lucide-react'
import type { Attempt, Paper, Question, Source } from '@shared/models'
import { PAPER_GROUPS } from '@shared/models'
import { parseReference } from '@shared/papers'
import { Button } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Field, Select, Textarea } from '@/design/Form'
import { EmptyState, SkeletonList } from '@/design/States'
import { useToast } from '@/design/Toast'
import {
  GROUP_LABEL,
  matchScore,
  paperScore,
  questionRef,
  structureLine,
  syncPapers,
  tokens,
} from '@/features/paper/data'
import { SitSetup } from '@/features/paper/SitSetup'
import { db, useLive } from '@/lib/api'
import { useSubjects } from '@/lib/app-state'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { useSetting } from '@/lib/settings'

function useExamData(subjectId: string | null) {
  return useLive(
    ['papers', 'sources', 'questions', 'attempts'],
    async () => {
      if (!subjectId) return null
      const [papers, sources, questions, attempts] = await Promise.all([
        db.list('papers', { where: { subjectId }, orderBy: 'year', desc: true }) as Promise<
          Paper[]
        >,
        db.list('sources') as Promise<Source[]>,
        db.list('questions', { where: { subjectId }, orderBy: 'createdAt' }) as Promise<Question[]>,
        db.list('attempts') as Promise<Attempt[]>,
      ])
      return { papers, sources, questions, attempts }
    },
    [subjectId],
  )
}

/** Exam home: find any question, more ways to practise, and the paper library. */
export function Exam() {
  const subjects = useSubjects()
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [remembered, setRemembered] = useSetting<string | null>('exam.subject', null)
  const subjectId = params.get('subject') ?? remembered ?? subjects[0]?.id ?? null
  const subject = subjects.find((s) => s.id === subjectId) ?? subjects[0]
  const data = useExamData(subject?.id ?? null)
  const [query, setQuery] = useState(() => params.get('find') ?? '')
  const [browse, setBrowse] = useState('')
  const [collapsed, setCollapsed] = useSetting<string[]>('exam.collapsed', ['earlier'])
  const [sitPaper, setSitPaper] = useState<Paper | null>(null)
  const [adding, setAdding] = useState(false)
  const synced = useRef<string | null>(null)

  // Turn exam files in the library into papers, paired with their reports.
  useEffect(() => {
    if (!subject || !data.data || synced.current === subject.id) return
    synced.current = subject.id
    void syncPapers(subject, data.data.sources, data.data.papers).then((made) => {
      if (made > 0)
        toast({ title: `Found ${made} past ${made === 1 ? 'paper' : 'papers'} in your library` })
    })
  }, [subject, data.data, toast])

  const papers = useMemo(() => data.data?.papers ?? [], [data.data])
  const questions = useMemo(() => data.data?.questions ?? [], [data.data])
  const sourceById = useMemo(
    () => new Map((data.data?.sources ?? []).map((s) => [s.id, s])),
    [data.data],
  )
  const paperBySource = useMemo(() => new Map(papers.map((p) => [p.paperSourceId, p])), [papers])
  const questionsOf = (paper: Paper): Question[] =>
    questions.filter((q) => q.sourceId === paper.paperSourceId)

  const results = useMemo(() => {
    const text = query.trim()
    const pool = browse
      ? questions.filter((q) => q.sourceId === papers.find((p) => p.id === browse)?.paperSourceId)
      : questions
    if (!text) return browse ? pool.map((q) => ({ question: q, score: null as number | null })) : []
    const ref = parseReference(text)
    if (ref) {
      const hits = pool.filter((q) => {
        const paper = q.sourceId ? paperBySource.get(q.sourceId) : undefined
        if (ref.year && paper?.year !== ref.year) return false
        if (ref.sitting && paper && paper.sitting !== ref.sitting) return false
        if (ref.exam && paper?.exam !== ref.exam) return false
        if (ref.section && (q.section ?? '').toUpperCase() !== ref.section) return false
        return (q.number ?? '').toLowerCase() === (ref.number ?? '').toLowerCase()
      })
      if (hits.length) return hits.map((q) => ({ question: q, score: 100 }))
    }
    const t = tokens(text)
    return pool
      .map((q) => ({ question: q, score: matchScore(t, q.stemMd) }))
      .filter((r) => (r.score ?? 0) >= 35)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 12)
  }, [query, browse, questions, papers, paperBySource])

  const openQuestion = (q: Question): void => {
    const paper = q.sourceId ? paperBySource.get(q.sourceId) : undefined
    if (paper) void navigate(`/paper/${paper.id}?q=${q.id}`)
    else void navigate(`/questions`)
  }

  if (!subject) {
    return (
      <div className="p-8">
        <EmptyState eyebrow="Exam" title="Add a subject first">
          Papers and questions belong to a subject.{' '}
          <Link to="/settings?tab=subjects" className="text-blue hover:underline">
            Add one in Settings
          </Link>
          .
        </EmptyState>
      </div>
    )
  }

  const groups = PAPER_GROUPS.map((group) => ({
    group,
    items: papers.filter((p) => p.grp === group),
  })).filter((g) => g.items.length)
  const cards = [
    {
      title: 'Quick test',
      body: 'Real past multiple choice, weighted to weak topics',
      icon: Shuffle,
      to: `/questions?tab=practice`,
    },
    {
      title: 'Build a practice exam',
      body: 'A printable official-format paper from the bank',
      icon: FilePlus2,
      to: '/exam-builder',
    },
    {
      title: 'Practice sets',
      body: `${questions.length ? 'Weakest first, from your marked questions' : 'Mark questions to make sets'}`,
      icon: Layers,
      to: '/questions?tab=practice',
    },
    {
      title: 'Search questions',
      body: 'Every question, answer and examiner report',
      icon: FolderSearch,
      to: '/questions',
    },
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[760px] px-6 pt-10 pb-16">
        <header className="mb-9 flex items-end justify-between gap-6">
          <div className="min-w-0">
            <label className="relative mb-1 inline-flex items-center gap-1 text-ink-3">
              <span className="sr-only">Subject</span>
              <select
                value={subject.id}
                onChange={(e) => {
                  setRemembered(e.target.value)
                  setParams({ subject: e.target.value }, { replace: true })
                  synced.current = null
                }}
                className="appearance-none bg-transparent pr-4 font-medium outline-none hover:text-ink"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 size-3" aria-hidden />
            </label>
            <h1 className="text-[2rem] leading-10 font-semibold tracking-[-0.025em] text-ink">
              Exam
            </h1>
            <p className="mt-1.5 max-w-[52ch] text-ink-2">
              Practise under exam conditions, then see exactly where the marks went, on your own
              answers.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="secondary"
              icon={<Upload className="size-4" />}
              onClick={() => setAdding(true)}
            >
              Submit written work
            </Button>
            <Button
              variant="primary"
              disabled={!papers.length}
              onClick={() => setSitPaper(papers[0] ?? null)}
            >
              Start exam
            </Button>
          </div>
        </header>

        <section className="mb-10">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[1.0625rem] font-semibold text-ink">Find a question</h2>
            <span className="text-2xs text-ink-3 tabular-nums">
              {questions.length.toLocaleString()} questions · {papers.length} papers
            </span>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-3 left-3 size-4 text-ink-3"
              aria-hidden
            />
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Find a question"
              placeholder={
                'Paste or type any question, even half-remembered: "how do …", "2019 B4", "question 9 NHT"…'
              }
              className="min-h-20 rounded-lg pl-9 text-[0.9375rem]"
            />
          </div>
          <div className="mt-2 flex items-center gap-2 text-ink-3">
            <span>Or browse:</span>
            <Select
              value={browse}
              onChange={(e) => setBrowse(e.target.value)}
              aria-label="Browse a paper"
              className="h-8 w-56"
            >
              <option value="">All papers</option>
              {papers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          </div>
          {query.trim() || browse ? (
            <ul className="mt-3 divide-y divide-line rounded-lg ring-1 ring-line ring-inset">
              {results.length ? (
                results.map(({ question, score }) => {
                  const paper = question.sourceId ? paperBySource.get(question.sourceId) : undefined
                  return (
                    <li key={question.id}>
                      <button
                        type="button"
                        onClick={() => openQuestion(question)}
                        className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-hover"
                      >
                        {score !== null ? (
                          <span className="w-11 shrink-0 pt-px text-2xs font-semibold text-blue tabular-nums">
                            {score}%
                          </span>
                        ) : null}
                        <span className="w-24 shrink-0 font-medium text-ink">
                          {questionRef(paper, question)}
                        </span>
                        <span className="line-clamp-2 min-w-0 flex-1 text-ink-2">
                          {question.stemMd}
                        </span>
                      </button>
                    </li>
                  )
                })
              ) : (
                <li className="px-3 py-4 text-ink-3">
                  {questions.length
                    ? 'No question matches that yet.'
                    : 'No questions marked yet. Open a paper and mark its questions to search them here.'}
                </li>
              )}
            </ul>
          ) : null}
        </section>

        <section className="mb-10">
          <h2 className="mb-3 text-[1.0625rem] font-semibold text-ink">More practice</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cards.map((card) => (
              <Link
                key={card.title}
                to={card.to}
                className="flex flex-col gap-2 rounded-xl p-3.5 ring-1 ring-line ring-inset transition-colors hover:bg-hover"
              >
                <card.icon className="size-4 text-ink-2" aria-hidden />
                <span className="font-medium text-ink">{card.title}</span>
                <span className="text-2xs leading-4 text-ink-3">{card.body}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[1.0625rem] font-semibold text-ink">Paper library</h2>
            <span className="text-2xs text-ink-3">
              Official papers are kept apart from edited copies
            </span>
          </div>
          {data.loading && !data.data ? <SkeletonList rows={4} /> : null}
          {data.data && groups.length === 0 ? (
            <EmptyState eyebrow="No papers yet" title="Import past papers for this subject">
              Import exam PDFs and their examiner reports in the{' '}
              <Link to="/library" className="text-blue hover:underline">
                Library
              </Link>
              . Atlas recognises official file names and pairs each paper with its report.
              <div className="mt-3 flex justify-center">
                <Button variant="secondary" onClick={() => setAdding(true)}>
                  Add a paper by hand
                </Button>
              </div>
            </EmptyState>
          ) : null}
          <div className="flex flex-col gap-2">
            {groups.map(({ group, items }) => {
              const closed = collapsed.includes(group)
              return (
                <div key={group}>
                  <button
                    type="button"
                    aria-expanded={!closed}
                    onClick={() =>
                      setCollapsed(
                        closed ? collapsed.filter((g) => g !== group) : [...collapsed, group],
                      )
                    }
                    className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-left hover:bg-hover"
                  >
                    {closed ? (
                      <ChevronRight className="size-4 text-ink-3" aria-hidden />
                    ) : (
                      <ChevronDown className="size-4 text-ink-3" aria-hidden />
                    )}
                    <span className="font-medium text-ink">{GROUP_LABEL[group]}</span>
                    <span className="text-ink-3 tabular-nums">{items.length}</span>
                  </button>
                  {closed ? null : (
                    <ul className="mt-1 divide-y divide-line rounded-xl ring-1 ring-line ring-inset">
                      {items.map((paper) => {
                        const qs = questionsOf(paper)
                        const best = paperScore(qs, data.data?.attempts ?? [])
                        const source = sourceById.get(paper.paperSourceId)
                        return (
                          <li key={paper.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-2">
                                <span className="font-medium text-ink">{paper.title}</span>
                                {best ? (
                                  <span className="text-2xs text-ink-3 tabular-nums">
                                    best {best.score}/{best.max} ·{' '}
                                    {new Date(best.at).toLocaleDateString(undefined, {
                                      day: 'numeric',
                                      month: 'short',
                                    })}
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-2xs text-ink-3">
                                {structureLine(paper, qs, source?.pageCount ?? null)}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!paper.reportSourceId}
                                onClick={() =>
                                  void navigate(`/paper/${paper.id}?view=report&nav=1`)
                                }
                              >
                                Report
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setSitPaper(paper)}>
                                Sit it
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void navigate(`/paper/${paper.id}`)}
                              >
                                Open
                              </Button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
      {sitPaper ? (
        <SitSetup
          paper={sitPaper}
          questions={questionsOf(sitPaper)}
          onClose={() => setSitPaper(null)}
        />
      ) : null}
      <AddPaperDialog
        open={adding}
        onOpenChange={setAdding}
        subjectId={subject.id}
        sources={(data.data?.sources ?? []).filter((s) => s.mime === 'application/pdf')}
        papers={papers}
      />
    </div>
  )
}

/** Add a paper by hand: choose its PDF and, optionally, its report; or attach marked work. */
function AddPaperDialog({
  open,
  onOpenChange,
  subjectId,
  sources,
  papers,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subjectId: string
  sources: Source[]
  papers: Paper[]
}) {
  const toast = useToast()
  const [mode, setMode] = useState<'paper' | 'work'>('work')
  const [paperSource, setPaperSource] = useState('')
  const [reportSource, setReportSource] = useState('')
  const [title, setTitle] = useState('')
  const [forPaper, setForPaper] = useState('')
  const [myPapers, setMyPapers] = useSetting<Record<string, string>>('paper.mine', {})

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'work' ? 'Submit written work' : 'Add a paper'}
      description={
        mode === 'work'
          ? 'Attach a scan or PDF of a paper you wrote. It opens as “My paper” next to the original.'
          : 'Choose an exam PDF already in your library, and its report if you have it.'
      }
      footer={
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            className="text-2xs text-blue hover:underline"
            onClick={() => setMode(mode === 'work' ? 'paper' : 'work')}
          >
            {mode === 'work' ? 'Add a paper instead' : 'Submit written work instead'}
          </button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {mode === 'work' ? (
              <Button
                variant="primary"
                disabled={!forPaper}
                onClick={() =>
                  void call('library:pickAndImport', { subjectId, kind: 'other' }).then((rows) => {
                    const row = rows[0] as { id?: string } | undefined
                    if (!row?.id) return
                    setMyPapers({ ...myPapers, [forPaper]: row.id })
                    toast({
                      title: 'Your paper is attached',
                      description: 'Open the paper and choose My paper.',
                    })
                    onOpenChange(false)
                  })
                }
              >
                Choose file…
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={!paperSource}
                onClick={() =>
                  void db
                    .create('papers', {
                      subjectId,
                      title:
                        title.trim() || sources.find((s) => s.id === paperSource)?.title || 'Paper',
                      grp: 'mine',
                      paperSourceId: paperSource,
                      reportSourceId: reportSource || null,
                    })
                    .then(() => {
                      toast({ title: 'Paper added' })
                      onOpenChange(false)
                    })
                }
              >
                Add paper
              </Button>
            )}
          </div>
        </div>
      }
    >
      {mode === 'work' ? (
        <Field label="Which paper is it for?">
          <Select value={forPaper} onChange={(e) => setForPaper(e.target.value)}>
            <option value="">Choose a paper</option>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Paper">
            <Select value={paperSource} onChange={(e) => setPaperSource(e.target.value)}>
              <option value="">Choose a PDF</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Examiner report (optional)">
            <Select value={reportSource} onChange={(e) => setReportSource(e.target.value)}>
              <option value="">None</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Title" hint="For example “2024 Trial Exam 2”.">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={cn(
                'h-9 w-full rounded-md px-3 ring-1 ring-line-strong ring-inset outline-none focus:ring-2 focus:ring-focus',
              )}
            />
          </Field>
        </div>
      )}
    </Dialog>
  )
}

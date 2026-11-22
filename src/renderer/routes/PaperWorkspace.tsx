import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, ChevronLeft, ChevronRight, ListTree, PanelRight } from 'lucide-react'
import type { Answer, Attempt, Paper, Question, Region, Source, Topic } from '@shared/models'
import { Button, IconButton } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Segmented } from '@/design/Segmented'
import { EmptyState, Skeleton } from '@/design/States'
import { useToast } from '@/design/Toast'
import { Tooltip } from '@/design/Tooltip'
import { MoreTab } from '@/features/paper/MoreTab'
import { AskDrawer } from '@/features/paper/AskDrawer'
import { useAnnotations, SWATCHES, type Tool } from '@/features/paper/annotations'
import { InspectorHeader } from '@/features/paper/InspectorHeader'
import { Navigator } from '@/features/paper/Navigator'
import { OverviewTab } from '@/features/paper/OverviewTab'
import { PdfPane, type PdfPaneHandle, type TextAction } from '@/features/paper/PdfPane'
import { PracticeTab } from '@/features/paper/PracticeTab'
import { questionContext, questionRef, structureLine } from '@/features/paper/data'
import { useSharedPdf } from '@/features/questions/pdf-cache'
import { QuestionDetails } from '@/features/questions/QuestionDetails'
import { useQuestionDetail } from '@/features/questions/data'
import { guessMarks, guessNumber, questionText, regionText } from '@/features/questions/regions'
import { Buddy } from '@/mascot/Buddy'
import { changed, db, useLive } from '@/lib/api'
import { useSubjects } from '@/lib/app-state'
import { cn } from '@/lib/cn'
import { platform } from '@/lib/ipc'
import { isMac } from '@/lib/keys'
import { useSetting } from '@/lib/settings'

type View = 'paper' | 'report' | 'solutions' | 'mine'
type Tab = 'overview' | 'practice' | 'more'
const VIEWS: View[] = ['paper', 'report', 'solutions', 'mine']
const VIEW_LABEL: Record<View, string> = {
  paper: 'Paper',
  report: 'Examiner report',
  solutions: 'Solutions',
  mine: 'My paper',
}

const TEXT_PROMPT: Record<TextAction, (t: string) => string> = {
  ask: (t) => `About this part of the paper: “${t}”`,
  explain: (t) => `Explain this simply, as if I am seeing it for the first time: “${t}”`,
  define: (t) => `Define, in VCE terms: “${t}”`,
  examiner: (t) => `What does the examiner want to see in an answer here? “${t}”`,
}

function useWorkspaceData(paperId: string | undefined) {
  return useLive(
    ['papers', 'sources', 'questions', 'attempts', 'topics'],
    async () => {
      if (!paperId) return null
      const paper = (await db.get('papers', paperId)) as Paper | undefined
      if (!paper) return { paper: null }
      const [papers, sources, questions, attempts, topics] = await Promise.all([
        db.list('papers', {
          where: { subjectId: paper.subjectId },
          orderBy: 'year',
          desc: true,
        }) as Promise<Paper[]>,
        db.list('sources') as Promise<Source[]>,
        db.list('questions', {
          where: { subjectId: paper.subjectId },
          orderBy: 'createdAt',
        }) as Promise<Question[]>,
        db.list('attempts') as Promise<Attempt[]>,
        db.list('topics', { where: { subjectId: paper.subjectId } }) as Promise<Topic[]>,
      ])
      return { paper, papers, sources, questions, attempts, topics }
    },
    [paperId],
  )
}

/** Sorts questions the way they appear: by first page, then down the page. */
function byPosition(a: Question, b: Question): number {
  const ra = a.regions[0]
  const rb = b.regions[0]
  if (!ra || !rb) return (ra ? -1 : 0) - (rb ? -1 : 0) || a.createdAt - b.createdAt
  return ra.page - rb.page || ra.y - rb.y
}

function hit(regions: Region[], page: number, x: number, y: number): boolean {
  return regions.some(
    (r) => r.page === page && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
  )
}

/**
 * The paper workspace: the question navigator on the left, the paper (or its report, solutions,
 * or your own marked paper) in the middle, and the question inspector on the right.
 */
export function PaperWorkspace() {
  const { paperId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const subjects = useSubjects()
  const [params, setParams] = useSearchParams()
  const data = useWorkspaceData(paperId)
  const paper = data.data?.paper ?? null
  const subject = subjects.find((s) => s.id === paper?.subjectId)

  const [mine] = useSetting<Record<string, string>>('paper.mine', {})
  const [navOpen, setNavOpen] = useSetting<boolean>(`paper.nav.${paper?.subjectId ?? 'none'}`, true)
  const [inspectorOpen, setInspectorOpen] = useSetting<boolean>('paper.inspector', true)
  const [revealed, setRevealed] = useSetting<string[]>('paper.revealed', [])
  const [color, setColor] = useSetting<string>('paper.colour', SWATCHES[0])
  const [tool, setTool] = useState<Tool>('select')
  const [locked, setLocked] = useState(false)
  const [split, setSplit] = useState(false)
  const [hover, setHover] = useState<{ id: string; page: number } | null>(null)
  const [ask, setAsk] = useState<{ prompt: string | null; extra: string } | null>(null)
  const [editing, setEditing] = useState(false)
  const pane = useRef<PdfPaneHandle>(null)

  const view = (VIEWS.includes(params.get('view') as View) ? params.get('view') : 'paper') as View
  const tab = (
    ['overview', 'practice', 'more'].includes(params.get('tab') ?? '')
      ? params.get('tab')
      : 'overview'
  ) as Tab
  const selectedId = params.get('q')
  const setParam = useCallback(
    (next: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(next)) {
            if (v === null) p.delete(k)
            else p.set(k, v)
          }
          return p
        },
        { replace: true },
      ),
    [setParams],
  )

  // A deep link can open the navigator (…?nav=1).
  useEffect(() => {
    if (params.get('nav') === '1') {
      setNavOpen(true)
      setParam({ nav: null })
    }
  }, [params, setNavOpen, setParam])

  const sources = data.data?.sources ?? []
  const sourceFor = (v: View): string | null => {
    if (!paper) return null
    if (v === 'paper') return paper.paperSourceId
    if (v === 'report') return paper.reportSourceId
    if (v === 'solutions') return paper.solutionsSourceId
    return mine[paper.id] ?? null
  }
  const sourceId = sourceFor(view)
  const source = sources.find((s) => s.id === sourceId)
  const annotations = useAnnotations(sourceId)
  const pdf = useSharedPdf(sourceId)

  const paperQuestions = useMemo(
    () =>
      (data.data?.questions ?? [])
        .filter((q) => paper && q.sourceId === paper.paperSourceId)
        .sort(byPosition),
    [data.data?.questions, paper],
  )
  const index = paperQuestions.findIndex((q) => q.id === selectedId)
  const selected = index >= 0 ? paperQuestions[index] : undefined
  const detail = useQuestionDetail(selected?.id ?? null)
  const answers: Answer[] = detail.data?.answers ?? []
  const attempts = (data.data?.attempts ?? []).filter((a) => a.questionId === selected?.id)
  const isRevealed = selected ? revealed.includes(selected.id) : false
  const sectionNames = [
    ...new Set(paperQuestions.map((q) => q.section).filter((s): s is string => Boolean(s))),
  ]

  /** Which boxes to draw in this view: question boxes on the paper, report boxes in the report. */
  const boxesOf = (q: Question): Region[] =>
    view === 'report' ? q.reportRegions : view === 'paper' ? q.regions : []

  const select = useCallback(
    (q: Question | undefined, scroll = true) => {
      if (!q) return
      setParam({ q: q.id })
      const target =
        view === 'report' ? q.reportRegions[0] : view === 'paper' ? q.regions[0] : undefined
      if (scroll && target) pane.current?.goTo(target.page, target.y)
    },
    [setParam, view],
  )
  const step = (delta: number): void =>
    select(
      paperQuestions[
        Math.max(0, Math.min(paperQuestions.length - 1, (index < 0 ? -1 : index) + delta))
      ],
    )
  const reveal = (): void => {
    if (selected && !isRevealed) setRevealed([...revealed, selected.id])
  }
  const hide = (): void => {
    if (selected) setRevealed(revealed.filter((id) => id !== selected.id))
  }
  const setView = (v: View): void => {
    if (!sourceFor(v)) {
      toast({
        title: `No ${VIEW_LABEL[v].toLowerCase()} for this paper`,
        description:
          v === 'mine'
            ? 'Add your written work from the Exam page.'
            : 'Import it in the Library and it pairs automatically.',
      })
      return
    }
    setParam({ view: v })
  }

  // Keyboard: 1–4 views, [ and ] questions, R reveal, A answer, Esc closes things.
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined)
  const onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null
    if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const v = VIEWS[Number(e.key) - 1]
    if (v) setView(v)
    else if (e.key === '[' || (e.key === 'ArrowUp' && e.shiftKey)) step(-1)
    else if (e.key === ']' || (e.key === 'ArrowDown' && e.shiftKey)) step(1)
    else if (e.key.toLowerCase() === 'r' && selected) {
      if (isRevealed) hide()
      else reveal()
    } else if (e.key.toLowerCase() === 'a' && selected) setParam({ tab: 'practice' })
    else if (e.key === 'Escape') {
      if (ask) setAsk(null)
      else if (tool !== 'select') setTool('select')
      else if (selected) setParam({ q: null })
      else return
    } else return
    e.preventDefault()
  }
  useEffect(() => {
    keys.current = onKey
  })
  useEffect(() => {
    const on = (e: KeyboardEvent): void => keys.current(e)
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  // Opening a deep link scrolls to its question once the pages exist.
  const scrolled = useRef<string | null>(null)
  useEffect(() => {
    if (!selected || !pdf.doc || scrolled.current === `${view}:${selected.id}`) return
    scrolled.current = `${view}:${selected.id}`
    const target =
      view === 'report'
        ? selected.reportRegions[0]
        : view === 'paper'
          ? selected.regions[0]
          : undefined
    if (target) setTimeout(() => pane.current?.goTo(target.page, target.y), 60)
  }, [selected, pdf.doc, view])

  if (data.loading && !data.data) return <Skeleton className="m-6 h-[70vh]" />
  if (!paper)
    return (
      <EmptyState
        title="Paper not found"
        action={<Button onClick={() => void navigate('/exam')}>Back to Exam</Button>}
      >
        It may have been removed. Go back to the Exam page to pick another.
      </EmptyState>
    )

  const onBox = async (region: Region): Promise<void> => {
    setTool('select')
    if (view === 'report') {
      if (!selected) {
        toast({
          title: 'Pick a question first',
          description: 'Then draw the box around where the report discusses it.',
        })
        return
      }
      await db.update('questions', selected.id, {
        reportRegions: [...selected.reportRegions, region],
      })
      changed('questions')
      toast({ title: `Report box added to ${questionRef(paper, selected)}` })
      return
    }
    if (view !== 'paper' || !paper.subjectId) return
    const text = pdf.doc ? await questionText(pdf.doc, [region]) : ''
    const created = await db.create('questions', {
      subjectId: paper.subjectId,
      sourceId: paper.paperSourceId,
      year: paper.year,
      paper: paper.exam,
      number: guessNumber(text) ?? String(paperQuestions.length + 1),
      marks: guessMarks(text),
      stemMd: text || `Question on page ${region.page}`,
      pageRefs: [region.page],
      regions: [region],
    })
    changed('questions')
    setParam({ q: created.id })
  }

  const onArea = async (region: Region): Promise<void> => {
    setTool('select')
    const text = pdf.doc ? await regionText(pdf.doc, region) : ''
    setAsk({
      prompt: 'Explain what is in this part of the page.',
      extra: `The student selected this part of page ${region.page}:\n${text || '(no text could be read from it)'}`,
    })
  }

  const context =
    (selected
      ? questionContext(selected, paper, answers)
      : `${paper.title}. ${structureLine(paper, paperQuestions, source?.pageCount ?? null)}`) +
    (ask?.extra ? `\n\n${ask.extra}` : '')

  const overlay = (page: number) => (
    <div className="pointer-events-none absolute inset-0">
      {paperQuestions.flatMap((q) =>
        boxesOf(q)
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => r.page === page)
          .map(({ r, i }) => {
            const on = q.id === selected?.id
            const over = hover?.id === q.id && !on
            const label = `Q${q.number ?? '?'}`
            return (
              <div
                key={`${q.id}-${i}`}
                data-question-box={q.id}
                className={cn(
                  'absolute rounded-[3px] transition-[box-shadow,background-color] duration-100',
                  on
                    ? 'bg-blue/[0.04] ring-2 ring-blue'
                    : over
                      ? 'bg-blue/[0.03] ring-1 ring-blue/50'
                      : '',
                )}
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                }}
              >
                {on && i === 0 ? (
                  <span className="absolute -top-[1px] left-0 -translate-y-full rounded-t-[4px] bg-blue px-1.5 py-px text-2xs font-semibold text-white">
                    {label}
                  </span>
                ) : null}
                {over && i === 0 ? (
                  <span className="absolute top-0 left-full ml-2 rounded-md bg-ink px-2 py-1 text-2xs font-medium whitespace-nowrap text-surface shadow-sm">
                    {label}
                    {q.marks !== null ? ` · ${q.marks} mark${q.marks === 1 ? '' : 's'}` : ''}
                    {q.stateAverage !== null ? ` · avg ${Math.round(q.stateAverage)}%` : ''}
                  </span>
                ) : null}
              </div>
            )
          }),
      )}
    </div>
  )

  const onPagePointer = (
    kind: 'move' | 'click' | 'leave',
    page: number,
    x: number,
    y: number,
  ): void => {
    if (kind === 'leave') {
      setHover(null)
      return
    }
    const found = paperQuestions.find((q) => hit(boxesOf(q), page, x, y))
    if (kind === 'move') setHover(found ? { id: found.id, page } : null)
    else if (found) select(found, false)
  }

  const viewOptions = VIEWS.map((v, i) => ({ value: v, label: `${VIEW_LABEL[v]} ${i + 1}` }))
  const splitSource =
    paper.reportSourceId && view !== 'report' ? paper.reportSourceId : paper.paperSourceId

  return (
    <div data-workspace className="flex h-full min-h-0 flex-col bg-canvas">
      <header
        className={cn(
          'app-drag flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3',
          isMac() && 'pl-20',
          platform() === 'win32' && 'pr-[148px]',
        )}
      >
        <Tooltip label="Back to Exam">
          <IconButton
            label="Back to Exam"
            onClick={() => void navigate(`/exam?subject=${paper.subjectId}`)}
          >
            <ArrowLeft className="size-4" />
          </IconButton>
        </Tooltip>
        <Tooltip label={navOpen ? 'Hide questions' : 'Show questions'}>
          <IconButton
            label="Questions"
            aria-pressed={navOpen}
            onClick={() => setNavOpen(!navOpen)}
            className={cn(navOpen && 'bg-active')}
          >
            <ListTree className="size-4" />
          </IconButton>
        </Tooltip>
        <div className="mr-2 min-w-0">
          <h1 className="truncate text-[0.875rem] leading-5 font-semibold text-ink">
            {paper.title}
          </h1>
          <p className="truncate text-2xs leading-4 text-ink-3">
            {subject?.name ? `${subject.name} · ` : ''}
            {structureLine(paper, paperQuestions, source?.pageCount ?? null)}
          </p>
        </div>
        <div className="mx-auto">
          <Segmented label="Document" value={view} onChange={setView} options={viewOptions} />
        </div>
        <Tooltip label="Previous question" shortcut="[">
          <IconButton label="Previous question" disabled={index <= 0} onClick={() => step(-1)}>
            <ChevronLeft className="size-4" />
          </IconButton>
        </Tooltip>
        <Tooltip label="Next question" shortcut="]">
          <IconButton
            label="Next question"
            disabled={index >= paperQuestions.length - 1}
            onClick={() => step(1)}
          >
            <ChevronRight className="size-4" />
          </IconButton>
        </Tooltip>
        <Button
          variant="secondary"
          size="sm"
          icon={<Buddy size={18} />}
          onClick={() => setAsk({ prompt: null, extra: '' })}
        >
          Ask Atlas
        </Button>
        <Tooltip label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}>
          <IconButton
            label="Inspector"
            aria-pressed={inspectorOpen}
            onClick={() => setInspectorOpen(!inspectorOpen)}
            className={cn(inspectorOpen && 'bg-active')}
          >
            <PanelRight className="size-4" />
          </IconButton>
        </Tooltip>
      </header>

      <div className="flex min-h-0 flex-1">
        {navOpen ? (
          <aside
            className="w-[300px] shrink-0 border-r border-line bg-surface"
            aria-label="Questions"
          >
            <Navigator
              papers={data.data?.papers ?? []}
              paper={paper}
              questions={paperQuestions}
              attempts={data.data?.attempts ?? []}
              topics={data.data?.topics ?? []}
              selectedId={selected?.id ?? null}
              revisit={paperQuestions.filter((q) => q.bookmarked).map((q) => q.id)}
              sectionNames={sectionNames}
              onPaper={(id) => void navigate(`/paper/${id}`)}
              onSelect={(q) => select(q)}
              onClose={() => setNavOpen(false)}
            />
          </aside>
        ) : null}

        <main className="flex min-w-0 flex-1">
          {sourceId ? (
            <div className="min-w-0 flex-1">
              <PdfPane
                ref={pane}
                key={sourceId}
                sourceId={sourceId}
                overlay={view === 'paper' || view === 'report' ? overlay : undefined}
                annotations={annotations}
                tool={tool}
                onTool={setTool}
                color={color}
                onColor={setColor}
                locked={locked}
                onLocked={setLocked}
                canMarkQuestions={view === 'paper' || view === 'report'}
                onArea={(r) => void onArea(r)}
                onQuestionBox={(r) => void onBox(r)}
                onTextAction={(action, text) =>
                  setAsk({ prompt: TEXT_PROMPT[action](text.slice(0, 600)), extra: '' })
                }
                onPagePointer={onPagePointer}
                splitActive={split}
                onSplit={() => setSplit(!split)}
                keyboard
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState title={`No ${VIEW_LABEL[view].toLowerCase()} yet`}>
                Import it in the Library and Atlas pairs it with this paper by its file name.
              </EmptyState>
            </div>
          )}
          {split && splitSource ? (
            <div className="min-w-0 flex-1 border-l border-line">
              <SplitPane sourceId={splitSource} />
            </div>
          ) : null}
        </main>

        {inspectorOpen ? (
          <aside
            className="relative flex w-[430px] shrink-0 flex-col border-l border-line bg-surface"
            aria-label="Question inspector"
          >
            {selected ? (
              <>
                <div className="shrink-0 px-5 pt-4">
                  <InspectorHeader
                    paper={paper}
                    question={selected}
                    topics={data.data?.topics ?? []}
                    attempts={attempts}
                    onPrev={index > 0 ? () => step(-1) : undefined}
                    onNext={index < paperQuestions.length - 1 ? () => step(1) : undefined}
                    onEdit={() => setEditing(true)}
                  />
                  <div className="mt-3 border-b border-line">
                    <div role="tablist" aria-label="Inspector" className="-mb-px flex gap-4">
                      {(['overview', 'practice', 'more'] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="tab"
                          aria-selected={tab === t}
                          onClick={() => setParam({ tab: t })}
                          className={cn(
                            'h-9 border-b-2 text-[0.8125rem] font-medium capitalize',
                            tab === t
                              ? 'border-ink text-ink'
                              : 'border-transparent text-ink-3 hover:text-ink',
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" role="tabpanel">
                  {tab === 'overview' ? (
                    <OverviewTab
                      paper={paper}
                      question={selected}
                      answers={answers}
                      revealed={isRevealed}
                      onReveal={reveal}
                      onHide={hide}
                      onAnswer={() => setParam({ tab: 'practice' })}
                      onAsk={() => setAsk({ prompt: null, extra: '' })}
                      onOpenReport={paper.reportSourceId ? () => setView('report') : undefined}
                    />
                  ) : tab === 'practice' ? (
                    <PracticeTab
                      key={selected.id}
                      paper={paper}
                      question={selected}
                      answers={answers}
                      attempts={attempts}
                      kind={subject?.kind ?? 'other'}
                    />
                  ) : (
                    <MoreTab
                      key={selected.id}
                      question={selected}
                      paper={paper}
                      papers={data.data?.papers ?? []}
                      all={data.data?.questions ?? []}
                      onOpen={(q) => {
                        const other = (data.data?.papers ?? []).find(
                          (p) => p.paperSourceId === q.sourceId,
                        )
                        if (other && other.id !== paper.id)
                          void navigate(`/paper/${other.id}?q=${q.id}`)
                        else select(q)
                      }}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <EmptyState
                  title={
                    paperQuestions.length
                      ? 'Pick a question'
                      : 'No questions marked on this paper yet'
                  }
                >
                  {paperQuestions.length
                    ? 'Click a question on the paper, or choose one from the list. [ and ] move between them.'
                    : 'Use “Mark a question” in the toolbar and draw a box around each question. Atlas reads its number, marks and text.'}
                </EmptyState>
              </div>
            )}
            {ask ? (
              <AskDrawer
                title={selected ? questionRef(paper, selected) : paper.title}
                subjectId={paper.subjectId}
                context={context}
                initialPrompt={ask.prompt}
                onClose={() => setAsk(null)}
              />
            ) : null}
          </aside>
        ) : null}
      </div>

      {selected && detail.data ? (
        <Dialog
          open={editing}
          onOpenChange={setEditing}
          title={`Edit ${questionRef(paper, selected)}`}
          width={640}
        >
          <QuestionDetails
            question={detail.data.question as Question}
            answers={answers}
            onDeleted={() => {
              setEditing(false)
              setParam({ q: null })
            }}
          />
        </Dialog>
      ) : null}
    </div>
  )
}

/** The second pane in split view: its own tools, no keyboard, no question boxes. */
function SplitPane({ sourceId }: { sourceId: string }) {
  const annotations = useAnnotations(sourceId)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState<string>(SWATCHES[0])
  const [locked, setLocked] = useState(false)
  return (
    <PdfPane
      sourceId={sourceId}
      annotations={annotations}
      tool={tool}
      onTool={setTool}
      color={color}
      onColor={setColor}
      locked={locked}
      onLocked={setLocked}
      onArea={() => undefined}
      onQuestionBox={() => undefined}
      onTextAction={() => undefined}
      compact
    />
  )
}

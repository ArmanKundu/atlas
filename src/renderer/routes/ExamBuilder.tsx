import { useState } from 'react'
import { Download, FilePlus2, Trash2 } from 'lucide-react'
import type { Exam } from '@shared/models'
import { Button, IconButton } from '@/design/Button'
import { Badge, Field, Input, Select, Textarea } from '@/design/Form'
import { Card, Page, PageHeader } from '@/design/Page'
import { Segmented } from '@/design/Segmented'
import { EmptyState, ErrorState } from '@/design/States'
import { useToast } from '@/design/Toast'
import { ExamPaper } from '@/features/exam/ExamPaper'
import { db, useAction, useLive } from '@/lib/api'
import { useSubjects } from '@/lib/app-state'
import { call } from '@/lib/ipc'

const SEPARATOR = '===SOLUTIONS==='

/**
 * Exam builder: describe a paper, and AI writes practice questions plus a solutions booklet.
 * Both export as A4 PDFs. Drawing from imported past questions arrives with the question bank.
 */
export function ExamBuilder() {
  const subjects = useSubjects()
  const toast = useToast()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tab, setTab] = useState<'paper' | 'solutions'>('paper')
  const [form, setForm] = useState({
    subjectId: '',
    topics: '',
    multipleChoice: 10,
    extendedMarks: 30,
    minutes: 60,
    notes: '',
  })
  const exams = useLive(['exams'], () => db.list('exams'))
  const active = exams.data?.find((e) => e.id === activeId) ?? null

  const build = useAction(async () => {
    const subject = subjects.find((s) => s.id === form.subjectId)
    const spec = [
      `Subject: ${subject?.name ?? 'General'}`,
      `Topics: ${form.topics || 'the whole course'}`,
      `Multiple-choice questions: ${form.multipleChoice} (1 mark each)`,
      `Extended-response marks: ${form.extendedMarks}`,
      `Writing time: ${form.minutes} minutes`,
      form.notes ? `Extra instructions: ${form.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n')
    const result = await call('ai:complete', {
      task: 'exam',
      prompt: spec,
      subjectId: form.subjectId || null,
    })
    const [paper = '', solutions = ''] = result.text.split(SEPARATOR)
    const title = /^#\s+(.+)$/m.exec(paper)?.[1]?.trim() ?? `${subject?.name ?? 'Practice'} exam`
    const exam: Exam = await db.create('exams', {
      subjectId: form.subjectId || null,
      title: title.slice(0, 200),
      config: form,
      bodyMd: paper.trim(),
      solutionsMd: solutions.trim(),
      provider: result.provider,
    })
    setActiveId(exam.id)
    setTab('paper')
  })
  const exportPdf = useAction(async (variant: 'paper' | 'solutions') => {
    if (!active) return
    const saved = await call('exam:exportPdf', { examId: active.id, variant })
    if (saved) toast({ title: 'PDF saved', description: saved.path })
  })

  return (
    <Page>
      <PageHeader
        title="Exam builder"
        description="Build a practice paper with a separate solutions booklet, then export both as PDFs."
      />
      <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-6">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4 p-4">
            <Field label="Subject">
              <Select
                value={form.subjectId}
                onChange={(e) => setForm({ ...form, subjectId: e.target.value })}
              >
                <option value="">Any</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Topics" hint="Leave empty for the whole course.">
              <Textarea
                className="min-h-16"
                value={form.topics}
                onChange={(e) => setForm({ ...form, topics: e.target.value })}
                placeholder="e.g. Differentiation, the chain rule, stationary points"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Multiple choice">
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={form.multipleChoice}
                  onChange={(e) => setForm({ ...form, multipleChoice: Number(e.target.value) })}
                />
              </Field>
              <Field label="Written marks">
                <Input
                  type="number"
                  min={0}
                  max={200}
                  value={form.extendedMarks}
                  onChange={(e) => setForm({ ...form, extendedMarks: Number(e.target.value) })}
                />
              </Field>
              <Field label="Minutes">
                <Input
                  type="number"
                  min={5}
                  max={300}
                  value={form.minutes}
                  onChange={(e) => setForm({ ...form, minutes: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="Anything else">
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. harder than usual, no calculator"
              />
            </Field>
            <Button
              variant="primary"
              disabled={build.pending}
              onClick={() => void build.run()}
              icon={<FilePlus2 className="size-3.5" aria-hidden />}
            >
              {build.pending ? 'Writing the paper…' : 'Build exam'}
            </Button>
            {build.pending ? <p className="text-ink-3">This can take a minute or two.</p> : null}
            {build.error ? (
              <ErrorState title="The exam was not built">{build.error}</ErrorState>
            ) : null}
          </Card>
          <Card>
            <p className="border-b border-line px-4 py-2.5 font-semibold">Your exams</p>
            {(exams.data ?? []).length === 0 ? (
              <p className="px-4 py-4 text-ink-3">Papers you build are kept here.</p>
            ) : null}
            {exams.data?.map((exam) => (
              <div
                key={exam.id}
                className="flex items-center gap-2 border-b border-line px-2 py-1 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => setActiveId(exam.id)}
                  aria-current={exam.id === activeId}
                  className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-hover aria-[current=true]:bg-hover"
                >
                  <span className="block truncate font-medium">{exam.title}</span>
                  <span className="text-2xs text-ink-3">
                    {new Date(exam.createdAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </button>
                <IconButton
                  label="Delete exam"
                  size="sm"
                  onClick={() => {
                    void db.remove('exams', exam.id)
                    if (exam.id === activeId) setActiveId(null)
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </IconButton>
              </div>
            ))}
          </Card>
        </div>

        {active ? (
          <Card className="min-w-0 p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <Segmented
                label="Booklet"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'paper', label: 'Question paper' },
                  { value: 'solutions', label: 'Solutions' },
                ]}
              />
              <div className="flex items-center gap-2">
                {active.provider ? <Badge>Written by AI</Badge> : null}
                <Button
                  size="sm"
                  disabled={exportPdf.pending}
                  icon={<Download className="size-3.5" aria-hidden />}
                  onClick={() => void exportPdf.run(tab)}
                >
                  {exportPdf.pending ? 'Saving…' : 'Save as PDF'}
                </Button>
              </div>
            </div>
            {exportPdf.error ? (
              <ErrorState title="The PDF was not saved" className="mb-4">
                {exportPdf.error}
              </ErrorState>
            ) : null}
            <div className="exam-sheet overflow-hidden rounded-sm">
              <ExamPaper
                title={active.title}
                bodyMd={(tab === 'paper' ? active.bodyMd : active.solutionsMd) ?? ''}
                subjectName={subjects.find((item) => item.id === active.subjectId)?.name ?? ''}
                kind={subjects.find((item) => item.id === active.subjectId)?.kind ?? 'other'}
                colour={subjects.find((item) => item.id === active.subjectId)?.colour}
                minutes={Number((active.config as { minutes?: number }).minutes ?? 60)}
                solutions={tab === 'solutions'}
              />
            </div>
            <p className="mt-6 border-t border-line pt-3 text-2xs text-ink-3">
              AI-written practice questions. Check them against your course before relying on them.
            </p>
          </Card>
        ) : (
          <EmptyState eyebrow="Exam builder" title="Describe the paper you want">
            Choose a subject and topics, set the number of questions and the time, and Atlas writes
            a practice paper with a matching solutions booklet. It needs a connected AI.
          </EmptyState>
        )}
      </div>
    </Page>
  )
}

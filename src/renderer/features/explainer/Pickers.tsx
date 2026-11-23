import { useMemo, useState } from 'react'
import { FileText, Search } from 'lucide-react'
import type { Question, Source, Subject, Topic } from '@shared/models'
import { Button } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Input, Select } from '@/design/Form'
import { db, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { questionName, stemPreview } from './names'

/** Picks files from the library (scans, notes, textbooks, exams) to explain. */
export function LibraryPicker({
  open,
  onOpenChange,
  subjectId,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subjectId: string | null
  onPick: (source: Source) => void
}) {
  const [query, setQuery] = useState('')
  const sources = useLive(
    ['sources'],
    () =>
      open
        ? (db.list('sources', { orderBy: 'createdAt', desc: true, limit: 400 }) as Promise<
            Source[]
          >)
        : Promise.resolve([]),
    [open],
  )
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (sources.data ?? [])
      .filter((s) => !subjectId || !s.subjectId || s.subjectId === subjectId)
      .filter((s) => !q || s.title.toLowerCase().includes(q))
      .slice(0, 80)
  }, [sources.data, query, subjectId])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Explain something from your library"
      description="Scans, worksheets, notes and exams you've added."
      width={560}
    >
      <div className="relative mb-3">
        <Search className="absolute top-2 left-2.5 size-4 text-ink-3" aria-hidden />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your library"
          aria-label="Search your library"
          className="pl-8"
        />
      </div>
      <ul className="flex flex-col gap-0.5">
        {shown.map((source) => (
          <li key={source.id}>
            <button
              type="button"
              onClick={() => {
                onPick(source)
                onOpenChange(false)
              }}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-hover"
            >
              <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-ink">{source.title}</span>
              <span className="shrink-0 text-2xs text-ink-3">
                {[source.kind, source.year].filter(Boolean).join(' · ')}
              </span>
            </button>
          </li>
        ))}
        {sources.data && shown.length === 0 ? (
          <li className="px-2 py-6 text-center text-ink-3">Nothing matches.</li>
        ) : null}
      </ul>
    </Dialog>
  )
}

const DIFFICULTY = [
  { value: '', label: 'Any difficulty' },
  { value: '1', label: 'Easier' },
  { value: '2', label: 'Medium' },
  { value: '3', label: 'Harder' },
]

/**
 * Building blocks for finding an exam question: subject, then paper, then question, narrowed by
 * topic and difficulty, or found by searching what it says ("the one about the logistic curve").
 */
export function QuestionPicker({
  open,
  onOpenChange,
  subjects,
  initialSubjectId,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subjects: Subject[]
  initialSubjectId: string | null
  onPick: (question: Question) => void
}) {
  const [subjectId, setSubjectId] = useState(initialSubjectId ?? '')
  const [paper, setPaper] = useState('')
  const [topicId, setTopicId] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [query, setQuery] = useState('')

  const questions = useLive(
    ['questions'],
    () =>
      open
        ? db.list('questions', {
            where: subjectId ? { subjectId } : {},
            orderBy: 'year',
            desc: true,
            limit: 2000,
          })
        : Promise.resolve([]),
    [open, subjectId],
  )
  const topics = useLive(
    ['topics'],
    () =>
      open && subjectId
        ? db.list('topics', { where: { subjectId } })
        : Promise.resolve([] as Topic[]),
    [open, subjectId],
  )

  const papers = useMemo(() => {
    const names = new Set<string>()
    for (const q of questions.data ?? []) {
      const name = [q.year, q.paper].filter(Boolean).join(' ')
      if (name) names.add(name)
    }
    return [...names].sort().reverse()
  }, [questions.data])

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return (questions.data ?? [])
      .filter((q) => !paper || [q.year, q.paper].filter(Boolean).join(' ') === paper)
      .filter((q) => !topicId || q.topicIds.includes(topicId))
      .filter((q) => !difficulty || String(q.difficulty ?? '') === difficulty)
      .filter((q) => {
        if (words.length === 0) return true
        const hay = `${questionName(q)} ${q.stemMd} ${q.tags.join(' ')}`.toLowerCase()
        return words.every((w) => hay.includes(w))
      })
      .sort(
        (a, b) =>
          (b.year ?? 0) - (a.year ?? 0) ||
          String(a.paper ?? '').localeCompare(String(b.paper ?? '')) ||
          String(a.number ?? '').localeCompare(String(b.number ?? ''), undefined, {
            numeric: true,
          }),
      )
      .slice(0, 120)
  }, [questions.data, paper, topicId, difficulty, query])

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Pick an exam question"
      description="Narrow it down, or just describe the question."
      width={680}
    >
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select
          aria-label="Subject"
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value)
            setPaper('')
            setTopicId('')
          }}
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Exam" value={paper} onChange={(e) => setPaper(e.target.value)}>
          <option value="">All exams</option>
          {papers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Topic"
          value={topicId}
          disabled={!subjectId}
          onChange={(e) => setTopicId(e.target.value)}
        >
          <option value="">Any topic</option>
          {(topics.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Difficulty"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          {DIFFICULTY.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="relative mb-3">
        <Search className="absolute top-2 left-2.5 size-4 text-ink-3" aria-hidden />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a question by what it says, e.g. “logistic” or “2025 Q3”"
          aria-label="Find a question"
          className="pl-8"
        />
      </div>
      <ul className="flex flex-col gap-1">
        {shown.map((q) => (
          <li key={q.id}>
            <button
              type="button"
              onClick={() => {
                onPick(q)
                onOpenChange(false)
              }}
              className={cn(
                'flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left hover:bg-hover',
              )}
            >
              <span className="text-2xs font-medium text-ink-2">
                {questionName(q)}
                {q.marks ? ` · ${q.marks} marks` : ''}
              </span>
              <span className="line-clamp-2 text-ink">{stemPreview(q.stemMd)}</span>
            </button>
          </li>
        ))}
        {questions.data && shown.length === 0 ? (
          <li className="px-2 py-8 text-center text-ink-3">
            {(questions.data.length ?? 0) === 0
              ? 'No exam questions yet. Import a past paper in Exam first.'
              : 'Nothing matches. Try fewer filters.'}
          </li>
        ) : null}
      </ul>
      <div className="mt-3 flex justify-end">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
      </div>
    </Dialog>
  )
}

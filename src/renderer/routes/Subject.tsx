import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { Plus, Trash2 } from 'lucide-react'
import { SUBJECT_COLOURS, SUBJECT_KINDS, type Subject } from '@shared/models'
import { Button, IconButton } from '@/design/Button'
import { Field, Input, Select, SubjectDot } from '@/design/Form'
import { Card, Section } from '@/design/Page'
import { EmptyState } from '@/design/States'
import { ChatView } from '@/features/chat/ChatView'
import { FlashcardsView } from '@/features/flashcards/FlashcardsView'
import { LibraryView } from '@/features/library/LibraryView'
import { NotesView } from '@/features/notes/NotesView'
import { db, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/now'

const TABS = ['overview', 'library', 'notes', 'flashcards', 'ask'] as const
type Tab = (typeof TABS)[number]
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  library: 'Library',
  notes: 'Notes',
  flashcards: 'Flashcards',
  ask: 'Ask',
}
const KIND_LABELS: Record<(typeof SUBJECT_KINDS)[number], string> = {
  science: 'Science',
  maths: 'Maths',
  essay: 'Essay-based',
  accounting: 'Accounting',
  language: 'Language',
  other: 'Other',
}

function Overview({ subject }: { subject: Subject }) {
  const navigate = useNavigate()
  const now = useNow()
  const [topic, setTopic] = useState('')
  const [examLabel, setExamLabel] = useState('')
  const [examDate, setExamDate] = useState('')
  const topics = useLive(
    ['topics'],
    () => db.list('topics', { where: { subjectId: subject.id }, orderBy: 'createdAt' }),
    [subject.id],
  )
  const sources = useLive(
    ['sources'],
    () => db.list('sources', { where: { subjectId: subject.id } }),
    [subject.id],
  )
  const notes = useLive(['notes'], () => db.list('notes', { where: { subjectId: subject.id } }), [
    subject.id,
  ])
  const cards = useLive(
    ['flashcards'],
    () => db.list('flashcards', { where: { subjectId: subject.id } }),
    [subject.id],
  )

  return (
    <div className="mx-auto max-w-[var(--atlas-reading-w)] px-8 py-7">
      <div className="mb-8 grid grid-cols-3 gap-4">
        {[
          ['Resources', sources.data?.length ?? 0],
          ['Notes', notes.data?.length ?? 0],
          ['Flashcards', cards.data?.length ?? 0],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-ink-3">{label}</p>
            <p className="mt-1 text-[1.5rem] leading-7 font-semibold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-8">
        <Section
          title="Topics"
          description="The areas you need to cover. Add them by hand; they organise notes and practice."
        >
          <Card>
            {(topics.data ?? []).length === 0 ? (
              <p className="px-4 py-4 text-ink-3">No topics yet.</p>
            ) : null}
            {topics.data?.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 border-b border-line px-4 py-2 last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <IconButton
                  label={`Delete ${item.title}`}
                  size="sm"
                  onClick={() => void db.remove('topics', item.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </IconButton>
              </div>
            ))}
            <form
              className="flex gap-2 border-t border-line p-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!topic.trim()) return
                void db.create('topics', { subjectId: subject.id, title: topic.trim() })
                setTopic('')
              }}
            >
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Add a topic"
                aria-label="Topic name"
                className="h-8"
              />
              <Button
                type="submit"
                size="md"
                disabled={!topic.trim()}
                icon={<Plus className="size-3.5" aria-hidden />}
              >
                Add
              </Button>
            </form>
          </Card>
        </Section>

        <div>
          <Section title="Exam dates">
            <Card>
              {subject.examDates.length === 0 ? (
                <p className="px-4 py-4 text-ink-3">No exam dates set.</p>
              ) : null}
              {subject.examDates.map((exam, index) => {
                const days = Math.ceil((exam.date - now) / 86_400_000)
                return (
                  <div
                    key={`${exam.label}-${exam.date}`}
                    className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-b-0"
                  >
                    <span className="min-w-0 flex-1 truncate">{exam.label}</span>
                    <span className="text-ink-3">
                      {new Date(exam.date).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span className="w-20 text-right font-medium tabular-nums">
                      {days >= 0 ? `${days} days` : 'Past'}
                    </span>
                    <IconButton
                      label="Remove date"
                      size="sm"
                      onClick={() =>
                        void db.update('subjects', subject.id, {
                          examDates: subject.examDates.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </IconButton>
                  </div>
                )
              })}
              <form
                className="flex gap-2 border-t border-line p-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!examDate) return
                  void db.update('subjects', subject.id, {
                    examDates: [
                      ...subject.examDates,
                      {
                        label: examLabel.trim() || 'Exam',
                        date: new Date(`${examDate}T09:00`).getTime(),
                      },
                    ].sort((a, b) => a.date - b.date),
                  })
                  setExamLabel('')
                  setExamDate('')
                }}
              >
                <Input
                  value={examLabel}
                  onChange={(e) => setExamLabel(e.target.value)}
                  placeholder="Exam 1"
                  aria-label="Exam name"
                  className="h-8"
                />
                <Input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  aria-label="Exam date"
                  className="h-8 w-40"
                />
                <Button type="submit" disabled={!examDate}>
                  Add
                </Button>
              </form>
            </Card>
          </Section>

          <Section title="Subject details">
            <Card className="grid grid-cols-2 gap-4 p-4">
              <Field label="Name" className="col-span-2">
                <Input
                  defaultValue={subject.name}
                  onBlur={(e) =>
                    e.target.value.trim() &&
                    void db.update('subjects', subject.id, { name: e.target.value.trim() })
                  }
                />
              </Field>
              <Field label="Code">
                <Input
                  defaultValue={subject.code ?? ''}
                  maxLength={24}
                  onBlur={(e) =>
                    void db.update('subjects', subject.id, { code: e.target.value.trim() || null })
                  }
                />
              </Field>
              <Field label="Type">
                <Select
                  value={subject.kind}
                  onChange={(e) =>
                    void db.update('subjects', subject.id, {
                      kind: e.target.value as Subject['kind'],
                    })
                  }
                >
                  {SUBJECT_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="col-span-2">
                <p className="mb-1.5 font-medium">Colour</p>
                <div className="flex gap-2">
                  {SUBJECT_COLOURS.map((colour) => (
                    <button
                      key={colour}
                      type="button"
                      aria-label={colour}
                      aria-pressed={subject.colour === colour}
                      onClick={() => void db.update('subjects', subject.id, { colour })}
                      className="size-6 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-surface aria-pressed:ring-ink"
                      style={{ background: `var(--atlas-subject-${colour})` }}
                    />
                  ))}
                </div>
              </div>
              <div className="col-span-2 flex justify-end border-t border-line pt-3">
                <Button
                  variant="danger"
                  onClick={() => {
                    void db.update('subjects', subject.id, { active: false })
                    void navigate('/')
                  }}
                >
                  Archive subject
                </Button>
              </div>
            </Card>
          </Section>
        </div>
      </div>
    </div>
  )
}

/** One subject's workspace: overview, its library, notes, flashcards and a grounded tutor. */
export function SubjectRoute() {
  const { subjectId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const subject = useLive(['subjects'], () => db.get('subjects', subjectId), [subjectId])
  const tab = TABS.find((t) => t === params.get('tab')) ?? 'overview'

  if (subject.loading) return null
  if (!subject.data) {
    return (
      <div className="p-8">
        <EmptyState eyebrow="Not found" title="That subject does not exist">
          Pick a subject from the sidebar.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-line px-8 pt-6">
        <div className="flex items-center gap-3">
          <SubjectDot colour={subject.data.colour} className="size-3" />
          <h1 className="text-[1.5rem] leading-8 font-semibold tracking-[-0.02em]">
            {subject.data.name}
          </h1>
          {subject.data.code ? (
            <span className="font-mono text-2xs text-ink-3">{subject.data.code}</span>
          ) : null}
        </div>
        <div role="tablist" aria-label="Subject sections" className="mt-4 flex gap-5">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === tab}
              onClick={() => setParams(item === 'overview' ? {} : { tab: item }, { replace: true })}
              className={cn(
                '-mb-px border-b-2 pb-2.5 font-medium',
                item === tab
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink-3 hover:text-ink',
              )}
            >
              {TAB_LABELS[item]}
            </button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'overview' ? <Overview subject={subject.data} /> : null}
        {tab === 'library' ? (
          <div className="mx-auto max-w-[var(--atlas-reading-w)] px-8 py-7">
            <LibraryView subjectId={subjectId} />
          </div>
        ) : null}
        {tab === 'notes' ? <NotesView subjectId={subjectId} /> : null}
        {tab === 'flashcards' ? (
          <div className="mx-auto max-w-[var(--atlas-reading-w)] px-8 py-7">
            <FlashcardsView subjectId={subjectId} />
          </div>
        ) : null}
        {tab === 'ask' ? <ChatView subjectId={subjectId} /> : null}
      </div>
    </div>
  )
}

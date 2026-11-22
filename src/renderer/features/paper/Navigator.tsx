import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, Search } from 'lucide-react'
import type { Attempt, Paper, Question, Topic } from '@shared/models'
import { Segmented } from '@/design/Segmented'
import { cn } from '@/lib/cn'
import { statusOf } from '@/features/questions/data'
import { DIFFICULTY_CLASS, difficultyOf, isMultipleChoice, termsOf } from './data'

type Status = '' | 'new' | 'attempted' | 'right' | 'revisit'

/**
 * The "Questions" panel: pick a paper, search it, filter by section, topic, status and command
 * term, and jump to any question. Up and Down move through the list.
 */
export function Navigator({
  papers,
  paper,
  questions,
  attempts,
  topics,
  selectedId,
  revisit,
  sectionNames,
  onPaper,
  onSelect,
  onClose,
}: {
  papers: Paper[]
  paper: Paper
  questions: Question[]
  attempts: Attempt[]
  topics: Topic[]
  selectedId: string | null
  revisit: string[]
  /** Section labels for this subject's papers; empty when the paper has no sections. */
  sectionNames: string[]
  onPaper: (id: string) => void
  onSelect: (question: Question) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [section, setSection] = useState('all')
  const [topic, setTopic] = useState('')
  const [status, setStatus] = useState<Status>('')
  const [term, setTerm] = useState('')
  const list = useRef<HTMLDivElement>(null)

  const topicName = useMemo(() => new Map(topics.map((t) => [t.id, t.title])), [topics])
  const allTerms = useMemo(() => [...new Set(questions.flatMap(termsOf))].sort(), [questions])
  const attemptsOf = (id: string): Attempt[] => attempts.filter((a) => a.questionId === id)

  const filtered = questions.filter((q) => {
    if (section !== 'all' && (q.section ?? '') !== section) return false
    if (topic && !q.topicIds.includes(topic)) return false
    if (term && !termsOf(q).includes(term)) return false
    if (status) {
      const s = statusOf(attemptsOf(q.id))
      if (status === 'new' && s !== 'new') return false
      if (status === 'attempted' && s === 'new') return false
      if (status === 'right' && s !== 'right') return false
      if (status === 'revisit' && !revisit.includes(q.id)) return false
    }
    const n = query.trim().toLowerCase()
    if (n && !`${q.number ?? ''} ${q.stemMd}`.toLowerCase().includes(n)) return false
    return true
  })
  const groups = sectionNames.length
    ? sectionNames
        .map((s) => ({ section: s, items: filtered.filter((q) => (q.section ?? '') === s) }))
        .concat([
          {
            section: '',
            items: filtered.filter((q) => !q.section || !sectionNames.includes(q.section)),
          },
        ])
    : [{ section: '', items: filtered }]

  // Up and Down move the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (
        t.tagName === 'TEXTAREA' ||
        (t.tagName === 'INPUT' && t.getAttribute('type') !== 'search')
      )
        return
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      if (
        !list.current?.contains(document.activeElement) &&
        document.activeElement?.getAttribute('type') !== 'search'
      )
        return
      e.preventDefault()
      e.stopPropagation()
      const at = filtered.findIndex((q) => q.id === selectedId)
      const next =
        filtered[Math.max(0, Math.min(filtered.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (next) {
        onSelect(next)
        list.current?.querySelector<HTMLElement>(`[data-q="${next.id}"]`)?.focus()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <aside
      aria-label="Questions"
      className="flex w-[300px] shrink-0 flex-col border-r border-line bg-surface"
    >
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        <button
          type="button"
          aria-label="Close questions"
          onClick={onClose}
          className="flex size-7 items-center justify-center rounded-md text-ink-2 hover:bg-hover"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <select
          value={paper.id}
          onChange={(e) => onPaper(e.target.value)}
          aria-label="Paper"
          className="h-8 min-w-0 flex-1 truncate rounded-md bg-transparent px-1 font-semibold text-ink outline-none hover:bg-hover"
        >
          {papers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2 border-b border-line p-3">
        <label className="relative block">
          <Search
            className="pointer-events-none absolute top-2 left-2.5 size-4 text-ink-3"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this paper…"
            aria-label="Search this paper"
            className="h-8 w-full rounded-md bg-sunken pr-2 pl-8 text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-focus"
          />
        </label>
        {sectionNames.length ? (
          <Segmented
            label="Section"
            value={section}
            onChange={setSection}
            className="w-full [&>*]:flex-1"
            options={[
              { value: 'all', label: 'All' },
              ...sectionNames.map((s) => ({ value: s, label: `Section ${s}` })),
            ]}
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            aria-label="Topic"
            className="h-7 max-w-[8.5rem] rounded-md bg-sunken px-1.5 text-2xs text-ink-2 outline-none"
          >
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            aria-label="Status"
            className="h-7 rounded-md bg-sunken px-1.5 text-2xs text-ink-2 outline-none"
          >
            <option value="">Any status</option>
            <option value="new">Not attempted</option>
            <option value="attempted">Attempted</option>
            <option value="right">Correct</option>
            <option value="revisit">Marked to revisit</option>
          </select>
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="Command term"
            className="h-7 rounded-md bg-sunken px-1.5 text-2xs text-ink-2 outline-none"
          >
            <option value="">Any command</option>
            {allTerms.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className="ml-auto text-2xs text-ink-3 tabular-nums">
            {filtered.length}/{questions.length}
          </span>
        </div>
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto pb-3">
        {questions.length === 0 ? (
          <p className="p-4 text-ink-3">
            No questions on this paper yet. Use the box tool in the toolbar to mark them.
          </p>
        ) : null}
        {groups.map(({ section: s, items }) =>
          items.length ? (
            <div key={s || 'none'}>
              {s ? (
                <p className="sticky top-0 z-[1] bg-surface/95 px-4 pt-3 pb-1 text-2xs font-semibold text-ink-3 backdrop-blur">
                  Section {s}
                  {items.some(isMultipleChoice) ? ' · multiple choice' : ''}
                </p>
              ) : null}
              {items.map((q) => {
                const d = difficultyOf(q)
                const st = statusOf(attemptsOf(q.id))
                const firstTopic = q.topicIds[0] ? topicName.get(q.topicIds[0]) : undefined
                return (
                  <button
                    key={q.id}
                    type="button"
                    data-q={q.id}
                    aria-current={q.id === selectedId}
                    onClick={() => onSelect(q)}
                    className={cn(
                      'flex w-full gap-3 px-4 py-2.5 text-left outline-none hover:bg-hover focus-visible:bg-hover',
                      q.id === selectedId && 'bg-blue-soft hover:bg-blue-soft',
                    )}
                  >
                    <span className="w-10 shrink-0">
                      <span className="block font-semibold text-ink">Q{q.number ?? '?'}</span>
                      <span className="block text-[0.6875rem] text-ink-3">
                        {q.section ? `${q.section} · ` : ''}p.{q.regions[0]?.page ?? '–'}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 text-2xs">
                        {firstTopic ? (
                          <span className="truncate text-ink-2">{firstTopic}</span>
                        ) : null}
                        {q.marks !== null ? <span className="text-ink-3">{q.marks} mk</span> : null}
                        {d ? (
                          <span
                            className={cn(
                              'rounded px-1 py-px text-[0.6875rem] font-medium',
                              DIFFICULTY_CLASS[d],
                            )}
                          >
                            {d}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-2xs leading-4 text-ink-2">
                        {q.stemMd}
                      </span>
                      <span
                        className={cn(
                          'text-[0.6875rem]',
                          st === 'right'
                            ? 'text-success'
                            : st === 'new'
                              ? 'text-ink-3'
                              : 'text-warn',
                        )}
                      >
                        {st === 'new' ? 'not attempted' : st === 'right' ? 'correct' : 'attempted'}
                        {revisit.includes(q.id) ? ' · revisit' : ''}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null,
        )}
      </div>
    </aside>
  )
}

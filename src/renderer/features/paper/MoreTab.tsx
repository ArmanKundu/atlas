import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Bookmark, BookmarkCheck, ListPlus, ListX, Search } from 'lucide-react'
import type { Paper, Question } from '@shared/models'
import { Button } from '@/design/Button'
import { Textarea } from '@/design/Form'
import { changed, db } from '@/lib/api'
import { useSetting } from '@/lib/settings'
import { questionRef, similarQuestions } from './data'

/** More: similar questions from other papers, how often this idea comes up, notes and lists. */
export function MoreTab({
  question,
  paper,
  papers,
  all,
  onOpen,
}: {
  question: Question
  paper: Paper
  papers: Paper[]
  all: Question[]
  onOpen: (q: Question) => void
}) {
  const navigate = useNavigate()
  const [notes, setNotes] = useSetting<string>(`qnote.${question.id}`, '')
  // null until the student types, so the saved note shows once it has loaded.
  const [typed, setDraft] = useState<string | null>(null)
  const draft = typed ?? notes
  const [queue, setQueue] = useSetting<string[]>('practice.queue', [])
  const similar = similarQuestions(question, all)
  const paperOf = (q: Question): Paper | undefined =>
    papers.find((p) => p.paperSourceId === q.sourceId)
  const years = similar.map((s) => s.question.year).filter((y): y is number => y !== null)
  const queued = queue.includes(question.id)

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-1 font-semibold text-ink">Similar past questions</h3>
        <p className="mb-2 text-2xs text-ink-3">
          {similar.length
            ? `This idea has been asked ${similar.length + 1} times${years.length ? ` since ${Math.min(...years, question.year ?? 9999)}` : ''}.`
            : 'No close matches in your other papers yet.'}
        </p>
        <ul className="flex flex-col gap-1.5">
          {similar.map(({ question: q, shared, sharedTerms }) => (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onOpen(q)}
                className="w-full rounded-lg px-3 py-2 text-left ring-1 ring-line ring-inset hover:bg-hover"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-ink">{questionRef(paperOf(q), q)}</span>
                  {q.marks !== null ? (
                    <span className="text-2xs text-ink-3 tabular-nums">{q.marks} marks</span>
                  ) : null}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-2xs text-ink-2">{q.stemMd}</span>
                {shared.length || sharedTerms.length ? (
                  <span className="mt-1 block text-2xs text-ink-3">
                    Shares: {[...sharedTerms, ...shared].slice(0, 5).join(', ')}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <Button
          className="mt-2"
          variant="ghost"
          size="sm"
          icon={<Search className="size-4" />}
          onClick={() =>
            void navigate(`/exam?find=${encodeURIComponent(question.stemMd.slice(0, 80))}`)
          }
        >
          Open in search
        </Button>
      </section>

      <section className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          icon={queued ? <ListX className="size-4" /> : <ListPlus className="size-4" />}
          onClick={() =>
            setQueue(queued ? queue.filter((id) => id !== question.id) : [...queue, question.id])
          }
        >
          {queued ? 'Remove from practice set' : 'Add to practice set'}
        </Button>
        <Button
          variant="secondary"
          aria-pressed={question.bookmarked}
          icon={
            question.bookmarked ? (
              <BookmarkCheck className="size-4 text-blue" />
            ) : (
              <Bookmark className="size-4" />
            )
          }
          onClick={() =>
            void db
              .update('questions', question.id, { bookmarked: !question.bookmarked })
              .then(() => changed('questions'))
          }
        >
          {question.bookmarked ? 'Marked to revisit' : 'Mark to revisit'}
        </Button>
      </section>

      <section>
        <h3 className="mb-1.5 font-semibold text-ink">Your notes</h3>
        <Textarea
          aria-label="Your notes on this question"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== notes && setNotes(draft)}
          placeholder="What to remember next time"
          className="min-h-24"
        />
        <p className="mt-1 text-2xs text-ink-3">Saved when you click away. From {paper.title}.</p>
      </section>
    </div>
  )
}

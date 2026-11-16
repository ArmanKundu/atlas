import { useEffect, useMemo, useState } from 'react'
import { Plus, Sparkles, Trash2 } from 'lucide-react'
import type { Flashcard } from '@shared/models'
import { intervalLabel, reviewCard, type Grade } from '@shared/sm2'
import { Button, IconButton } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Field, Input, Textarea } from '@/design/Form'
import { Kbd } from '@/design/Kbd'
import { Markdown } from '@/design/Markdown'
import { Segmented } from '@/design/Segmented'
import { EmptyState } from '@/design/States'
import { db, useAction, useLive } from '@/lib/api'
import { call } from '@/lib/ipc'
import { useNow } from '@/lib/now'
import { Buddy } from '@/mascot/Buddy'

const GRADES: { grade: Grade; label: string }[] = [
  { grade: 1, label: 'Again' },
  { grade: 2, label: 'Hard' },
  { grade: 3, label: 'Good' },
  { grade: 4, label: 'Easy' },
]

function Review({ cards, onDone }: { cards: Flashcard[]; onDone: () => void }) {
  const [queue, setQueue] = useState(cards)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const card = queue[0]

  const grade = async (value: Grade): Promise<void> => {
    if (!card) return
    const next = reviewCard(card, value, Date.now())
    await db.update('flashcards', card.id, next)
    setDone((n) => n + 1)
    setRevealed(false)
    // "Again" comes back at the end of this session.
    setQueue((current) =>
      value === 1 ? [...current.slice(1), { ...card, ...next }] : current.slice(1),
    )
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
        return
      if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
        event.preventDefault()
        setRevealed(true)
      } else if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
        void grade(Number(event.key) as Grade)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!card) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <Buddy size={96} mood="celebrating" />
        <h2 className="mt-5 text-[1.375rem] leading-8 font-semibold tracking-[-0.02em]">
          All caught up
        </h2>
        <p className="mt-1 text-ink-2">
          You reviewed {done} card{done === 1 ? '' : 's'}. The next ones come back when they are
          due.
        </p>
        <Button className="mt-5" onClick={onDone}>
          Back to cards
        </Button>
      </div>
    )
  }
  return (
    <div className="mx-auto flex w-full max-w-[680px] flex-col gap-4">
      <p className="text-center text-2xs text-ink-3 tabular-nums">{queue.length} left</p>
      <div className="min-h-[220px] rounded-xl bg-surface p-7 shadow-pop">
        <Markdown>{card.frontMd}</Markdown>
        {revealed ? (
          <>
            <hr className="my-5 border-line" />
            <Markdown>{card.backMd}</Markdown>
          </>
        ) : null}
      </div>
      {revealed ? (
        <div className="grid grid-cols-4 gap-2">
          {GRADES.map(({ grade: value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => void grade(value)}
              className="flex flex-col items-center rounded-lg py-2 ring-1 ring-line-strong ring-inset hover:bg-sunken"
            >
              <span className="font-medium text-ink">{label}</span>
              <span className="text-2xs text-ink-3">
                {intervalLabel(card, value)} · <Kbd>{String(value)}</Kbd>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <Button
          variant="primary"
          className="h-10 self-center px-6"
          onClick={() => setRevealed(true)}
        >
          Show answer <Kbd tone="inverse">space</Kbd>
        </Button>
      )}
    </div>
  )
}

/** Flashcards with SM-2 spaced repetition, keyboard review, and AI generation from a topic. */
export function FlashcardsView({ subjectId }: { subjectId?: string }) {
  // Cards due within the next minute count as due, so a card made just now is reviewable at once.
  const now = useNow()
  const [view, setView] = useState<'review' | 'all'>('review')
  const [adding, setAdding] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [topic, setTopic] = useState('')
  const [session, setSession] = useState<Flashcard[] | null>(null)
  const cards = useLive(
    ['flashcards'],
    () => db.list('flashcards', { where: subjectId ? { subjectId } : undefined }),
    [subjectId],
  )
  const due = useMemo(
    () => (cards.data ?? []).filter((c) => c.due <= now + 60_000).sort((a, b) => a.due - b.due),
    [cards.data, now],
  )

  const add = useAction(async () => {
    await db.create('flashcards', {
      subjectId: subjectId ?? null,
      frontMd: front.trim(),
      backMd: back.trim(),
      due: Date.now(),
    })
    setFront('')
    setBack('')
  })
  const generate = useAction(async () => {
    const result = await call('ai:complete', {
      task: 'flashcards',
      prompt: `Write flashcards on: ${topic}`,
      subjectId: subjectId ?? null,
    })
    const parsed = JSON.parse(
      result.text.slice(result.text.indexOf('['), result.text.lastIndexOf(']') + 1),
    ) as { front: string; back: string }[]
    for (const card of parsed)
      await db.create('flashcards', {
        subjectId: subjectId ?? null,
        frontMd: card.front,
        backMd: card.back,
        origin: 'ai',
        due: Date.now(),
      })
    setGenerating(false)
    setTopic('')
  })

  if (session)
    return (
      <div className="py-6">
        <Review cards={session} onDone={() => setSession(null)} />
      </div>
    )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Segmented
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'review', label: `Due (${due.length})` },
            { value: 'all', label: `All cards (${cards.data?.length ?? 0})` },
          ]}
        />
        <div className="flex gap-2">
          <Button
            icon={<Sparkles className="size-3.5" aria-hidden />}
            onClick={() => setGenerating(true)}
          >
            Make with AI
          </Button>
          <Button
            variant="primary"
            icon={<Plus className="size-3.5" aria-hidden />}
            onClick={() => setAdding(true)}
          >
            New card
          </Button>
        </div>
      </div>

      {view === 'review' ? (
        due.length > 0 ? (
          <EmptyState
            eyebrow="Review"
            title={`${due.length} card${due.length === 1 ? '' : 's'} due`}
            action={
              <Button variant="primary" onClick={() => setSession(due)}>
                Start review
              </Button>
            }
          >
            Answer from memory first, then rate how it went. Use space to reveal and 1 to 4 to rate.
          </EmptyState>
        ) : (
          <EmptyState
            eyebrow="Review"
            title={(cards.data?.length ?? 0) > 0 ? 'Nothing due right now' : 'No flashcards yet'}
            action={
              <Button variant="primary" onClick={() => setAdding(true)}>
                New card
              </Button>
            }
          >
            {(cards.data?.length ?? 0) > 0
              ? 'Cards come back on a schedule that stretches as you get them right.'
              : 'Add cards by hand, or make them with AI from a topic, a note or a chat answer.'}
          </EmptyState>
        )
      ) : (
        <ul className="overflow-hidden rounded-lg ring-1 ring-line ring-inset">
          {(cards.data ?? []).length === 0 ? (
            <li className="px-4 py-6 text-center text-ink-3">No cards yet.</li>
          ) : null}
          {cards.data?.map((card) => (
            <li
              key={card.id}
              className="flex items-start gap-4 border-b border-line px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <Markdown>{card.frontMd}</Markdown>
              </div>
              <div className="min-w-0 flex-1 text-ink-2">
                <Markdown>{card.backMd}</Markdown>
              </div>
              <span className="w-24 shrink-0 text-right text-2xs text-ink-3">
                {card.due <= now + 60_000
                  ? 'Due now'
                  : `Due ${new Date(card.due).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
              </span>
              <IconButton
                label="Delete card"
                size="sm"
                onClick={() => void db.remove('flashcards', card.id)}
              >
                <Trash2 className="size-3.5" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title="New flashcard"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Done
            </Button>
            <Button
              variant="primary"
              disabled={!front.trim() || !back.trim() || add.pending}
              onClick={() => void add.run()}
            >
              Add card
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Front" hint="A question that makes you recall. Markdown and $maths$ work.">
            <Textarea autoFocus value={front} onChange={(e) => setFront(e.target.value)} />
          </Field>
          <Field label="Back" error={add.error}>
            <Textarea value={back} onChange={(e) => setBack(e.target.value)} />
          </Field>
        </div>
      </Dialog>
      <Dialog
        open={generating}
        onOpenChange={setGenerating}
        title="Make flashcards with AI"
        description="Uses your connected AI. Check the cards before relying on them."
        footer={
          <>
            <Button variant="ghost" onClick={() => setGenerating(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!topic.trim() || generate.pending}
              onClick={() => void generate.run()}
            >
              {generate.pending ? 'Writing cards…' : 'Make cards'}
            </Button>
          </>
        }
      >
        <Field label="Topic" error={generate.error}>
          <Input
            autoFocus
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Enzyme inhibition, 12 cards"
          />
        </Field>
      </Dialog>
    </div>
  )
}

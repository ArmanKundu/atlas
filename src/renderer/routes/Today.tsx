import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  ArrowRight,
  ArrowUp,
  CalendarDays,
  FolderUp,
  Layers,
  MessageCircle,
  NotebookPen,
  Play,
  Timer,
} from 'lucide-react'
import { Button } from '@/design/Button'
import { SubjectDot } from '@/design/Form'
import { Card, Page } from '@/design/Page'
import { formatClock, formatDuration, useTimer } from '@/features/timer/TimerProvider'
import { db, useAction, useLive } from '@/lib/api'
import { useAppState, useSubjects } from '@/lib/app-state'
import { cn } from '@/lib/cn'
import { greetingFor } from '@/lib/greeting'
import { call } from '@/lib/ipc'
import { useNow } from '@/lib/now'
import { Mascot } from '@/mascot/Mascot'
import type { MascotAccessory, MascotColour } from '@/mascot/options'

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const DAY = 86_400_000

/** Helpers offered as one-tap choices under the question box. */
const QUICK_HELPERS = ['tutor', 'solver', 'marker', 'notes', 'quiz', 'calendar'] as const

function Ring({ value, size = 64 }: { value: number; size?: number }) {
  const clamped = Math.max(0, Math.min(1, value))
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90" aria-hidden>
      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--atlas-line)" strokeWidth="10" />
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        stroke="var(--atlas-accent)"
        strokeWidth="10"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={`${clamped} 1`}
      />
    </svg>
  )
}

function Stat({
  to,
  icon,
  label,
  value,
  hint,
}: {
  to: string
  icon: React.ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col rounded-lg border border-line bg-surface p-4 hover:border-line-strong"
    >
      <span className="flex items-center justify-between text-ink-3">
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        <ArrowRight
          className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </span>
      <span className="mt-2 text-[1.5rem] leading-8 font-semibold tracking-[-0.02em] tabular-nums">
        {value}
      </span>
      <span className="text-ink-3">{hint}</span>
    </Link>
  )
}

/**
 * Today: ask the assistant straight away, then see how today is going, what is coming up and
 * the quickest ways back into study.
 */
export function Today() {
  const { meta } = useAppState()
  const navigate = useNavigate()
  const subjects = useSubjects()
  const timer = useTimer()
  const now = useNow()
  const today = new Date(now)
  const [draft, setDraft] = useState('')
  const [helper, setHelper] = useState<string>('tutor')

  const stats = useLive(['stats', 'studySessions', 'flashcards', 'notes', 'sources', 'chats'], () =>
    call('stats:summary'),
  )
  const events = useLive(['calendarEvents'], () =>
    db.list('calendarEvents', { orderBy: 'startsAt' }),
  )
  const chats = useLive(['chats'], () =>
    db.list('chats', { orderBy: 'updatedAt', desc: true, limit: 3 }),
  )
  const notes = useLive(['notes'], () =>
    db.list('notes', { orderBy: 'updatedAt', desc: true, limit: 3 }),
  )
  const agents = useLive([], () => call('ai:agents'))
  const config = useLive(['ai'], () => call('ai:config'))
  const aiReady = Boolean(config.data?.defaultProvider)

  const ask = useAction(async () => {
    const content = draft.trim()
    if (!content) return
    const chat = await db.create('chats', { agent: helper })
    await call('ai:send', { chatId: chat.id, content })
    void navigate(`/assistant?chat=${chat.id}`)
  })

  const goalSeconds = (meta?.studyGoals.dailyMinutes ?? 120) * 60
  const todaySeconds = (stats.data?.todaySeconds ?? 0) + (timer.active ? timer.elapsed : 0)
  const upcoming = (events.data ?? [])
    .filter((e) => e.endsAt >= now && e.startsAt < now + 7 * DAY)
    .slice(0, 6)
  const nextExam = subjects
    .flatMap((subject) =>
      subject.examDates
        .filter((exam) => exam.date >= now - DAY)
        .map((exam) => ({ subject, ...exam })),
    )
    .sort((a, b) => a.date - b.date)[0]
  const counts = stats.data?.counts
  const quick = QUICK_HELPERS.flatMap((id) => agents.data?.find((a) => a.id === id) ?? [])
  const placeholder =
    agents.data?.find((a) => a.id === helper)?.placeholder ?? 'Ask anything you are studying'

  return (
    <Page>
      <section className="mx-auto flex w-full max-w-[720px] flex-col items-center pt-4 pb-8 text-center">
        <Mascot
          size={60}
          colour={(meta?.avatarColour ?? 'ink') as MascotColour}
          accessory={(meta?.avatarAccessory ?? 'none') as MascotAccessory}
          mood={
            ask.pending || timer.running
              ? 'thinking'
              : goalSeconds > 0 && todaySeconds >= goalSeconds
                ? 'celebrating'
                : 'idle'
          }
        />
        <p className="mt-4 text-ink-3">{DATE_FORMAT.format(today)}</p>
        <h1 className="mt-1 text-[1.75rem] leading-9 font-semibold tracking-[-0.025em] text-ink">
          {greetingFor(today.getHours())}
          {meta ? `, ${meta.name}` : ''}
        </h1>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (aiReady) void ask.run()
          }}
          className="mt-6 w-full rounded-xl bg-surface p-2.5 text-left shadow-pop"
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (aiReady) void ask.run()
              }
            }}
            rows={Math.min(6, Math.max(2, draft.split('\n').length))}
            placeholder={placeholder}
            aria-label="Ask the assistant"
            className="block w-full resize-none bg-transparent px-2 py-1.5 text-[0.9375rem] leading-6 text-ink outline-none placeholder:text-ink-3"
          />
          <div className="flex items-center gap-1.5 pt-1.5">
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5" role="group" aria-label="Helper">
              {quick.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === helper}
                  onClick={() => setHelper(item.id)}
                  className={cn(
                    'h-7 rounded-md px-2 text-2xs font-medium ring-1 ring-inset select-none',
                    item.id === helper
                      ? 'bg-blue-soft text-blue ring-blue-line'
                      : 'text-ink-2 ring-line hover:bg-hover hover:text-ink',
                  )}
                >
                  {item.name}
                </button>
              ))}
              <Link
                to="/assistant"
                className="flex h-7 items-center rounded-md px-2 text-2xs font-medium text-ink-3 hover:bg-hover hover:text-ink"
              >
                All helpers
              </Link>
            </div>
            <button
              type="submit"
              aria-label="Ask"
              disabled={!aiReady || !draft.trim() || ask.pending}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-35"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          </div>
        </form>
        {ask.error ? (
          <p role="alert" className="mt-2 text-danger">
            {ask.error}
          </p>
        ) : null}
        {config.data && !aiReady ? (
          <p className="mt-3 text-ink-3">
            Asking needs an AI connection.{' '}
            <Link
              to="/settings?tab=ai"
              className="font-medium text-blue underline-offset-2 hover:underline"
            >
              Connect your AI
            </Link>
            . Everything else works without it.
          </p>
        ) : null}
      </section>

      {subjects.length === 0 ? (
        <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-line bg-paper px-4 py-3">
          <div>
            <p className="font-medium text-ink">Add your first subject</p>
            <p className="text-ink-2">
              Each subject gets its own workspace for resources, notes, flashcards and a tutor.
            </p>
          </div>
          <Button variant="primary" onClick={() => void navigate('/settings?tab=subjects')}>
            Add a subject
          </Button>
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-4 min-[1180px]:grid-cols-4">
        <Card className="col-span-2 flex items-center gap-4 p-4">
          <div className="relative shrink-0">
            <Ring value={goalSeconds ? todaySeconds / goalSeconds : 0} />
            <span className="absolute inset-0 flex items-center justify-center text-2xs font-semibold tabular-nums">
              {goalSeconds
                ? `${Math.min(999, Math.round((todaySeconds / goalSeconds) * 100))}%`
                : ''}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-ink-3">Studied today</p>
            <p className="text-[1.5rem] leading-8 font-semibold tracking-[-0.02em] tabular-nums">
              {formatDuration(todaySeconds)}
            </p>
            <p className="truncate text-ink-3">
              Goal {formatDuration(goalSeconds)} · {stats.data?.streakDays ?? 0} day streak
            </p>
          </div>
          {timer.active ? (
            <Button
              variant="primary"
              onClick={() => void navigate('/timer')}
              icon={<Timer className="size-3.5" aria-hidden />}
            >
              {formatClock(
                timer.mode === 'focus' ? Math.max(0, timer.target - timer.elapsed) : timer.elapsed,
              )}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => {
                timer.start()
                void navigate('/timer')
              }}
              icon={<Play className="size-3.5" aria-hidden />}
            >
              Start focus
            </Button>
          )}
        </Card>

        <Card className="flex flex-col p-4">
          <p className="text-ink-3">Next exam</p>
          {nextExam ? (
            <>
              <p className="mt-2 text-[1.5rem] leading-8 font-semibold tracking-[-0.02em] tabular-nums">
                {Math.max(0, Math.ceil((nextExam.date - now) / DAY))} days
              </p>
              <p className="flex items-center gap-1.5 truncate text-ink-3">
                <SubjectDot colour={nextExam.subject.colour} />
                <span className="truncate">
                  {nextExam.subject.name} · {nextExam.label}
                </span>
              </p>
            </>
          ) : (
            <p className="mt-2 text-ink-2">
              Add exam dates on a subject’s Overview to see the days left.
            </p>
          )}
        </Card>

        <Stat
          to="/flashcards"
          icon={<Layers className="size-3.5" aria-hidden />}
          label="Flashcards"
          value={String(stats.data?.dueCards ?? 0)}
          hint="due for review"
        />
      </div>

      <div className="mb-4 grid grid-cols-3 gap-4">
        <Stat
          to="/library"
          icon={<FolderUp className="size-3.5" aria-hidden />}
          label="Library"
          value={String(counts?.sources ?? 0)}
          hint={`${counts?.pages ?? 0} pages searchable`}
        />
        <Stat
          to="/notes"
          icon={<NotebookPen className="size-3.5" aria-hidden />}
          label="Notes"
          value={String(counts?.notes ?? 0)}
          hint="written so far"
        />
        <Stat
          to="/assistant"
          icon={<MessageCircle className="size-3.5" aria-hidden />}
          label="Assistant"
          value={String(counts?.chats ?? 0)}
          hint="saved chats"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="font-semibold">Next 7 days</p>
            <Link to="/planner" className="flex items-center gap-1 text-ink-3 hover:text-ink">
              <CalendarDays className="size-3.5" aria-hidden /> Planner
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="px-4 py-4 text-ink-3">
              Nothing scheduled. Add events in the Planner, or connect your school calendar in
              Settings.
            </p>
          ) : null}
          {upcoming.map((event) => {
            const subject = subjects.find((s) => s.id === event.subjectId)
            return (
              <div
                key={event.id}
                className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-b-0"
              >
                <SubjectDot colour={subject?.colour ?? ''} />
                <span className="min-w-0 flex-1 truncate">{event.title}</span>
                <span className="text-ink-3">
                  {new Date(event.startsAt).toLocaleString(undefined, {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            )
          })}
        </Card>

        <Card>
          <p className="border-b border-line px-4 py-2.5 font-semibold">Continue</p>
          {(chats.data ?? []).length + (notes.data ?? []).length === 0 ? (
            <p className="px-4 py-4 text-ink-3">Your recent chats and notes show up here.</p>
          ) : null}
          {chats.data?.map((chat) => (
            <Link
              key={chat.id}
              to={`/assistant?chat=${chat.id}`}
              className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-b-0 hover:bg-sunken"
            >
              <MessageCircle className="size-3.5 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{chat.title}</span>
            </Link>
          ))}
          {notes.data?.map((note) => (
            <Link
              key={note.id}
              to="/notes"
              className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-b-0 hover:bg-sunken"
            >
              <NotebookPen className="size-3.5 shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{note.title}</span>
            </Link>
          ))}
        </Card>
      </div>
    </Page>
  )
}

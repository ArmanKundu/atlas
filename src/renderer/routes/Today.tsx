import { Link, useNavigate } from 'react-router'
import {
  ArrowRight,
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
import { Card, Page, PageHeader } from '@/design/Page'
import { EmptyState } from '@/design/States'
import { formatClock, formatDuration, useTimer } from '@/features/timer/TimerProvider'
import { db, useLive } from '@/lib/api'
import { useAppState, useSubjects } from '@/lib/app-state'
import { greetingFor } from '@/lib/greeting'
import { call } from '@/lib/ipc'
import { Mascot } from '@/mascot/Mascot'
import type { MascotAccessory, MascotColour } from '@/mascot/options'

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const DAY = 86_400_000

function Ring({ value, size = 88 }: { value: number; size?: number }) {
  const clamped = Math.max(0, Math.min(1, value))
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90" aria-hidden>
      <circle cx="50" cy="50" r="42" fill="none" stroke="var(--atlas-line)" strokeWidth="9" />
      <circle
        cx="50"
        cy="50"
        r="42"
        fill="none"
        stroke="var(--atlas-accent)"
        strokeWidth="9"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={`${clamped} 1`}
      />
    </svg>
  )
}

function Tile({
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
      className="group rounded-lg bg-surface p-4 ring-1 ring-line ring-inset hover:bg-sunken"
    >
      <div className="flex items-center justify-between text-ink-3">
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
        <ArrowRight
          className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>
      <p className="mt-2 text-[1.5rem] leading-7 font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-ink-3">{hint}</p>
    </Link>
  )
}

/** Today: what is coming up, how today is going, and the quickest ways back into study. */
export function Today() {
  const { meta } = useAppState()
  const navigate = useNavigate()
  const subjects = useSubjects()
  const timer = useTimer()
  const now = new Date()
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

  const goalSeconds = (meta?.studyGoals.dailyMinutes ?? 120) * 60
  const todaySeconds = (stats.data?.todaySeconds ?? 0) + (timer.active ? timer.elapsed : 0)
  const upcoming = (events.data ?? [])
    .filter((e) => e.endsAt >= now.getTime() && e.startsAt < now.getTime() + 7 * DAY)
    .slice(0, 6)
  const countdowns = subjects
    .flatMap((subject) =>
      subject.examDates
        .filter((exam) => exam.date >= now.getTime())
        .map((exam) => ({ subject, ...exam })),
    )
    .sort((a, b) => a.date - b.date)
    .slice(0, 4)
  const counts = stats.data?.counts

  return (
    <Page>
      <PageHeader
        eyebrow={DATE_FORMAT.format(now)}
        title={`${greetingFor(now.getHours())}${meta ? `, ${meta.name}` : ''}`}
        actions={
          <Mascot
            size={52}
            colour={(meta?.avatarColour ?? 'ink') as MascotColour}
            accessory={(meta?.avatarAccessory ?? 'none') as MascotAccessory}
            mood={
              timer.running
                ? 'thinking'
                : todaySeconds >= goalSeconds && goalSeconds > 0
                  ? 'celebrating'
                  : 'idle'
            }
          />
        }
      />

      {subjects.length === 0 ? (
        <EmptyState
          eyebrow="Start here"
          title="Add your first subject"
          action={
            <Button variant="primary" onClick={() => void navigate('/settings?tab=subjects')}>
              Add a subject
            </Button>
          }
          className="mb-6"
        >
          Each subject gets its own workspace for resources, notes, flashcards and questions.
        </EmptyState>
      ) : null}

      <div className="mb-6 grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
        <Card className="flex items-center gap-5 p-5">
          <div className="relative shrink-0">
            <Ring value={goalSeconds ? todaySeconds / goalSeconds : 0} />
            <span className="absolute inset-0 flex items-center justify-center text-ui font-semibold tabular-nums">
              {goalSeconds
                ? `${Math.min(999, Math.round((todaySeconds / goalSeconds) * 100))}%`
                : ''}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-ink-3">Studied today</p>
            <p className="text-[1.5rem] leading-8 font-semibold tabular-nums">
              {formatDuration(todaySeconds)}
            </p>
            <p className="text-ink-3">
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

        <Card className="p-5">
          <p className="mb-2 font-semibold">Exam countdown</p>
          {countdowns.length === 0 ? (
            <p className="text-ink-3">
              Add exam dates on a subject’s Overview to see the days left here.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {countdowns.map((exam) => (
                <li key={`${exam.subject.id}-${exam.date}`} className="flex items-center gap-2">
                  <SubjectDot colour={exam.subject.colour} />
                  <span className="min-w-0 flex-1 truncate">
                    {exam.subject.name} <span className="text-ink-3">{exam.label}</span>
                  </span>
                  <span className="font-semibold tabular-nums">
                    {Math.ceil((exam.date - now.getTime()) / DAY)} days
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <Tile
          to="/flashcards"
          icon={<Layers className="size-3.5" aria-hidden />}
          label="Flashcards"
          value={String(stats.data?.dueCards ?? 0)}
          hint="due for review"
        />
        <Tile
          to="/library"
          icon={<FolderUp className="size-3.5" aria-hidden />}
          label="Library"
          value={String(counts?.sources ?? 0)}
          hint={`${counts?.pages ?? 0} pages searchable`}
        />
        <Tile
          to="/notes"
          icon={<NotebookPen className="size-3.5" aria-hidden />}
          label="Notes"
          value={String(counts?.notes ?? 0)}
          hint="written so far"
        />
        <Tile
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
              Nothing scheduled. Add assessments and study blocks in the Planner.
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
              to="/assistant"
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

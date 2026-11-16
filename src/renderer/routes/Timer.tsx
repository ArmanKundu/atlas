import { useMemo } from 'react'
import { Pause, Play, Square, Trash2 } from 'lucide-react'
import { IconButton, Button } from '@/design/Button'
import { Select, SubjectDot } from '@/design/Form'
import { Card, Page, PageHeader, Section } from '@/design/Page'
import { Segmented } from '@/design/Segmented'
import { formatClock, formatDuration, useTimer } from '@/features/timer/TimerProvider'
import { db, useLive } from '@/lib/api'
import { useSubjects } from '@/lib/app-state'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { Mascot } from '@/mascot/Mascot'

function dayKey(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/** A year of study time as a grid of days, darkest where the most time was spent. */
function Heatmap({ days }: { days: Record<string, number> }) {
  const weeks = useMemo(() => {
    const end = new Date()
    end.setHours(12, 0, 0, 0)
    const start = new Date(end)
    start.setDate(start.getDate() - 52 * 7 - ((end.getDay() + 6) % 7))
    const out: { key: string; seconds: number; future: boolean }[][] = []
    const cursor = new Date(start)
    while (cursor <= end || out.at(-1)?.length !== 7) {
      if (!out.at(-1) || out.at(-1)?.length === 7) out.push([])
      const key = dayKey(cursor)
      out.at(-1)?.push({ key, seconds: days[key] ?? 0, future: cursor > end })
      cursor.setDate(cursor.getDate() + 1)
    }
    return out
  }, [days])
  const level = (seconds: number): number =>
    seconds === 0 ? 0 : seconds < 1800 ? 1 : seconds < 3600 ? 2 : seconds < 7200 ? 3 : 4
  const shades = ['bg-hover', 'bg-ink-3/35', 'bg-ink-3/60', 'bg-ink-2', 'bg-ink']
  return (
    <div
      className="flex gap-[3px] overflow-x-auto pb-1"
      role="img"
      aria-label="Study time per day over the last year"
    >
      {weeks.map((week, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {week.map((day) => (
            <span
              key={day.key}
              title={
                day.future
                  ? ''
                  : `${day.key}: ${day.seconds ? formatDuration(day.seconds) : 'no study'}`
              }
              className={cn(
                'size-[11px] rounded-[3px]',
                day.future ? 'opacity-0' : shades[level(day.seconds)],
              )}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Focus timer and stopwatch, tagged by subject, with the stats they feed. */
export function TimerRoute() {
  const timer = useTimer()
  const subjects = useSubjects()
  const stats = useLive(['stats', 'studySessions'], () => call('stats:summary'))
  const sessions = useLive(['studySessions'], () =>
    db.list('studySessions', { orderBy: 'startedAt', desc: true, limit: 12 }),
  )

  const remaining =
    timer.mode === 'focus' ? Math.max(0, timer.target - timer.elapsed) : timer.elapsed
  const over = timer.mode === 'focus' && timer.elapsed >= timer.target
  const progress = timer.mode === 'focus' ? Math.min(1, timer.elapsed / timer.target) : 0
  const weekMax = Math.max(1, ...Object.values(stats.data?.weekBySubject ?? {}))

  return (
    <Page>
      <PageHeader
        title="Timer"
        description="Focus sessions and a stopwatch. Every finished session adds to your stats."
      />
      <div className="mb-8 grid grid-cols-[minmax(0,1fr)_300px] gap-6">
        <Card className="flex flex-col items-center px-6 py-9">
          <Segmented
            label="Timer mode"
            value={timer.mode}
            onChange={timer.setMode}
            options={[
              { value: 'focus', label: 'Focus' },
              { value: 'stopwatch', label: 'Stopwatch' },
            ]}
          />
          <div className="relative mt-7 flex size-56 items-center justify-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="var(--atlas-line)"
                strokeWidth="3"
              />
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="var(--atlas-accent)"
                strokeWidth="3"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={`${progress} 1`}
                className="transition-[stroke-dasharray] duration-500"
              />
            </svg>
            <div className="text-center">
              <p
                role="timer"
                aria-live="off"
                className="text-[3rem] leading-none font-semibold tracking-[-0.03em] tabular-nums"
              >
                {over ? `+${formatClock(timer.elapsed - timer.target)}` : formatClock(remaining)}
              </p>
              <p className="mt-2 text-ink-3">
                {timer.mode === 'focus'
                  ? over
                    ? 'Past your focus length'
                    : `of ${Math.round(timer.target / 60)} minutes`
                  : 'elapsed'}
              </p>
            </div>
          </div>
          <div className="mt-7 flex items-center gap-2">
            <Select
              aria-label="Subject"
              className="w-[200px]"
              value={timer.subjectId ?? ''}
              onChange={(e) => timer.setSubject(e.target.value || null)}
            >
              <option value="">No subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            {timer.running ? (
              <Button
                variant="primary"
                className="h-9 px-5"
                icon={<Pause className="size-3.5" aria-hidden />}
                onClick={timer.pause}
              >
                Pause
              </Button>
            ) : (
              <Button
                variant="primary"
                className="h-9 px-5"
                icon={<Play className="size-3.5" aria-hidden />}
                onClick={timer.start}
              >
                {timer.active ? 'Resume' : 'Start'}
              </Button>
            )}
            {timer.active ? (
              <Button
                className="h-9"
                icon={<Square className="size-3.5" aria-hidden />}
                onClick={() => void timer.stop()}
              >
                Finish
              </Button>
            ) : null}
          </div>
        </Card>
        <Card className="flex flex-col items-center justify-center gap-4 p-6 text-center">
          <Mascot size={96} mood={timer.running ? 'thinking' : over ? 'celebrating' : 'idle'} />
          <dl className="grid w-full grid-cols-3 gap-2">
            {[
              ['Today', formatDuration(stats.data?.todaySeconds ?? 0)],
              ['This week', formatDuration(stats.data?.weekSeconds ?? 0)],
              ['Streak', `${stats.data?.streakDays ?? 0} d`],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-2xs text-ink-3">{label}</dt>
                <dd className="font-semibold text-ink tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Section title="This week by subject">
        <Card className="flex flex-col gap-3 p-5">
          {Object.keys(stats.data?.weekBySubject ?? {}).length === 0 ? (
            <p className="text-ink-3">
              No sessions this week yet. Start the timer to fill this in.
            </p>
          ) : null}
          {Object.entries(stats.data?.weekBySubject ?? {}).map(([id, seconds]) => {
            const subject = subjects.find((s) => s.id === id)
            return (
              <div key={id} className="flex items-center gap-3">
                <span className="flex w-44 shrink-0 items-center gap-2 truncate">
                  <SubjectDot colour={subject?.colour ?? ''} />
                  {subject?.name ?? 'No subject'}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-hover">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(seconds / weekMax) * 100}%`,
                      background: subject
                        ? `var(--atlas-subject-${subject.colour})`
                        : 'var(--atlas-ink-3)',
                    }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right text-ink-2 tabular-nums">
                  {formatDuration(seconds)}
                </span>
              </div>
            )
          })}
        </Card>
      </Section>

      <Section title="The last year">
        <Card className="p-5">
          <Heatmap days={stats.data?.days ?? {}} />
        </Card>
      </Section>

      <Section title="Recent sessions">
        <Card>
          {(sessions.data ?? []).length === 0 ? (
            <p className="px-4 py-5 text-ink-3">Finished sessions are listed here.</p>
          ) : null}
          {sessions.data?.map((session) => {
            const subject = subjects.find((s) => s.id === session.subjectId)
            return (
              <div
                key={session.id}
                className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0"
              >
                <SubjectDot colour={subject?.colour ?? ''} />
                <span className="min-w-0 flex-1 truncate">{subject?.name ?? 'No subject'}</span>
                <span className="text-ink-3">
                  {new Date(session.startedAt).toLocaleString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                <span className="w-20 text-right font-medium tabular-nums">
                  {formatDuration(session.seconds)}
                </span>
                <IconButton
                  label="Delete session"
                  size="sm"
                  onClick={() => void db.remove('studySessions', session.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </IconButton>
              </div>
            )
          })}
        </Card>
      </Section>
    </Page>
  )
}

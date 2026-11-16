import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { EVENT_KINDS, type CalendarEvent, type Todo } from '@shared/models'
import { Button, IconButton } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Field, Input, Select, Textarea } from '@/design/Form'
import { db, useAction, useLive } from '@/lib/api'
import { useSubjects } from '@/lib/app-state'
import { cn } from '@/lib/cn'

const HOUR_START = 7
const HOUR_END = 22
const HOUR_PX = 52
const DAY = 86_400_000
const GROUPS = ['This week', 'This month', 'Unscheduled', 'Personal']
const KIND_LABELS: Record<(typeof EVENT_KINDS)[number], string> = {
  lesson: 'Lesson',
  sac: 'Assessment',
  exam: 'Exam',
  due: 'Due',
  event: 'Event',
  study_block: 'Study block',
}

function startOfWeek(time: number): Date {
  const d = new Date(time)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}
const toLocalInput = (time: number): string => {
  const d = new Date(time)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const timeLabel = (time: number): string =>
  new Date(time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

interface Draft {
  id?: string
  title: string
  kind: (typeof EVENT_KINDS)[number]
  subjectId: string
  start: string
  end: string
  notes: string
}

/** Week planner (reference 4): a to-do column and a week grid that events and study blocks sit on. */
export function Planner() {
  const subjects = useSubjects()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [newTodo, setNewTodo] = useState<Record<string, string>>({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const from = weekStart.getTime()
  const events = useLive(['calendarEvents'], () =>
    db.list('calendarEvents', { orderBy: 'startsAt' }),
  )
  const todos = useLive(['todos'], () => db.list('todos', { orderBy: 'createdAt' }))

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(from + i * DAY)), [from])
  const weekEvents = (events.data ?? []).filter(
    (e) => e.endsAt > from && e.startsAt < from + 7 * DAY,
  )
  const today = new Date()

  const save = useAction(async () => {
    if (!draft) return
    const values = {
      title: draft.title.trim(),
      kind: draft.kind,
      subjectId: draft.subjectId || null,
      startsAt: new Date(draft.start).getTime(),
      endsAt: new Date(draft.end).getTime(),
      notes: draft.notes || null,
      source: draft.kind === 'study_block' ? ('planner' as const) : ('manual' as const),
    }
    if (!(values.endsAt > values.startsAt)) throw new Error('end')
    if (draft.id) await db.update('calendarEvents', draft.id, values)
    else await db.create('calendarEvents', values)
    setDraft(null)
  })

  const openNew = (start: number, minutes = 60, title = '', kind: Draft['kind'] = 'event'): void =>
    setDraft({
      title,
      kind,
      subjectId: '',
      start: toLocalInput(start),
      end: toLocalInput(start + minutes * 60_000),
      notes: '',
    })
  const openEdit = (event: CalendarEvent): void =>
    setDraft({
      id: event.id,
      title: event.title,
      kind: event.kind,
      subjectId: event.subjectId ?? '',
      start: toLocalInput(event.startsAt),
      end: toLocalInput(event.endsAt),
      notes: event.notes ?? '',
    })

  const slotTime = (day: Date, clientY: number, top: number): number => {
    const minutes = Math.round((((clientY - top) / HOUR_PX) * 60) / 15) * 15
    const d = new Date(day)
    d.setHours(HOUR_START, 0, 0, 0)
    return d.getTime() + Math.max(0, minutes) * 60_000
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-end justify-between gap-4 px-8 pt-7 pb-5">
        <div>
          <p className="mb-1 text-ink-3">Planner</p>
          <h1 className="text-[1.625rem] leading-8 font-semibold tracking-[-0.02em]">
            {weekStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          <Button onClick={() => setWeekStart(startOfWeek(Date.now()))}>Today</Button>
          <IconButton label="Previous week" onClick={() => setWeekStart(new Date(from - 7 * DAY))}>
            <ChevronLeft className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Next week" onClick={() => setWeekStart(new Date(from + 7 * DAY))}>
            <ChevronRight className="size-4" aria-hidden />
          </IconButton>
          <button
            type="button"
            aria-label="New event"
            onClick={() => {
              const d = new Date()
              d.setMinutes(0, 0, 0)
              openNew(d.getTime() + 3_600_000)
            }}
            className="ml-1 flex size-8 items-center justify-center rounded-md bg-accent text-accent-fg hover:bg-accent-hover"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 border-t border-line">
        <aside className="w-[236px] shrink-0 overflow-y-auto border-r border-line p-3">
          <p className="px-1 pb-2 font-semibold text-ink">To-do</p>
          {GROUPS.map((group) => {
            const items = (todos.data ?? []).filter((t) => t.groupName === group)
            const closed = collapsed[group]
            return (
              <div key={group} className="mb-3">
                <button
                  type="button"
                  aria-expanded={!closed}
                  onClick={() => setCollapsed((c) => ({ ...c, [group]: !closed }))}
                  className="flex h-7 w-full items-center gap-1 rounded-md px-1 text-2xs font-medium text-ink-3 hover:bg-hover"
                >
                  <ChevronDown
                    className={cn('size-3.5 transition-transform', closed && '-rotate-90')}
                    aria-hidden
                  />
                  {group}
                  <span className="ml-auto tabular-nums">
                    {items.filter((t) => !t.done).length}
                  </span>
                </button>
                {closed ? null : (
                  <>
                    {items.map((todo: Todo) => (
                      <div
                        key={todo.id}
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData(
                            'text/atlas-todo',
                            JSON.stringify({ id: todo.id, title: todo.title }),
                          )
                        }
                        className="group flex cursor-grab items-start gap-2 rounded-md px-1 py-1 hover:bg-hover"
                      >
                        <input
                          type="checkbox"
                          checked={todo.done}
                          aria-label={todo.title}
                          onChange={() => void db.update('todos', todo.id, { done: !todo.done })}
                          className="mt-0.5 size-3.5 accent-[var(--atlas-accent)]"
                        />
                        <span
                          className={cn(
                            'min-w-0 flex-1 leading-5',
                            todo.done && 'text-ink-3 line-through',
                          )}
                        >
                          {todo.title}
                        </span>
                        <button
                          type="button"
                          aria-label={`Delete ${todo.title}`}
                          onClick={() => void db.remove('todos', todo.id)}
                          className="hidden text-ink-3 group-hover:block hover:text-ink"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    ))}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        const title = (newTodo[group] ?? '').trim()
                        if (!title) return
                        void db.create('todos', { title, groupName: group })
                        setNewTodo((n) => ({ ...n, [group]: '' }))
                      }}
                    >
                      <input
                        value={newTodo[group] ?? ''}
                        onChange={(e) => setNewTodo((n) => ({ ...n, [group]: e.target.value }))}
                        placeholder="Add a task"
                        aria-label={`Add a task to ${group}`}
                        className="mt-0.5 h-7 w-full rounded-md bg-transparent px-1 text-ink outline-none placeholder:text-ink-3 focus:bg-hover"
                      />
                    </form>
                  </>
                )}
              </div>
            )
          })}
          <p className="px-1 pt-2 text-2xs text-ink-3">
            Drag a task onto the week to block out time for it.
          </p>
        </aside>

        <div className="min-w-0 flex-1 overflow-auto">
          <div className="sticky top-0 z-10 grid grid-cols-[56px_repeat(7,minmax(96px,1fr))] border-b border-line bg-surface">
            <span />
            {days.map((day) => {
              const isToday = day.toDateString() === today.toDateString()
              return (
                <div
                  key={day.getTime()}
                  className={cn('px-2 py-2 text-center', isToday && 'border-b-2 border-accent')}
                >
                  <p
                    className={cn(
                      'text-[1.05rem] leading-6 tabular-nums',
                      isToday ? 'font-semibold text-ink' : 'text-ink-2',
                    )}
                  >
                    {day.getDate()}
                  </p>
                  <p className="text-2xs tracking-wide text-ink-3 uppercase">
                    {day.toLocaleDateString(undefined, { weekday: 'short' })}
                  </p>
                </div>
              )
            })}
          </div>
          <div className="grid grid-cols-[56px_repeat(7,minmax(96px,1fr))]">
            <div>
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                <div
                  key={i}
                  style={{ height: HOUR_PX }}
                  className="pr-2 text-right text-2xs text-ink-3"
                >
                  <span className="relative -top-2">
                    {new Date(2000, 0, 1, HOUR_START + i).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                    })}
                  </span>
                </div>
              ))}
            </div>
            {days.map((day) => {
              const dayStart = new Date(day).setHours(HOUR_START, 0, 0, 0)
              const dayEnd = new Date(day).setHours(HOUR_END, 0, 0, 0)
              return (
                <div
                  key={day.getTime()}
                  className="relative border-l border-line"
                  style={{
                    height: (HOUR_END - HOUR_START) * HOUR_PX,
                    backgroundImage:
                      'linear-gradient(to bottom, var(--atlas-line) 1px, transparent 1px)',
                    backgroundSize: `100% ${HOUR_PX}px`,
                  }}
                  onDoubleClick={(e) =>
                    openNew(slotTime(day, e.clientY, e.currentTarget.getBoundingClientRect().top))
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const data = e.dataTransfer.getData('text/atlas-todo')
                    if (!data) return
                    const todo = JSON.parse(data) as { title: string }
                    openNew(
                      slotTime(day, e.clientY, e.currentTarget.getBoundingClientRect().top),
                      45,
                      todo.title,
                      'study_block',
                    )
                  }}
                >
                  {weekEvents
                    .filter((e) => e.startsAt < dayEnd && e.endsAt > dayStart)
                    .map((event) => {
                      const top =
                        ((Math.max(event.startsAt, dayStart) - dayStart) / 3_600_000) * HOUR_PX
                      const height = Math.max(
                        22,
                        ((Math.min(event.endsAt, dayEnd) - Math.max(event.startsAt, dayStart)) /
                          3_600_000) *
                          HOUR_PX -
                          2,
                      )
                      const subject = subjects.find((s) => s.id === event.subjectId)
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => openEdit(event)}
                          onDoubleClick={(e) => e.stopPropagation()}
                          style={{ top, height }}
                          className={cn(
                            'absolute right-1 left-1 overflow-hidden rounded-md bg-sunken px-2 py-1 text-left ring-1 ring-line ring-inset hover:bg-hover',
                            event.done && 'opacity-55',
                          )}
                        >
                          <span className="block truncate text-2xs font-medium text-ink">
                            {event.title}
                          </span>
                          {height > 34 ? (
                            <span className="block truncate text-2xs text-ink-3">
                              {timeLabel(event.startsAt)} to {timeLabel(event.endsAt)}
                            </span>
                          ) : null}
                          <span
                            aria-hidden
                            className="absolute inset-x-0 bottom-0 h-[3px]"
                            style={{
                              background: subject
                                ? `var(--atlas-subject-${subject.colour})`
                                : event.kind === 'exam' || event.kind === 'sac'
                                  ? 'var(--atlas-danger)'
                                  : 'transparent',
                            }}
                          />
                        </button>
                      )
                    })}
                </div>
              )
            })}
          </div>
          <p className="px-4 py-3 text-2xs text-ink-3">
            Double-click an empty slot to add something.
          </p>
        </div>
      </div>

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
        title={draft?.id ? 'Edit' : 'Add to your week'}
        footer={
          <>
            {draft?.id ? (
              <Button
                variant="danger"
                className="mr-auto"
                onClick={() => {
                  void db.remove('calendarEvents', draft.id as string)
                  setDraft(null)
                }}
              >
                Delete
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!draft?.title.trim() || save.pending}
              onClick={() => void save.run()}
            >
              Save
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Title" className="col-span-2">
              <Input
                autoFocus
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="Type">
              <Select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })}
              >
                {EVENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subject">
              <Select
                value={draft.subjectId}
                onChange={(e) => setDraft({ ...draft, subjectId: e.target.value })}
              >
                <option value="">None</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Starts">
              <Input
                type="datetime-local"
                value={draft.start}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              />
            </Field>
            <Field label="Ends" error={save.error ? 'The end must be after the start.' : null}>
              <Input
                type="datetime-local"
                value={draft.end}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </Field>
            <Field label="Notes" className="col-span-2">
              <Textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                className="min-h-16"
              />
            </Field>
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}

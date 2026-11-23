import { useState } from 'react'
import {
  Bug,
  Check,
  ChevronDown,
  Lightbulb,
  MessageSquare,
  Minus,
  Plus,
  UserCheck,
  UserMinus,
  Undo2,
} from 'lucide-react'
import type { AccessEntry, CommunityStatus, Feedback } from '@shared/community'
import { FEATURES } from '@shared/features'
import { Button, IconButton } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Segmented } from '@/design/Segmented'
import { ErrorState, SkeletonList } from '@/design/States'
import { changed, useAction, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'

type Tab = 'people' | 'reports'

const KIND_ICON = { bug: Bug, idea: Lightbulb, other: MessageSquare } as const
const KIND_LABEL = { bug: 'Bug', idea: 'Idea', other: 'Other' } as const

/** Only the Atlas admin sees this: who is in, who is waiting, and bug reports. */
export function AdminDialog({
  open,
  onOpenChange,
  status,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: CommunityStatus
}) {
  const [tab, setTab] = useState<Tab>('people')
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Atlas admin"
      description="Choose who gets a place, and read what people report."
      width={620}
    >
      <Segmented
        label="Admin view"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'people', label: 'People' },
          { value: 'reports', label: 'Reports' },
        ]}
        className="mb-4 self-start"
      />
      {tab === 'people' ? <People status={status} /> : <Reports />}
    </Dialog>
  )
}

function People({ status }: { status: CommunityStatus }) {
  const list = useLive(['shared', 'admin'], () => call('admin:access'))
  const [cap, setCap] = useState<number | null>(null)
  const capacity = cap ?? status.capacity
  const setAccess = useAction(
    async (entry: AccessEntry, next: 'approved' | 'waitlisted' | 'removed') => {
      await call('admin:setAccess', { userId: entry.userId, status: next })
      changed('admin', 'shared-status')
    },
  )
  const saveCap = useAction(async (value: number) => {
    await call('admin:setCapacity', { capacity: value })
    setCap(null)
    changed('admin', 'shared-status')
  })

  if (list.error) return <ErrorState>{list.error}</ErrorState>
  if (!list.data) return <SkeletonList rows={4} />
  const approved = list.data.filter((e) => e.status === 'approved')
  const waiting = list.data.filter((e) => e.status === 'waitlisted')
  const removed = list.data.filter((e) => e.status === 'removed')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 rounded-xl bg-sunken px-4 py-3">
        <div className="flex-1">
          <p className="font-medium text-ink">Places</p>
          <p className="text-2xs text-ink-2">
            {approved.length} of {status.capacity} taken. New sign-ups wait once it is full.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            label="One fewer place"
            size="sm"
            disabled={capacity <= 1}
            onClick={() => setCap(capacity - 1)}
          >
            <Minus className="size-3.5" aria-hidden />
          </IconButton>
          <span className="w-8 text-center font-semibold tabular-nums text-ink">{capacity}</span>
          <IconButton label="One more place" size="sm" onClick={() => setCap(capacity + 1)}>
            <Plus className="size-3.5" aria-hidden />
          </IconButton>
          {cap !== null && cap !== status.capacity ? (
            <Button
              size="sm"
              variant="primary"
              disabled={saveCap.pending}
              onClick={() => void saveCap.run(cap)}
            >
              Save
            </Button>
          ) : null}
        </div>
      </div>
      {saveCap.error || setAccess.error ? (
        <p className="text-2xs text-danger">{saveCap.error ?? setAccess.error}</p>
      ) : null}

      <section>
        <h3 className="mb-2 text-2xs font-medium tracking-wide text-ink-3 uppercase">
          Waitlist · {waiting.length}
        </h3>
        {waiting.length === 0 ? (
          <p className="text-2xs text-ink-3">Nobody is waiting.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {waiting.map((e) => (
              <Person key={e.userId} entry={e}>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={setAccess.pending}
                  icon={<UserCheck className="size-3.5" aria-hidden />}
                  onClick={() => void setAccess.run(e, 'approved')}
                >
                  Let in
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={setAccess.pending}
                  onClick={() => void setAccess.run(e, 'removed')}
                >
                  Decline
                </Button>
              </Person>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-2xs font-medium tracking-wide text-ink-3 uppercase">
          In Atlas · {approved.length}
        </h3>
        <ul className="flex flex-col gap-1">
          {approved.map((e) => (
            <Person
              key={e.userId}
              entry={e}
              me={e.userId === status.userId}
              features={e.userId === status.userId ? undefined : e}
            >
              {e.userId === status.userId ? null : (
                <>
                  <IconButton
                    label="Move to the waitlist"
                    size="sm"
                    disabled={setAccess.pending}
                    onClick={() => void setAccess.run(e, 'waitlisted')}
                  >
                    <Undo2 className="size-3.5" aria-hidden />
                  </IconButton>
                  <IconButton
                    label="Remove from Atlas"
                    size="sm"
                    disabled={setAccess.pending}
                    onClick={() => void setAccess.run(e, 'removed')}
                  >
                    <UserMinus className="size-3.5" aria-hidden />
                  </IconButton>
                </>
              )}
            </Person>
          ))}
        </ul>
      </section>

      {removed.length > 0 ? (
        <section>
          <h3 className="mb-2 text-2xs font-medium tracking-wide text-ink-3 uppercase">
            Removed · {removed.length}
          </h3>
          <ul className="flex flex-col gap-1">
            {removed.map((e) => (
              <Person key={e.userId} entry={e}>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={setAccess.pending}
                  onClick={() => void setAccess.run(e, 'waitlisted')}
                >
                  Allow back
                </Button>
              </Person>
            ))}
          </ul>
          <p className="mt-1.5 text-2xs text-ink-3">
            Removed accounts cannot take a place by signing in again. Allow one back to put it on
            the waitlist.
          </p>
        </section>
      ) : null}
    </div>
  )
}

/** When someone last opened Atlas, in words. */
function seen(at: string | null): string {
  if (!at) return 'not seen yet'
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60_000)
  if (mins < 10) return 'active now'
  if (mins < 60) return `seen ${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `seen ${hours} h ago`
  const days = Math.round(hours / 24)
  return days < 30 ? `seen ${days} d ago` : `seen ${new Date(at).toLocaleDateString()}`
}

/** Switches for what one person can use. Changes reach their app within a few minutes. */
function FeatureSwitches({ entry }: { entry: AccessEntry }) {
  const save = useAction(async (id: string, on: boolean) => {
    await call('admin:setFeatures', {
      userId: entry.userId,
      features: { ...entry.features, [id]: on },
    })
    changed('admin')
  })
  return (
    <div className="mt-2 mb-1 grid gap-1.5 rounded-lg bg-sunken p-3 sm:grid-cols-2">
      {FEATURES.map((f) => {
        const set = entry.features[f.id]
        const on = typeof set === 'boolean' ? set : f.default
        return (
          <button
            key={f.id}
            type="button"
            role="switch"
            aria-checked={on}
            disabled={save.pending}
            onClick={() => void save.run(f.id, !on)}
            className="flex items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-hover disabled:opacity-60"
          >
            <span
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                on ? 'bg-accent' : 'bg-line-strong',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]',
                  on ? 'left-[18px]' : 'left-0.5',
                )}
              />
            </span>
            <span className="min-w-0">
              <span className="block font-medium text-ink">{f.label}</span>
              <span className="block truncate text-2xs text-ink-3">{f.detail}</span>
            </span>
          </button>
        )
      })}
      {save.error ? <p className="text-2xs text-danger sm:col-span-2">{save.error}</p> : null}
    </div>
  )
}

function Person({
  entry,
  me,
  features,
  children,
}: {
  entry: AccessEntry
  me?: boolean
  /** Show this person's feature switches. */
  features?: AccessEntry
  children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-lg px-2 py-1.5 hover:bg-sunken/60">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-ink">
            {entry.displayName ?? entry.email}
            {me ? (
              <span className="ml-1.5 text-2xs font-normal text-ink-3">(you, admin)</span>
            ) : null}
          </p>
          <p className="truncate text-2xs text-ink-3">
            {entry.username ? `@${entry.username} · ` : ''}
            {entry.email} · {seen(entry.lastSeen)}
            {entry.appVersion ? ` · v${entry.appVersion}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {features ? (
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              Features
              <ChevronDown
                className={cn('size-3.5 transition-transform', open && 'rotate-180')}
                aria-hidden
              />
            </Button>
          ) : null}
          {children}
        </div>
      </div>
      {features && open ? <FeatureSwitches entry={features} /> : null}
    </li>
  )
}

function Reports() {
  const list = useLive(['admin'], () => call('admin:feedback'))
  const [filter, setFilter] = useState<'open' | 'done'>('open')
  const mark = useAction(async (item: Feedback, next: Feedback['status']) => {
    await call('admin:setFeedback', { id: item.id, status: next })
    changed('admin')
  })
  if (list.error) return <ErrorState>{list.error}</ErrorState>
  if (!list.data) return <SkeletonList rows={3} />
  const shown = list.data.filter((f) =>
    filter === 'done' ? f.status === 'done' : f.status !== 'done',
  )
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Report filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: `Open · ${list.data.filter((f) => f.status !== 'done').length}` },
          { value: 'done', label: 'Done' },
        ]}
        className="self-start"
      />
      {shown.length === 0 ? (
        <p className="py-6 text-center text-2xs text-ink-3">Nothing here.</p>
      ) : null}
      {shown.map((f) => {
        const Icon = KIND_ICON[f.kind]
        return (
          <article
            key={f.id}
            className={cn(
              'rounded-xl p-4 ring-1 ring-line',
              f.status === 'new' && 'bg-blue-soft/40',
            )}
          >
            <div className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-sunken text-ink-2">
                <Icon className="size-3.5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{f.title}</p>
                <p className="text-2xs text-ink-3">
                  {KIND_LABEL[f.kind]} · {f.from} · {new Date(f.createdAt).toLocaleString()} · v
                  {f.appVersion} · {f.platform}
                </p>
                {f.body ? (
                  <p className="mt-2 text-sm whitespace-pre-wrap text-ink-2">{f.body}</p>
                ) : null}
                {f.attachmentName ? <Attachment id={f.id} name={f.attachmentName} /> : null}
              </div>
              {f.status === 'done' ? (
                <Button size="sm" variant="ghost" onClick={() => void mark.run(f, 'seen')}>
                  Reopen
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Check className="size-3.5" aria-hidden />}
                  onClick={() => void mark.run(f, 'done')}
                >
                  Done
                </Button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

/** Loads a report's screenshot or recording only when the admin asks to see it. */
function Attachment({ id, name }: { id: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const video = /\.(webm|mp4)$/.test(name)
  const load = useAction(async () => {
    const bytes = await call('admin:attachment', { id })
    setUrl(URL.createObjectURL(new Blob([bytes], { type: video ? 'video/webm' : 'image/png' })))
  })
  if (!url) {
    return (
      <div className="mt-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={load.pending}
          onClick={() => void load.run()}
        >
          {load.pending ? 'Loading…' : video ? 'Show recording' : 'Show screenshot'}
        </Button>
        {load.error ? <p className="mt-1 text-2xs text-danger">{load.error}</p> : null}
      </div>
    )
  }
  return video ? (
    <video src={url} controls className="mt-3 max-h-72 w-full rounded-lg bg-black" />
  ) : (
    <img
      src={url}
      alt="Attached screenshot"
      className="mt-3 max-h-72 rounded-lg ring-1 ring-line"
    />
  )
}

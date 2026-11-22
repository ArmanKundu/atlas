import { useState } from 'react'
import {
  Bug,
  Check,
  Lightbulb,
  MessageSquare,
  Minus,
  Plus,
  UserCheck,
  UserMinus,
  Undo2,
} from 'lucide-react'
import type { AccessEntry, CommunityStatus, Feedback } from '@shared/community'
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
            <Person key={e.userId} entry={e} me={e.userId === status.userId}>
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
    </div>
  )
}

function Person({
  entry,
  me,
  children,
}: {
  entry: AccessEntry
  me?: boolean
  children?: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-sunken">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">
          {entry.displayName ?? entry.email}
          {me ? <span className="ml-1.5 text-2xs font-normal text-ink-3">(you, admin)</span> : null}
        </p>
        <p className="truncate text-2xs text-ink-3">
          {entry.username ? `@${entry.username} · ` : ''}
          {entry.email} · {new Date(entry.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-1">{children}</div>
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
                {f.attachmentUrl ? (
                  f.attachmentName?.match(/\.(webm|mp4)$/) ? (
                    <video
                      src={f.attachmentUrl}
                      controls
                      className="mt-3 max-h-72 w-full rounded-lg bg-black"
                    />
                  ) : (
                    <a href={f.attachmentUrl} target="_blank" rel="noreferrer">
                      <img
                        src={f.attachmentUrl}
                        alt="Attached screenshot"
                        className="mt-3 max-h-72 rounded-lg ring-1 ring-line"
                      />
                    </a>
                  )
                ) : null}
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

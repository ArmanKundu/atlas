import { useEffect } from 'react'
import { Inbox } from 'lucide-react'
import { ROLE_LABEL, type Notification } from '@shared/community'
import { Button } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { EmptyState, ErrorState, SkeletonList } from '@/design/States'
import { useToast } from '@/design/Toast'
import { changed, useAction, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { Avatar } from './SpaceBits'
import { timeAgo } from './kinds'

function line(n: Notification): string {
  const who = n.actor?.displayName ?? 'Someone'
  switch (n.kind) {
    case 'invite':
      return `${who} invited you to ${n.spaceName}${n.role ? ` as ${ROLE_LABEL[n.role].toLowerCase()}` : ''}.`
    case 'join_request':
      return `${who} wants to join ${n.spaceName}.`
    case 'request_approved':
      return `You are in! ${who} approved you for ${n.spaceName}.`
    case 'request_declined':
      return `Your request to join ${n.spaceName} was declined.`
    case 'invite_accepted':
      return `${who} accepted your invite to ${n.spaceName}.`
    case 'role_changed':
      return `${who} changed your role in ${n.spaceName}.`
    case 'waitlist':
      return 'Someone joined the Atlas waitlist.'
  }
}

/** Invites, join requests and their answers. Opening it marks everything read. */
export function InboxDialog({
  open,
  onOpenChange,
  onOpenSpace,
  onOpenAdmin,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenSpace: (spaceId: string) => void
  onOpenAdmin?: () => void
}) {
  const toast = useToast()
  const inbox = useLive(['shared', 'inbox'], () => call('shared:inbox'), [open])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      void call('shared:markRead').then(() => changed('shared'))
    }, 1200)
    return () => window.clearTimeout(t)
  }, [open])

  const act = useAction(async (work: () => Promise<unknown>, done?: string) => {
    await work()
    changed('shared', 'inbox')
    if (done) toast({ title: done, tone: 'success' })
  })

  const items = inbox.data ?? []
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Inbox" width={520}>
      {inbox.error ? (
        <ErrorState>{inbox.error}</ErrorState>
      ) : !inbox.data ? (
        <SkeletonList rows={3} />
      ) : items.length === 0 ? (
        <EmptyState
          eyebrow="Inbox"
          title="Nothing here yet"
          art={<Inbox className="size-8 text-ink-3" aria-hidden />}
        >
          Invites to spaces and requests to join yours show up here.
        </EmptyState>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {items.map((n) => {
            const ref = n.refId ?? ''
            const spaceId = n.spaceId ?? ''
            return (
              <li
                key={n.id}
                className={cn('flex gap-3 rounded-lg px-2 py-3', !n.read && 'bg-blue-soft/60')}
              >
                {n.actor ? <Avatar profile={n.actor} size={32} /> : <span className="size-8" />}
                <div className="min-w-0 flex-1">
                  <p className="text-ink">{line(n)}</p>
                  <p className="mt-0.5 text-2xs text-ink-3">{timeAgo(n.createdAt)}</p>
                  {n.open && n.refId ? (
                    <div className="mt-2 flex gap-2">
                      {n.kind === 'invite' ? (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={act.pending}
                            onClick={() =>
                              void act.run(
                                () => call('shared:respondInvite', { id: ref, accept: true }),
                                `You joined ${n.spaceName}`,
                              )
                            }
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={act.pending}
                            onClick={() =>
                              void act.run(() =>
                                call('shared:respondInvite', { id: ref, accept: false }),
                              )
                            }
                          >
                            Decline
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={act.pending}
                            onClick={() =>
                              void act.run(
                                () =>
                                  call('shared:decideRequest', {
                                    id: ref,
                                    approve: true,
                                    role: 'viewer',
                                  }),
                                `${n.actor?.displayName ?? 'They'} can now view ${n.spaceName}`,
                              )
                            }
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={act.pending}
                            onClick={() =>
                              void act.run(() =>
                                call('shared:decideRequest', {
                                  id: ref,
                                  approve: false,
                                  role: 'viewer',
                                }),
                              )
                            }
                          >
                            Decline
                          </Button>
                        </>
                      )}
                    </div>
                  ) : n.kind === 'waitlist' && onOpenAdmin ? (
                    <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={onOpenAdmin}>
                      Review waitlist
                    </Button>
                  ) : n.spaceId &&
                    (n.kind === 'request_approved' || n.kind === 'invite_accepted') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-1 -ml-2"
                      onClick={() => {
                        onOpenSpace(spaceId)
                        onOpenChange(false)
                      }}
                    >
                      Open space
                    </Button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {act.error ? <ErrorState className="mt-3">{act.error}</ErrorState> : null}
    </Dialog>
  )
}

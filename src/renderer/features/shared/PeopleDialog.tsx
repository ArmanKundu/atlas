import { useDeferredValue, useState } from 'react'
import { Copy, RefreshCw, Search, UserMinus } from 'lucide-react'
import {
  INVITE_ROLES,
  ROLE_HINT,
  ROLE_LABEL,
  canManage,
  type InviteRole,
  type Space,
} from '@shared/community'
import { Button, IconButton } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Select } from '@/design/Form'
import { ErrorState, SkeletonList } from '@/design/States'
import { useToast } from '@/design/Toast'
import { changed, useAction, useLive } from '@/lib/api'
import { call } from '@/lib/ipc'
import { Avatar, RoleBadge } from './SpaceBits'

function RoleSelect({
  value,
  onChange,
  label,
}: {
  value: InviteRole
  onChange: (role: InviteRole) => void
  label: string
}) {
  return (
    <Select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as InviteRole)}
      className="h-7 w-28 text-2xs"
      title={ROLE_HINT[value]}
    >
      {INVITE_ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABEL[r]}
        </option>
      ))}
    </Select>
  )
}

/** Invite people, answer join requests, change roles and see the join code. */
export function PeopleDialog({
  open,
  onOpenChange,
  space,
  meId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  space: Space
  meId: string | null
}) {
  const toast = useToast()
  const manager = canManage(space.role)
  const [q, setQ] = useState('')
  const query = useDeferredValue(q)
  const [inviteRole, setInviteRole] = useState<InviteRole>(space.defaultRole)
  const [requestRoles, setRequestRoles] = useState<Record<string, InviteRole>>({})

  const people = useLive(
    ['shared', `people:${space.id}`],
    () => call('shared:people', { spaceId: space.id }),
    [space.id, open],
  )
  const found = useLive(
    [],
    () =>
      manager && query.trim().length >= 2
        ? call('shared:searchUsers', { q: query })
        : Promise.resolve([]),
    [query, manager],
  )

  const act = useAction(async (work: () => Promise<unknown>, done?: string) => {
    await work()
    changed('shared', `people:${space.id}`)
    if (done) toast({ title: done, tone: 'success' })
  })

  const memberIds = new Set((people.data?.members ?? []).map((m) => m.userId))
  const invitedIds = new Set((people.data?.invites ?? []).map((i) => i.user.userId))

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`People in ${space.name}`}
      description={`${space.memberCount} ${space.memberCount === 1 ? 'member' : 'members'}`}
      width={560}
    >
      <div className="flex flex-col gap-6">
        {manager && space.joinCode ? (
          <section className="flex items-center gap-3 rounded-xl bg-sunken px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-2xs font-medium tracking-wide text-ink-3 uppercase">Join code</p>
              <p className="mt-0.5 font-mono text-[1.25rem] font-semibold tracking-[0.18em] text-ink">
                {space.joinCode.slice(0, 4)} {space.joinCode.slice(4)}
              </p>
              <p className="text-2xs text-ink-3">
                {space.visibility === 'public' || !space.requireApproval
                  ? 'Anyone with this code joins straight away.'
                  : 'People who use it ask to join; you approve them here or in your inbox.'}
              </p>
            </div>
            <Button
              size="sm"
              icon={<Copy className="size-3.5" aria-hidden />}
              onClick={() => {
                void navigator.clipboard.writeText(space.joinCode ?? '')
                toast({ title: 'Code copied', tone: 'success' })
              }}
            >
              Copy
            </Button>
            <IconButton
              label="Make a new code (the old one stops working)"
              onClick={() =>
                void act.run(
                  () => call('shared:regenerateCode', { spaceId: space.id }),
                  'New code made',
                )
              }
            >
              <RefreshCw className="size-4" aria-hidden />
            </IconButton>
          </section>
        ) : null}

        {manager ? (
          <section>
            <h3 className="mb-2 font-semibold text-ink">Invite someone</h3>
            <div className="flex gap-2">
              <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md bg-surface px-2.5 ring-1 ring-line-strong ring-inset focus-within:ring-2 focus-within:ring-focus">
                <Search className="size-4 text-ink-3" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Name, @username or their exact email"
                  aria-label="Find people"
                  className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
                />
              </label>
              <RoleSelect value={inviteRole} onChange={setInviteRole} label="Invite as" />
            </div>
            {query.trim().length >= 2 ? (
              <ul className="mt-2 flex flex-col divide-y divide-line rounded-lg border border-line">
                {(found.data ?? []).length === 0 ? (
                  <li className="px-3 py-3 text-ink-3">
                    {found.loading
                      ? 'Searching…'
                      : 'Nobody found. They need to sign in to Atlas’s shared library once first.'}
                  </li>
                ) : (
                  (found.data ?? []).map((p) => (
                    <li key={p.userId} className="flex items-center gap-3 px-3 py-2">
                      <Avatar profile={p} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{p.displayName}</span>
                        <span className="block truncate text-2xs text-ink-3">@{p.username}</span>
                      </span>
                      {memberIds.has(p.userId) ? (
                        <span className="text-2xs text-ink-3">In the space</span>
                      ) : invitedIds.has(p.userId) ? (
                        <span className="text-2xs text-ink-3">Invited</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={act.pending}
                          onClick={() =>
                            void act.run(
                              () =>
                                call('shared:invite', {
                                  spaceId: space.id,
                                  userId: p.userId,
                                  role: inviteRole,
                                }),
                              `Invited ${p.displayName}`,
                            )
                          }
                        >
                          Invite
                        </Button>
                      )}
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </section>
        ) : null}

        {act.error ? <ErrorState>{act.error}</ErrorState> : null}

        {people.error ? (
          <ErrorState>{people.error}</ErrorState>
        ) : !people.data ? (
          <SkeletonList rows={3} />
        ) : (
          <>
            {manager && people.data.requests.length > 0 ? (
              <section>
                <h3 className="mb-2 font-semibold text-ink">Asking to join</h3>
                <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
                  {people.data.requests.map((r) => {
                    const role = requestRoles[r.id] ?? space.defaultRole
                    return (
                      <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                        <Avatar profile={r.user} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink">
                            {r.user.displayName}
                          </span>
                          <span className="block truncate text-2xs text-ink-3">
                            @{r.user.username}
                          </span>
                        </span>
                        <RoleSelect
                          value={role}
                          onChange={(v) => setRequestRoles((m) => ({ ...m, [r.id]: v }))}
                          label={`Role for ${r.user.displayName}`}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void act.run(() =>
                              call('shared:decideRequest', { id: r.id, approve: false, role }),
                            )
                          }
                        >
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() =>
                            void act.run(
                              () => call('shared:decideRequest', { id: r.id, approve: true, role }),
                              `${r.user.displayName} is in`,
                            )
                          }
                        >
                          Approve
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}

            {manager && people.data.invites.length > 0 ? (
              <section>
                <h3 className="mb-2 font-semibold text-ink">Invited</h3>
                <ul className="flex flex-col gap-1">
                  {people.data.invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-1 py-1">
                      <Avatar profile={i.user} size={24} />
                      <span className="min-w-0 flex-1 truncate text-ink-2">
                        {i.user.displayName} <span className="text-ink-3">@{i.user.username}</span>
                      </span>
                      <span className="text-2xs text-ink-3">Waiting · {ROLE_LABEL[i.role]}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <h3 className="mb-2 font-semibold text-ink">Members</h3>
              <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
                {people.data.members.map((m) => {
                  const editable = manager && m.role !== 'owner' && m.userId !== meId
                  return (
                    <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
                      <Avatar profile={m} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">
                          {m.displayName}
                          {m.userId === meId ? <span className="text-ink-3"> (you)</span> : null}
                        </span>
                        <span className="block truncate text-2xs text-ink-3">@{m.username}</span>
                      </span>
                      {editable ? (
                        <>
                          <RoleSelect
                            value={m.role as InviteRole}
                            onChange={(role) =>
                              void act.run(() =>
                                call('shared:setRole', {
                                  spaceId: space.id,
                                  userId: m.userId,
                                  role,
                                }),
                              )
                            }
                            label={`Role for ${m.displayName}`}
                          />
                          <IconButton
                            label={`Remove ${m.displayName}`}
                            onClick={() =>
                              void act.run(
                                () =>
                                  call('shared:removeMember', {
                                    spaceId: space.id,
                                    userId: m.userId,
                                  }),
                                `Removed ${m.displayName}`,
                              )
                            }
                          >
                            <UserMinus className="size-4" aria-hidden />
                          </IconButton>
                        </>
                      ) : (
                        <RoleBadge role={m.role} />
                      )}
                    </li>
                  )
                })}
              </ul>
              <p className="mt-2 text-2xs text-ink-3">
                Viewers browse, react and save copies. Editors also share. Admins also invite,
                approve and tidy up.
              </p>
            </section>
          </>
        )}
      </div>
    </Dialog>
  )
}

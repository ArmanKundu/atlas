import { useDeferredValue, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  Bell,
  Globe,
  KeyRound,
  LayoutGrid,
  List,
  Lock,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  ThumbsUp,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  SHARED_STORAGE_QUOTA,
  canManage,
  canWrite,
  formatBytes,
  type CommunityStatus,
  type Profile,
  type SharedCard,
  type SharedKind,
  type Space,
} from '@shared/community'
import { Button, IconButton } from '@/design/Button'
import { Select } from '@/design/Form'
import { Menu } from '@/design/Menu'
import { Segmented } from '@/design/Segmented'
import { EmptyState, ErrorState, SkeletonList } from '@/design/States'
import { useToast } from '@/design/Toast'
import { AdminDialog } from '@/features/shared/AdminDialog'
import { EmailSignIn } from '@/features/shared/EmailSignIn'
import { InboxDialog } from '@/features/shared/InboxDialog'
import { JoinDialog } from '@/features/shared/JoinDialog'
import { KindIcon } from '@/features/shared/KindIcon'
import { KIND_LABEL, timeAgo } from '@/features/shared/kinds'
import { PeopleDialog } from '@/features/shared/PeopleDialog'
import { ShareDialog } from '@/features/shared/ShareDialog'
import { SharedPreview } from '@/features/shared/SharedPreview'
import { Avatar, RoleBadge, SpaceTile } from '@/features/shared/SpaceBits'
import { SpaceDialog } from '@/features/shared/SpaceDialog'
import { banner } from '@/features/shared/spaceStyle'
import { useSharedStatus } from '@/features/shared/useSharedStatus'
import { changed, useAction, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { useSetting } from '@/lib/settings'
import { Mascot } from '@/mascot/Mascot'

type KindFilter = SharedKind | 'all'

/** Spaces of friends sharing notes, files and flashcards: browse, react, remix and share. */
export function Shared() {
  const status = useSharedStatus()
  if (status.error) {
    return (
      <div className="p-8">
        <ErrorState>{status.error}</ErrorState>
      </div>
    )
  }
  const s = status.data
  if (!s)
    return (
      <div className="p-8">
        <SkeletonList rows={4} />
      </div>
    )
  if (!s.configured) {
    return (
      <div className="mx-auto max-w-xl p-8 pt-16">
        <EmptyState eyebrow="Shared" title="Not connected yet" art={<Mascot size={64} />}>
          The shared library is not set up in this build.
        </EmptyState>
      </div>
    )
  }
  if (!s.signedIn || !s.profile) {
    return (
      <div className="flex h-full items-start justify-center overflow-y-auto p-8 pt-[12vh]">
        <div className="w-full max-w-[460px]">
          <div className="mb-6 flex flex-col items-center text-center">
            <Mascot size={64} />
            <h1 className="mt-4 text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">
              {s.access === 'waitlisted'
                ? 'Atlas is full'
                : s.signedIn
                  ? 'Almost there'
                  : 'Share with friends'}
            </h1>
            <p className="mt-1.5 max-w-[42ch] text-ink-2">
              {s.access === 'waitlisted'
                ? 'Places are kept small so Atlas stays among friends.'
                : s.signedIn
                  ? 'Pick a name and @username so friends can invite you.'
                  : 'Join spaces with your friends to swap notes, files and flashcards. Sign in with your email; Atlas sends you a code.'}
            </p>
          </div>
          <div className="rounded-xl bg-surface p-5 shadow-pill ring-1 ring-line">
            <EmailSignIn status={s} />
          </div>
        </div>
      </div>
    )
  }
  return <Home status={s} profile={s.profile} />
}

function Home({ status, profile }: { status: CommunityStatus; profile: Profile }) {
  const toast = useToast()
  const spaces = useLive(['shared'], () => call('shared:spaces'))
  const [current, setCurrent] = useSetting<string>('shared.space', 'all')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [inbox, setInbox] = useState(false)
  const [admin, setAdmin] = useState(false)
  const signOut = useAction(async () => {
    await call('shared:signOut')
    changed('shared')
  })

  const list = spaces.data ?? []
  const [params, setParams] = useSearchParams()
  const item = params.get('item')
  const space = item ? null : (list.find((s) => s.id === current) ?? null)
  return (
    <div className="flex h-full min-h-0">
      <aside
        className="flex w-60 shrink-0 flex-col border-r border-line bg-canvas"
        aria-label="Spaces"
      >
        <div className="flex h-12 shrink-0 items-center gap-1 px-3">
          <p className="flex-1 px-1 text-2xs font-medium text-ink-3">Spaces</p>
          <IconButton label="Inbox" onClick={() => setInbox(true)}>
            <span className="relative">
              <Bell className="size-4" aria-hidden />
              {status.unread > 0 ? (
                <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue px-1 text-[0.625rem] font-semibold text-white">
                  {status.unread}
                </span>
              ) : null}
            </span>
          </IconButton>
          <Menu
            trigger={
              <button
                type="button"
                aria-label="Your account"
                className="rounded-full p-0.5 hover:bg-hover"
              >
                <Avatar profile={profile} size={24} />
              </button>
            }
            items={[
              {
                label: `@${profile.username}`,
                icon: <Users className="size-4" aria-hidden />,
                onSelect: () =>
                  toast({ title: profile.displayName, description: status.email ?? '' }),
              },
              ...(status.isAdmin
                ? [
                    {
                      label: 'Atlas admin',
                      icon: <ShieldCheck className="size-4" aria-hidden />,
                      onSelect: () => setAdmin(true),
                    },
                  ]
                : []),
              {
                label: 'Sign out',
                icon: <LogOut className="size-4" aria-hidden />,
                onSelect: () => void signOut.run(),
              },
            ]}
          />
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          <button
            type="button"
            aria-current={space === null || undefined}
            onClick={() => {
              setParams({})
              setCurrent('all')
            }}
            className={cn(
              'flex h-9 items-center gap-2.5 rounded-md px-2 text-left text-ink-2 hover:bg-hover',
              space === null && 'bg-active font-medium text-ink',
            )}
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-sunken">
              <LayoutGrid className="size-3.5" aria-hidden />
            </span>
            Everything
          </button>
          {list.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={space?.id === s.id || undefined}
              onClick={() => {
                setParams({})
                setCurrent(s.id)
              }}
              className={cn(
                'flex h-10 items-center gap-2.5 rounded-md px-2 text-left text-ink-2 hover:bg-hover',
                space?.id === s.id && 'bg-active text-ink',
              )}
            >
              <SpaceTile icon={s.icon} color={s.color} size={26} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{s.name}</span>
                <span className="block truncate text-2xs text-ink-3">
                  {s.memberCount} {s.memberCount === 1 ? 'member' : 'members'} · {s.itemCount}{' '}
                  shared
                </span>
              </span>
            </button>
          ))}
          {spaces.error ? <p className="px-2 text-2xs text-danger">{spaces.error}</p> : null}
        </nav>
        <div className="flex shrink-0 gap-2 border-t border-line p-3">
          <Button
            variant="primary"
            className="flex-1"
            icon={<Plus className="size-3.5" aria-hidden />}
            onClick={() => setCreating(true)}
          >
            Create
          </Button>
          <Button
            className="flex-1"
            icon={<KeyRound className="size-3.5" aria-hidden />}
            onClick={() => setJoining(true)}
          >
            Join
          </Button>
        </div>
      </aside>

      {spaces.data && list.length === 0 ? (
        <Welcome onCreate={() => setCreating(true)} onJoin={() => setJoining(true)} />
      ) : (
        <Browser
          key={`${space?.id ?? 'all'}:${item ?? ''}`}
          initialItem={item}
          status={status}
          space={space}
          spaces={list}
          onLeft={() => setCurrent('all')}
        />
      )}

      <SpaceDialog open={creating} onOpenChange={setCreating} onCreated={(s) => setCurrent(s.id)} />
      <JoinDialog open={joining} onOpenChange={setJoining} onJoined={(id) => setCurrent(id)} />
      <InboxDialog
        open={inbox}
        onOpenChange={setInbox}
        onOpenSpace={(id) => setCurrent(id)}
        onOpenAdmin={() => {
          setInbox(false)
          setAdmin(true)
        }}
      />
      {status.isAdmin ? <AdminDialog open={admin} onOpenChange={setAdmin} status={status} /> : null}
    </div>
  )
}

function Welcome({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="flex min-w-0 flex-1 items-start justify-center overflow-y-auto p-8 pt-[10vh]">
      <div className="w-full max-w-[640px] text-center">
        <Mascot size={64} />
        <h1 className="mt-4 text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">
          Start a space, or join one
        </h1>
        <p className="mx-auto mt-1.5 max-w-[52ch] text-ink-2">
          A space is a small community: a class, a subject or a study group. Everyone in it can
          browse and remix what is shared; owners choose who can add things.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3 text-left">
          <button
            type="button"
            onClick={onCreate}
            className="overflow-hidden rounded-xl border border-line bg-surface text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
          >
            <div className="h-16" style={{ background: banner('sky') }} />
            <div className="p-4">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <Plus className="size-4" aria-hidden /> Create a space
              </p>
              <p className="mt-1 text-2xs text-ink-3">
                Name it, pick an icon and banner, then invite friends or share its code.
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={onJoin}
            className="overflow-hidden rounded-xl border border-line bg-surface text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
          >
            <div className="h-16" style={{ background: banner('meadow') }} />
            <div className="p-4">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <KeyRound className="size-4" aria-hidden /> Join with a code
              </p>
              <p className="mt-1 text-2xs text-ink-3">
                Type the 8-character code a friend gave you. Invites land in your inbox.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

function SpaceHero({
  space,
  meId,
  onShare,
  onLeft,
}: {
  space: Space
  meId: string | null
  onShare: () => void
  onLeft: () => void
}) {
  const toast = useToast()
  const [people, setPeople] = useState(false)
  const [editing, setEditing] = useState(false)
  const manager = canManage(space.role)
  const leave = useAction(async () => {
    if (space.role === 'owner') {
      await call('shared:deleteSpace', { id: space.id })
      toast({ title: `Deleted ${space.name}` })
    } else {
      await call('shared:leave', { spaceId: space.id })
      toast({ title: `You left ${space.name}` })
    }
    changed('shared')
    onLeft()
  })
  return (
    <div className="shrink-0">
      <div className="h-24" style={{ background: banner(space.banner) }} />
      <div className="flex items-end gap-4 px-8">
        <SpaceTile
          icon={space.icon}
          color={space.color}
          size={64}
          className="-mt-8 shadow-pop ring-4 ring-canvas"
        />
        <div className="min-w-0 flex-1 pt-3">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[1.375rem] font-semibold tracking-[-0.02em] text-ink">
              {space.name}
            </h1>
            <RoleBadge role={space.role} />
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-2xs text-ink-3">
            {space.visibility === 'public' ? (
              <Globe className="size-3" aria-hidden />
            ) : (
              <Lock className="size-3" aria-hidden />
            )}
            {space.visibility === 'public' ? 'Public' : 'Private'} · {space.memberCount}{' '}
            {space.memberCount === 1 ? 'member' : 'members'}
            {space.description ? ` · ${space.description}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pb-0.5">
          <Button
            icon={
              manager ? (
                <UserPlus className="size-3.5" aria-hidden />
              ) : (
                <Users className="size-3.5" aria-hidden />
              )
            }
            onClick={() => setPeople(true)}
          >
            {manager ? 'Invite' : 'People'}
          </Button>
          {canWrite(space.role) ? (
            <Button
              variant="primary"
              icon={<Share2 className="size-3.5" aria-hidden />}
              onClick={onShare}
            >
              Share
            </Button>
          ) : null}
          <Menu
            trigger={
              <IconButton label="More">
                <MoreHorizontal className="size-4" aria-hidden />
              </IconButton>
            }
            items={[
              ...(manager
                ? [
                    {
                      label: 'Space settings',
                      icon: <Settings2 className="size-4" aria-hidden />,
                      onSelect: () => setEditing(true),
                    },
                  ]
                : []),
              {
                label: space.role === 'owner' ? 'Delete space' : 'Leave space',
                icon:
                  space.role === 'owner' ? (
                    <Trash2 className="size-4" aria-hidden />
                  ) : (
                    <LogOut className="size-4" aria-hidden />
                  ),
                onSelect: () => {
                  const sure = window.confirm(
                    space.role === 'owner'
                      ? `Delete ${space.name} and everything shared in it, for everyone? This cannot be undone.`
                      : `Leave ${space.name}? You can join again with its code.`,
                  )
                  if (sure) void leave.run()
                },
              },
            ]}
          />
        </div>
      </div>
      {leave.error ? <ErrorState className="mx-8 mt-3">{leave.error}</ErrorState> : null}
      <PeopleDialog open={people} onOpenChange={setPeople} space={space} meId={meId} />
      {manager ? <SpaceDialog open={editing} onOpenChange={setEditing} space={space} /> : null}
    </div>
  )
}

function Browser({
  status,
  space,
  spaces,
  onLeft,
  initialItem,
}: {
  status: CommunityStatus
  space: Space | null
  spaces: Space[]
  onLeft: () => void
  initialItem?: string | null
}) {
  const [text, setText] = useState('')
  const query = useDeferredValue(text)
  const [kind, setKind] = useState<KindFilter>('all')
  const [subject, setSubject] = useState<string | null>(null)
  const [sort, setSort] = useState<'new' | 'top'>('new')
  const [mine, setMine] = useState(false)
  const [view, setView] = useSetting<'grid' | 'list'>('shared.view', 'grid')
  const [selected, setSelected] = useState<string | null>(initialItem ?? null)
  const [sharing, setSharing] = useState(false)

  const list = useLive(
    ['shared'],
    () =>
      call('shared:list', {
        spaceId: space?.id ?? null,
        text: query,
        kind: kind === 'all' ? null : kind,
        subject,
        sort,
        mine,
      }),
    [space?.id, query, kind, subject, sort, mine],
  )

  const data = list.data
  const used = data?.storageUsed ?? 0
  const writable = spaces.some((s) => canWrite(s.role))
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {space ? (
          <SpaceHero
            space={space}
            meId={status.userId}
            onShare={() => setSharing(true)}
            onLeft={onLeft}
          />
        ) : (
          <div className="flex shrink-0 items-start gap-4 px-8 pt-7">
            <div className="min-w-0 flex-1">
              <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">
                Everything shared with you
              </h1>
              <p className="mt-1 text-ink-2">
                Notes, files and flashcards from all your spaces. Remix anything into your own.
              </p>
            </div>
            {writable ? (
              <Button
                variant="primary"
                icon={<Share2 className="size-3.5" aria-hidden />}
                onClick={() => setSharing(true)}
              >
                Share
              </Button>
            ) : null}
          </div>
        )}

        <div className="shrink-0 px-8 pt-5">
          <label className="flex h-10 items-center gap-2.5 rounded-lg bg-sunken px-3 ring-1 ring-transparent ring-inset focus-within:bg-surface focus-within:ring-line-strong">
            <Search className="size-4 text-ink-3" aria-hidden />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={space ? `Search ${space.name}` : 'Search all your spaces'}
              aria-label="Search shared things"
              className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
            />
          </label>

          {data?.subjects.length ? (
            <div
              className="mt-3 flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Subject"
            >
              {[null, ...data.subjects].map((name) => (
                <button
                  key={name ?? 'all'}
                  type="button"
                  aria-pressed={subject === name}
                  onClick={() => setSubject(name)}
                  className={cn(
                    'h-7 rounded-full px-3 text-2xs ring-1 ring-line ring-inset hover:bg-hover',
                    subject === name && 'bg-accent text-accent-fg ring-accent hover:bg-accent',
                  )}
                >
                  {name ?? 'All subjects'}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-line pb-3">
            <Segmented
              label="Type"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'all', label: 'All' },
                { value: 'note', label: 'Notes' },
                { value: 'file', label: 'Files' },
                { value: 'deck', label: 'Flashcards' },
                { value: 'link', label: 'Links' },
              ]}
            />
            <Segmented
              label="Shelf"
              value={mine ? 'mine' : 'all'}
              onChange={(v) => setMine(v === 'mine')}
              options={[
                { value: 'all', label: 'Everyone' },
                { value: 'mine', label: 'Mine' },
              ]}
            />
            <div className="flex-1" />
            <Select
              aria-label="Sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as 'new' | 'top')}
              className="w-36"
            >
              <option value="new">Newest</option>
              <option value="top">Most helpful</option>
            </Select>
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                {
                  value: 'grid',
                  label: 'Cards',
                  icon: <LayoutGrid className="size-3.5" aria-hidden />,
                },
                { value: 'list', label: 'List', icon: <List className="size-3.5" aria-hidden /> },
              ]}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-5">
          {list.error ? (
            <ErrorState>{list.error}</ErrorState>
          ) : !data ? (
            <SkeletonList rows={5} />
          ) : data.items.length === 0 ? (
            <EmptyState
              eyebrow={space?.name ?? 'Shared'}
              title={
                query || kind !== 'all' || subject || mine
                  ? 'Nothing matches'
                  : 'Nothing shared yet'
              }
              art={<Mascot size={56} />}
              action={
                (space ? canWrite(space.role) : writable) ? (
                  <Button variant="primary" onClick={() => setSharing(true)}>
                    Share something
                  </Button>
                ) : undefined
              }
            >
              {space && !canWrite(space.role)
                ? 'You are a viewer here. What others share shows up here.'
                : 'Write a note, upload a file or share flashcards, and it shows up here for everyone in the space.'}
            </EmptyState>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {data.items.map((item) => (
                <GridCard
                  key={item.id}
                  item={item}
                  showSpace={!space}
                  active={selected === item.id}
                  onOpen={() => setSelected(item.id)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {data.items.map((item) => (
                <ListRow
                  key={item.id}
                  item={item}
                  showSpace={!space}
                  active={selected === item.id}
                  onOpen={() => setSelected(item.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex h-9 shrink-0 items-center gap-3 border-t border-line px-8 text-2xs text-ink-3">
          <span>
            {data?.items.length ?? 0} shared{space ? ` in ${space.name}` : ''}
          </span>
          <span aria-hidden>·</span>
          <span className="flex items-center gap-2">
            Files: {formatBytes(used)} of {formatBytes(SHARED_STORAGE_QUOTA)}
            <span className="h-1 w-24 overflow-hidden rounded-full bg-sunken">
              <span
                className={cn(
                  'block h-full rounded-full',
                  used / SHARED_STORAGE_QUOTA > 0.85 ? 'bg-warn' : 'bg-ink-3',
                )}
                style={{ width: `${Math.min(100, (used / SHARED_STORAGE_QUOTA) * 100)}%` }}
              />
            </span>
          </span>
        </div>
      </div>

      {selected ? (
        <SharedPreview
          id={selected}
          meId={status.userId}
          spaces={spaces}
          onClose={() => setSelected(null)}
        />
      ) : null}
      <ShareDialog
        open={sharing}
        onOpenChange={setSharing}
        spaces={spaces}
        defaultSpaceId={space?.id ?? null}
      />
    </div>
  )
}

function Meta({ item }: { item: SharedCard }) {
  return (
    <span className="flex items-center gap-2 text-2xs text-ink-3">
      <span className="truncate">{item.author}</span>
      <span aria-hidden>·</span>
      <span className="shrink-0">{timeAgo(item.createdAt)}</span>
      <span className="flex-1" />
      <span
        className={cn('flex shrink-0 items-center gap-1', item.myReaction === 1 && 'text-success')}
      >
        <ThumbsUp
          className="size-3"
          fill={item.myReaction === 1 ? 'currentColor' : 'none'}
          aria-hidden
        />
        {item.ups}
      </span>
    </span>
  )
}

function detail(item: SharedCard): string {
  if (item.kind === 'file') return item.fileSize ? formatBytes(item.fileSize) : 'File'
  if (item.kind === 'link') return item.linkUrl ? new URL(item.linkUrl).hostname : 'Link'
  if (item.kind === 'note') return `${Math.max(1, Math.round(item.bodyLength / 1500))} min read`
  return KIND_LABEL[item.kind]
}

function GridCard({
  item,
  active,
  showSpace,
  onOpen,
}: {
  item: SharedCard
  active: boolean
  showSpace: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active || undefined}
      className={cn(
        'flex h-[176px] flex-col rounded-xl border border-line bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm',
        active && 'border-blue-line ring-2 ring-blue-soft',
      )}
    >
      <div className="flex items-center gap-2.5">
        <KindIcon kind={item.kind} className="size-8" />
        <span className="min-w-0 truncate text-2xs text-ink-3">
          {showSpace ? `${item.spaceName} · ` : ''}
          {item.subject || KIND_LABEL[item.kind]} · {detail(item)}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 font-semibold text-ink">{item.title}</p>
      <p className="mt-1 line-clamp-2 flex-1 text-2xs text-ink-2">{item.description}</p>
      <Meta item={item} />
    </button>
  )
}

function ListRow({
  item,
  active,
  showSpace,
  onOpen,
}: {
  item: SharedCard
  active: boolean
  showSpace: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active || undefined}
      className={cn(
        'flex items-center gap-3 px-4 py-3 text-left hover:bg-hover',
        active && 'bg-blue-soft hover:bg-blue-soft',
      )}
    >
      <KindIcon kind={item.kind} className="size-8" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-ink">{item.title}</span>
        <span className="block truncate text-2xs text-ink-3">
          {showSpace ? `${item.spaceName} · ` : ''}
          {item.subject ? `${item.subject} · ` : ''}
          {KIND_LABEL[item.kind]} · {detail(item)}
        </span>
      </span>
      <span className="w-56 shrink-0">
        <Meta item={item} />
      </span>
    </button>
  )
}

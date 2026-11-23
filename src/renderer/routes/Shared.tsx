import { useDeferredValue, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  Bell,
  LayoutGrid,
  List,
  LogOut,
  Search,
  Share2,
  ShieldCheck,
  ThumbsUp,
  Users,
} from 'lucide-react'
import {
  MATERIALS,
  MATERIAL_LABELS,
  SHARED_STORAGE_QUOTA,
  canWrite,
  formatBytes,
  type CommunityStatus,
  type Material,
  type Profile,
  type SharedCard,
  type SharedKind,
  type Space,
} from '@shared/community'
import { UNITS } from '@shared/group-subjects'
import { Button, IconButton } from '@/design/Button'
import { Select } from '@/design/Form'
import { Menu } from '@/design/Menu'
import { Segmented } from '@/design/Segmented'
import { EmptyState, ErrorState, SkeletonList } from '@/design/States'
import { useToast } from '@/design/Toast'
import { AdminDialog } from '@/features/shared/AdminDialog'
import { EmailSignIn } from '@/features/shared/EmailSignIn'
import { InboxDialog } from '@/features/shared/InboxDialog'
import { KindIcon } from '@/features/shared/KindIcon'
import { KIND_LABEL, timeAgo } from '@/features/shared/kinds'
import { ShareDialog } from '@/features/shared/ShareDialog'
import { SharedPreview } from '@/features/shared/SharedPreview'
import { Avatar } from '@/features/shared/SpaceBits'
import { useSharedStatus } from '@/features/shared/useSharedStatus'
import { changed, useAction, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call, subscribe } from '@/lib/ipc'
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
              {s.access === 'removed'
                ? 'Access removed'
                : s.access === 'waitlisted'
                  ? 'Atlas is full'
                  : s.signedIn
                    ? 'Almost there'
                    : 'Share with friends'}
            </h1>
            <p className="mt-1.5 max-w-[42ch] text-ink-2">
              {s.access === 'removed'
                ? 'Ask the Atlas admin if you think this is a mistake.'
                : s.access === 'waitlisted'
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
  const [inbox, setInbox] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const signOut = useAction(async () => {
    await call('shared:signOut')
    changed('shared')
  })
  const [params, setParams] = useSearchParams()
  const item = params.get('item')
  // The sidebar's Admin link opens this with ?admin=1.
  const admin = adminOpen || params.get('admin') === '1'
  const setAdmin = (open: boolean): void => {
    setAdminOpen(open)
    if (!open && params.has('admin')) {
      const next = new URLSearchParams(params)
      next.delete('admin')
      setParams(next, { replace: true })
    }
  }
  const toolbar = (
    <>
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
            <Avatar profile={profile} size={28} />
          </button>
        }
        items={[
          {
            label: `@${profile.username}`,
            icon: <Users className="size-4" aria-hidden />,
            onSelect: () => toast({ title: profile.displayName, description: status.email ?? '' }),
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
    </>
  )
  return (
    <div className="flex h-full min-h-0">
      {spaces.error ? (
        <div className="p-8">
          <ErrorState>{spaces.error}</ErrorState>
        </div>
      ) : (
        <Browser
          key={item ?? ''}
          initialItem={item}
          status={status}
          spaces={spaces.data ?? []}
          toolbar={toolbar}
        />
      )}
      <InboxDialog
        open={inbox}
        onOpenChange={setInbox}
        onOpenSpace={() => setInbox(false)}
        onOpenAdmin={() => {
          setInbox(false)
          setAdmin(true)
        }}
      />
      {status.isAdmin ? <AdminDialog open={admin} onOpenChange={setAdmin} status={status} /> : null}
    </div>
  )
}

function Browser({
  status,
  spaces,
  toolbar,
  initialItem,
}: {
  status: CommunityStatus
  spaces: Space[]
  toolbar: ReactNode
  initialItem?: string | null
}) {
  const [text, setText] = useState('')
  const query = useDeferredValue(text)
  const [kind, setKind] = useState<KindFilter>('all')
  const [subject, setSubject] = useState<string | null>(null)
  const [sort, setSort] = useState<'new' | 'top'>('new')
  const [mine, setMine] = useState(false)
  const [unit, setUnit] = useState<number | null>(null)
  const [material, setMaterial] = useState<Material | null>(null)
  const [teacher, setTeacher] = useState<string | null>(null)
  // An AI summary written in the background: refresh the list and any open preview.
  useEffect(() => subscribe('shared:changed', () => changed('shared')), [])
  const [view, setView] = useSetting<'grid' | 'list'>('shared.view', 'grid')
  const [selected, setSelected] = useState<string | null>(initialItem ?? null)
  const [sharing, setSharing] = useState(false)

  const list = useLive(
    ['shared'],
    () =>
      call('shared:list', {
        spaceId: null,
        text: query,
        kind: kind === 'all' ? null : kind,
        subject,
        sort,
        mine,
        unit,
        material,
        teacher,
      }),
    [query, kind, subject, sort, mine, unit, material, teacher],
  )

  const data = list.data
  const used = data?.storageUsed ?? 0
  const writable = spaces.some((s) => canWrite(s.role))
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-start gap-4 px-8 pt-7">
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">
              The Atlas library
            </h1>
            <p className="mt-1 text-ink-2">
              Everything everyone has shared: notes, files, flashcards and lessons. Open to all.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {toolbar}
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
        </div>

        <div className="shrink-0 px-8 pt-5">
          <label className="flex h-10 items-center gap-2.5 rounded-lg bg-sunken px-3 ring-1 ring-transparent ring-inset focus-within:bg-surface focus-within:ring-line-strong">
            <Search className="size-4 text-ink-3" aria-hidden />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search the library"
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
                { value: 'lesson', label: 'Lessons' },
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
            <Select
              aria-label="Unit"
              value={unit ?? ''}
              onChange={(e) => setUnit(e.target.value ? Number(e.target.value) : null)}
              className="w-28"
            >
              <option value="">All units</option>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  Unit {u}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Type of material"
              value={material ?? ''}
              onChange={(e) => setMaterial((e.target.value || null) as Material | null)}
              className="w-36"
            >
              <option value="">Any material</option>
              {MATERIALS.map((m) => (
                <option key={m} value={m}>
                  {MATERIAL_LABELS[m]}
                </option>
              ))}
            </Select>
            {data?.teachers.length ? (
              <Select
                aria-label="Teacher"
                value={teacher ?? ''}
                onChange={(e) => setTeacher(e.target.value || null)}
                className="w-36"
              >
                <option value="">Any teacher</option>
                {data.teachers.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            ) : null}
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
              eyebrow="Library"
              title={
                query || kind !== 'all' || subject || mine
                  ? 'Nothing matches'
                  : 'Nothing shared yet'
              }
              art={<Mascot size={56} />}
              action={
                writable ? (
                  <Button variant="primary" onClick={() => setSharing(true)}>
                    Share something
                  </Button>
                ) : undefined
              }
            >
              Write a note, upload a file or share flashcards, and it shows up here for everyone.
            </EmptyState>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {data.items.map((item) => (
                <GridCard
                  key={item.id}
                  item={item}
                  showSpace={false}
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
                  showSpace={false}
                  active={selected === item.id}
                  onOpen={() => setSelected(item.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex h-9 shrink-0 items-center gap-3 border-t border-line px-8 text-2xs text-ink-3">
          <span>{data?.items.length ?? 0} shared</span>
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
        defaultSpaceId={null}
        teachers={data?.teachers ?? []}
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

/** Units, material and teacher as small chips under the title. */
function Badges({ item }: { item: SharedCard }) {
  const chips = [
    item.units.length ? item.units.map((u) => `U${u}`).join(' ') : null,
    item.material !== 'other' && item.material !== 'notes' && item.material !== 'flashcards'
      ? MATERIAL_LABELS[item.material]
      : null,
    item.teacher || null,
    item.aiPending ? 'AI filling in…' : item.aiSummary ? 'AI summary' : null,
  ].filter((c): c is string => Boolean(c))
  if (chips.length === 0) return null
  return (
    <span className="mt-1.5 flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c} className="rounded bg-sunken px-1.5 py-0.5 text-[0.6875rem] text-ink-2">
          {c}
        </span>
      ))}
    </span>
  )
}

function plainSummary(md: string): string {
  return md
    .replace(/^[-*]\s+/gm, '')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function detail(item: SharedCard): string {
  if (item.kind === 'file') return item.fileSize ? formatBytes(item.fileSize) : 'File'
  if (item.kind === 'link') return item.linkUrl ? new URL(item.linkUrl).hostname : 'Link'
  if (item.kind === 'note') return `${Math.max(1, Math.round(item.bodyLength / 1500))} min read`
  if (item.kind === 'lesson') return 'Explainer lesson'
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
      <Badges item={item} />
      <p className="mt-1 line-clamp-2 flex-1 text-2xs text-ink-2">
        {item.description || plainSummary(item.aiSummary)}
      </p>
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

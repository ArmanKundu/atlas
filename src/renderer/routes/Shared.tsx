import { useDeferredValue, useState } from 'react'
import { Heart, LayoutGrid, List, LogOut, Plus, Search } from 'lucide-react'
import {
  SHARED_STORAGE_QUOTA,
  formatBytes,
  type CommunityStatus,
  type SharedCard,
  type SharedKind,
} from '@shared/community'
import { Button, IconButton } from '@/design/Button'
import { Select } from '@/design/Form'
import { Segmented } from '@/design/Segmented'
import { EmptyState, ErrorState, SkeletonList } from '@/design/States'
import { KindIcon } from '@/features/shared/KindIcon'
import { KIND_LABEL, timeAgo } from '@/features/shared/kinds'
import { ShareDialog } from '@/features/shared/ShareDialog'
import { SharedJoin, SharedSignIn } from '@/features/shared/SharedGate'
import { SharedPreview } from '@/features/shared/SharedPreview'
import { changed, useAction, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { useSetting } from '@/lib/settings'
import { Mascot } from '@/mascot/Mascot'

type KindFilter = SharedKind | 'all'
type Shelf = 'all' | 'mine' | 'liked'

/** The group's shared library: browse, preview, remix and share. */
export function Shared() {
  const status = useLive(['shared'], () => call('shared:status'))
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
        <EmptyState eyebrow="Shared library" title="Not connected yet" art={<Mascot size={64} />}>
          The shared library needs its online home set up once. After the next update, sign in here
          to share notes, files and flashcards with your group.
        </EmptyState>
      </div>
    )
  }
  if (!s.signedIn) return <SharedSignIn />
  if (!s.member) return <SharedJoin status={s} />
  return <Browser status={s} />
}

function Browser({ status }: { status: CommunityStatus }) {
  const [text, setText] = useState('')
  const query = useDeferredValue(text)
  const [kind, setKind] = useState<KindFilter>('all')
  const [subject, setSubject] = useState<string | null>(null)
  const [sort, setSort] = useState<'new' | 'popular'>('new')
  const [shelf, setShelf] = useState<Shelf>('all')
  const [view, setView] = useSetting<'grid' | 'list'>('shared.view', 'grid')
  const [selected, setSelected] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  const list = useLive(
    ['shared'],
    () =>
      call('shared:list', {
        text: query,
        kind: kind === 'all' ? null : kind,
        subject,
        sort,
        mine: shelf === 'mine',
        liked: shelf === 'liked',
      }),
    [query, kind, subject, sort, shelf],
  )
  const signOut = useAction(async () => {
    await call('shared:signOut')
    changed('shared')
  })

  const data = list.data
  const used = data?.storageUsed ?? 0
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 px-8 pt-7">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-[1.5rem] font-semibold tracking-[-0.02em] text-ink">
                Shared library
              </h1>
              <p className="mt-1 text-ink-2">
                Notes, files and flashcards from your group. Remix anything into your own.
              </p>
            </div>
            <IconButton
              label={`Sign out (${status.email ?? ''})`}
              onClick={() => void signOut.run()}
            >
              <LogOut className="size-4" aria-hidden />
            </IconButton>
            <Button
              variant="primary"
              icon={<Plus className="size-4" aria-hidden />}
              onClick={() => setSharing(true)}
            >
              Share
            </Button>
          </div>

          <label className="mt-5 flex h-10 items-center gap-2.5 rounded-lg bg-sunken px-3 ring-1 ring-transparent ring-inset focus-within:bg-surface focus-within:ring-line-strong">
            <Search className="size-4 text-ink-3" aria-hidden />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search notes, files and flashcards"
              aria-label="Search the shared library"
              className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
            />
          </label>

          <div
            className="mt-3 flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Subject"
          >
            {[null, ...(data?.subjects ?? [])].map((name) => (
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
              value={shelf}
              onChange={setShelf}
              options={[
                { value: 'all', label: 'Everyone' },
                { value: 'mine', label: 'Mine' },
                { value: 'liked', label: 'Liked' },
              ]}
            />
            <div className="flex-1" />
            <Select
              aria-label="Sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as 'new' | 'popular')}
              className="w-32"
            >
              <option value="new">Newest</option>
              <option value="popular">Most liked</option>
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
              eyebrow="Shared library"
              title={
                query || kind !== 'all' || subject || shelf !== 'all'
                  ? 'Nothing matches'
                  : 'Nothing shared yet'
              }
              art={<Mascot size={56} />}
              action={
                <Button variant="primary" onClick={() => setSharing(true)}>
                  Share something
                </Button>
              }
            >
              Share a note, a file or a set of flashcards and it shows up here for everyone.
            </EmptyState>
          ) : view === 'grid' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {data.items.map((item) => (
                <GridCard
                  key={item.id}
                  item={item}
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
                  active={selected === item.id}
                  onOpen={() => setSelected(item.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex h-9 shrink-0 items-center gap-3 border-t border-line px-8 text-2xs text-ink-3">
          <span>
            {data?.members ?? 0} {data?.members === 1 ? 'member' : 'members'}
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
        <SharedPreview id={selected} meId={status.userId} onClose={() => setSelected(null)} />
      ) : null}
      <ShareDialog open={sharing} onOpenChange={setSharing} />
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
      <span className="flex shrink-0 items-center gap-1">
        <Heart className={cn('size-3', item.liked && 'fill-danger text-danger')} aria-hidden />
        {item.likes}
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
  onOpen,
}: {
  item: SharedCard
  active: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active || undefined}
      className={cn(
        'flex h-[168px] flex-col rounded-xl border border-line bg-surface p-4 text-left transition-shadow hover:shadow-sm',
        active && 'border-blue-line ring-2 ring-blue-soft',
      )}
    >
      <div className="flex items-center gap-2.5">
        <KindIcon kind={item.kind} className="size-8" />
        <span className="min-w-0 truncate text-2xs text-ink-3">
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
  onOpen,
}: {
  item: SharedCard
  active: boolean
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

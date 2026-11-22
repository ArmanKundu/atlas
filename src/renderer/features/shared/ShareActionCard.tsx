import { useState } from 'react'
import { Link } from 'react-router'
import { Check, Share2 } from 'lucide-react'
import { canWrite, type SharedCard, type SharedKind } from '@shared/community'
import { Button } from '@/design/Button'
import { changed, db, useAction, useLive } from '@/lib/api'
import { call } from '@/lib/ipc'
import { KindIcon } from './KindIcon'

interface Proposal {
  space?: string
  kind?: string
  title?: string
  body?: string
  note?: string
  file?: string
  url?: string
  subject?: string
  description?: string
  tags?: unknown
}

function parse(code: string): Proposal | null {
  try {
    const value = JSON.parse(code) as unknown
    return value && typeof value === 'object' ? (value as Proposal) : null
  } catch {
    return null
  }
}

const same = (a: unknown, b: string | undefined): boolean =>
  typeof a === 'string' && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * What the assistant proposes to share, as a card. Nothing is shared until the student
 * confirms it is theirs to share and presses Share.
 */
export function ShareActionCard({ code }: { code: string }) {
  const proposal = parse(code)
  const [ownWork, setOwnWork] = useState(false)
  const [done, setDone] = useState<SharedCard | null>(null)
  const spaces = useLive(['shared'], () => call('shared:spaces').catch(() => []))
  const notes = useLive(['notes'], () => db.list('notes'))
  const sources = useLive(['sources'], () => db.list('sources'))

  const kind = (
    ['note', 'file', 'link'].includes(proposal?.kind ?? '') ? proposal?.kind : 'note'
  ) as SharedKind
  const space = (spaces.data ?? []).find((s) => same(s.name, proposal?.space))
  const writable = (spaces.data ?? []).filter((s) => canWrite(s.role))
  const target = space && canWrite(space.role) ? space : writable[0]
  const note = proposal?.note ? notes.data?.find((n) => same(n.title, proposal.note)) : undefined
  const file = proposal?.file
    ? sources.data?.find((s) => same(s['title'], proposal.file))
    : undefined
  const title =
    proposal?.title ?? note?.title ?? (file ? String(file['title']) : undefined) ?? 'Untitled'

  const share = useAction(async () => {
    if (!target || !proposal) return
    const meta = {
      spaceId: target.id,
      title,
      description: proposal.description ?? '',
      subject: proposal.subject ?? '',
      tags: Array.isArray(proposal.tags)
        ? proposal.tags.filter((t): t is string => typeof t === 'string').slice(0, 12)
        : [],
    }
    const card =
      kind === 'link'
        ? await call('shared:publish', { kind: 'link', url: proposal.url ?? '', ...meta })
        : kind === 'file'
          ? await call('shared:publish', {
              kind: 'file',
              sourceId: file ? String(file['id']) : null,
              ...meta,
            })
          : await call('shared:publish', {
              kind: 'note',
              noteId: note?.id ?? null,
              body: proposal.body ?? '',
              ...meta,
            })
    changed('shared')
    setDone(card)
  })

  if (!proposal) return <pre className="text-2xs text-ink-3">{code}</pre>

  const problem = !spaces.data
    ? null
    : !target
      ? 'You cannot share into any space yet. Create one on the Shared page.'
      : kind === 'file' && !file
        ? `No file called “${proposal.file ?? ''}” in your library.`
        : kind === 'note' && proposal.note && !note
          ? `No note called “${proposal.note}”.`
          : kind === 'note' && !proposal.note && !proposal.body?.trim()
            ? 'The note is empty.'
            : kind === 'link' && !/^https:\/\/\S+$/.test(proposal.url ?? '')
              ? 'The link must start with https://'
              : null

  return (
    <div className="my-2 rounded-xl border border-line bg-surface p-4 not-prose">
      <div className="flex items-start gap-3">
        <KindIcon kind={kind} />
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-medium tracking-wide text-ink-3 uppercase">
            Share to {target?.name ?? proposal.space ?? 'a space'}
          </p>
          <p className="mt-0.5 font-semibold text-ink">{title}</p>
          {kind === 'note' && proposal.body ? (
            <p className="mt-1 line-clamp-3 text-2xs whitespace-pre-wrap text-ink-2">
              {proposal.body}
            </p>
          ) : kind === 'link' ? (
            <p className="mt-1 truncate text-2xs text-ink-2">{proposal.url}</p>
          ) : null}
        </div>
      </div>
      {done ? (
        <div className="mt-3 flex items-center gap-2 text-success">
          <Check className="size-4" aria-hidden />
          <span className="flex-1 font-medium">Shared to {done.spaceName}</span>
          <Link to={`/shared?item=${done.id}`} className="text-blue hover:underline">
            Open
          </Link>
        </div>
      ) : problem ? (
        <p className="mt-3 text-2xs text-danger">{problem}</p>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <label className="flex flex-1 items-start gap-2 text-2xs text-ink-2">
            <input
              type="checkbox"
              className="mt-0.5 size-3.5 accent-[var(--color-accent)]"
              checked={ownWork}
              onChange={(e) => setOwnWork(e.target.checked)}
            />
            My own work, or free to share
          </label>
          <Button
            size="sm"
            variant="primary"
            disabled={!ownWork || share.pending || !target}
            icon={<Share2 className="size-3.5" aria-hidden />}
            onClick={() => void share.run()}
          >
            {share.pending ? 'Sharing…' : 'Share'}
          </Button>
        </div>
      )}
      {share.error ? <p className="mt-2 text-2xs text-danger">{share.error}</p> : null}
    </div>
  )
}

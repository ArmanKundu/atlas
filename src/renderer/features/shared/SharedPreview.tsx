import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Download, ExternalLink, Pencil, Repeat2, Sparkles, Trash2, X } from 'lucide-react'
import { MATERIAL_LABELS, formatBytes, type SharedItem, type Space } from '@shared/community'
import { Button, IconButton } from '@/design/Button'
import { Badge } from '@/design/Form'
import { Markdown } from '@/design/Markdown'
import { ErrorState, SkeletonList } from '@/design/States'
import { useToast } from '@/design/Toast'
import { changed, useAction, useLive } from '@/lib/api'
import { call } from '@/lib/ipc'
import { KindIcon } from './KindIcon'
import { KIND_LABEL, timeAgo } from './kinds'
import { EditItemDialog } from './EditItemDialog'
import { Reactions } from './Reactions'
import { ShareDialog } from './ShareDialog'

const REMIX_LABEL = {
  note: 'Copy to my notes',
  file: 'Save to my library',
  deck: 'Add to my flashcards',
  link: 'Open link',
} as const

/** The right-hand panel: the full item, with reactions, Remix and (if allowed) Edit and Remove. */
export function SharedPreview({
  id,
  meId,
  spaces,
  onClose,
}: {
  id: string
  meId: string | null
  spaces: Space[]
  onClose: () => void
}) {
  const toast = useToast()
  const navigate = useNavigate()
  const item = useLive(['shared', `shared:${id}`], () => call('shared:get', { id }), [id])
  const [sharingBack, setSharingBack] = useState(false)
  const [editing, setEditing] = useState(false)

  const react = useAction(async (it: SharedItem, value: -1 | 0 | 1) => {
    await call('shared:react', { id: it.id, value })
    changed('shared')
  })
  const remix = useAction(async (it: SharedItem) => {
    if (it.kind === 'link' && it.linkUrl) {
      await call('shared:remix', { id: it.id })
      await call('shell:openWeb', { url: it.linkUrl })
      return
    }
    const result = await call('shared:remix', { id: it.id })
    changed('shared', 'notes', 'flashcards', 'sources')
    if (result.kind === 'note' && result.id) {
      toast({
        title: 'Copied to your notes',
        description: 'It is yours now: edit it however you like.',
        tone: 'success',
        action: { label: 'Open', onSelect: () => void navigate('/notes') },
      })
    } else if (result.kind === 'flashcards') {
      toast({ title: `Added ${result.count} flashcards`, tone: 'success' })
    } else if (result.kind === 'source' && result.id) {
      const sourceId = result.id
      toast({
        title: 'Saved to your library',
        tone: 'success',
        action: { label: 'Open', onSelect: () => void navigate(`/viewer/${sourceId}`) },
      })
    }
  })
  const remove = useAction(async (it: SharedItem) => {
    await call('shared:remove', { id: it.id })
    changed('shared')
    onClose()
  })

  const it = item.data
  return (
    <aside
      aria-label="Shared item"
      className="flex w-[420px] shrink-0 flex-col border-l border-line bg-surface"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
        <p className="flex-1 text-2xs font-medium tracking-wide text-ink-3 uppercase">
          {it ? KIND_LABEL[it.kind] : 'Loading'}
        </p>
        <IconButton label="Close preview" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </IconButton>
      </div>
      {item.error ? (
        <div className="p-4">
          <ErrorState>{item.error}</ErrorState>
        </div>
      ) : !it ? (
        <div className="p-4">
          <SkeletonList rows={3} />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="flex items-start gap-3">
              <KindIcon kind={it.kind} />
              <div className="min-w-0">
                <h2 className="text-[1.125rem] leading-snug font-semibold tracking-[-0.01em] text-ink">
                  {it.title}
                </h2>
                <p className="mt-1 text-ink-3">
                  {it.author} · {it.spaceName} · {timeAgo(it.createdAt)}
                  {it.subject ? ` · ${it.subject}` : ''}
                </p>
              </div>
            </div>
            {it.remixOfTitle ? (
              <p className="mt-3 flex items-center gap-1.5 text-2xs text-ink-3">
                <Repeat2 className="size-3.5" aria-hidden /> A remix of “{it.remixOfTitle}”
              </p>
            ) : null}
            {it.tags.length || it.units.length || it.teacher || it.material !== 'other' ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {it.units.map((u) => (
                  <Badge key={`u${u}`}>Unit {u}</Badge>
                ))}
                {it.material !== 'other' ? <Badge>{MATERIAL_LABELS[it.material]}</Badge> : null}
                {it.teacher ? <Badge>{it.teacher}</Badge> : null}
                {it.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            ) : null}
            {it.description ? <p className="mt-4 text-ink-2">{it.description}</p> : null}
            <p className="mt-4 flex gap-4 text-2xs text-ink-3">
              <span>{it.downloads} saves</span>
              <span>{it.remixes} remixes</span>
            </p>

            {it.aiSummary ? (
              <section className="mt-5 rounded-lg bg-sunken px-4 py-3">
                <h3 className="flex items-center gap-1.5 text-2xs font-semibold text-ink-2">
                  <Sparkles className="size-3.5" aria-hidden />
                  AI summary{it.aiBy ? ` · by ${it.aiBy}` : ''}
                </h3>
                <div className="prose-atlas mt-1.5 text-ink">
                  <Markdown>{it.aiSummary}</Markdown>
                </div>
              </section>
            ) : null}
            <div className="mt-5 border-t border-line pt-5">
              {it.kind === 'note' ? (
                <div className="prose-atlas text-ink">
                  <Markdown>{it.body || '_Empty note._'}</Markdown>
                </div>
              ) : it.kind === 'deck' ? (
                <DeckPreview body={it.body} />
              ) : it.kind === 'file' ? (
                <div className="rounded-lg bg-sunken px-4 py-3">
                  <p className="font-medium text-ink">{it.fileName}</p>
                  <p className="mt-0.5 text-ink-3">
                    {it.fileSize ? formatBytes(it.fileSize) : ''} · Save it to read, search and
                    annotate it in your library.
                  </p>
                  {it.aiText ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-2xs font-semibold text-ink-2">
                        Text version (written by AI from the file)
                      </summary>
                      <div className="prose-atlas mt-2 max-h-[28rem] overflow-y-auto text-ink">
                        <Markdown>{it.aiText}</Markdown>
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : (
                <p className="truncate rounded-lg bg-sunken px-4 py-3 text-ink-2">{it.linkUrl}</p>
              )}
            </div>
            {it.updatedAt !== it.createdAt ? (
              <p className="mt-1 text-2xs text-ink-3">Edited {timeAgo(it.updatedAt)}</p>
            ) : null}
            {remix.error || react.error || remove.error ? (
              <ErrorState className="mt-4">{remix.error ?? react.error ?? remove.error}</ErrorState>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3">
            <Reactions
              ups={it.ups}
              downs={it.downs}
              mine={it.myReaction}
              disabled={react.pending}
              onReact={(value) => void react.run(it, value)}
            />
            {it.canEdit ? (
              <>
                <IconButton label="Edit" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" aria-hidden />
                </IconButton>
                <IconButton label="Remove from the space" onClick={() => void remove.run(it)}>
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </>
            ) : null}
            <div className="flex-1" />
            {it.kind === 'note' && it.owner !== meId ? (
              <Button size="sm" onClick={() => setSharingBack(true)}>
                Share my version
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="primary"
              disabled={remix.pending}
              icon={
                it.kind === 'link' ? (
                  <ExternalLink className="size-3.5" aria-hidden />
                ) : (
                  <Download className="size-3.5" aria-hidden />
                )
              }
              onClick={() => void remix.run(it)}
            >
              {remix.pending ? 'Saving…' : REMIX_LABEL[it.kind]}
            </Button>
          </div>
          <ShareDialog
            open={sharingBack}
            onOpenChange={setSharingBack}
            spaces={spaces}
            remixOf={{ id: it.id, title: it.title, spaceId: it.spaceId }}
          />
          {it.canEdit ? (
            <EditItemDialog open={editing} onOpenChange={setEditing} item={it} />
          ) : null}
        </>
      )}
    </aside>
  )
}

function DeckPreview({ body }: { body: string }) {
  let cards: { front: string; back: string }[] = []
  try {
    cards = JSON.parse(body) as typeof cards
  } catch {
    cards = []
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-3">
        {cards.length} {cards.length === 1 ? 'card' : 'cards'}
      </p>
      {cards.slice(0, 30).map((c, i) => (
        <div key={i} className="rounded-lg border border-line px-3 py-2.5">
          <div className="text-ink">
            <Markdown>{c.front}</Markdown>
          </div>
          <div className="mt-1.5 border-t border-dashed border-line pt-1.5 text-ink-2">
            <Markdown>{c.back}</Markdown>
          </div>
        </div>
      ))}
      {cards.length > 30 ? <p className="text-ink-3">and {cards.length - 30} more</p> : null}
    </div>
  )
}

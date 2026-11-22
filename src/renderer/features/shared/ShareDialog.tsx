import { useMemo, useState } from 'react'
import { SHARED_FILE_LIMIT, formatBytes, type SharedKind } from '@shared/community'
import type { Source } from '@shared/models'
import { Button } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Field, Input, Select, Textarea } from '@/design/Form'
import { Segmented } from '@/design/Segmented'
import { ErrorState } from '@/design/States'
import { useToast } from '@/design/Toast'
import { changed, db, useAction, useLive } from '@/lib/api'
import { useSubjects } from '@/lib/app-state'
import { call } from '@/lib/ipc'

const KIND_OPTIONS: { value: SharedKind; label: string }[] = [
  { value: 'note', label: 'Note' },
  { value: 'file', label: 'File' },
  { value: 'deck', label: 'Flashcards' },
  { value: 'link', label: 'Link' },
]

/**
 * Share a note, a library file, a subject's flashcards or a link with the group. Everything is
 * copied up at the moment of sharing; later edits on this laptop stay here.
 */
export function ShareDialog({
  open,
  onOpenChange,
  remixOf,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Set when sharing back an improved version of something from the library. */
  remixOf?: { id: string; title: string } | null
}) {
  const toast = useToast()
  const subjects = useSubjects()
  const [kind, setKind] = useState<SharedKind>('note')
  const [pick, setPick] = useState('')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('')
  const [tags, setTags] = useState('')
  const [ownWork, setOwnWork] = useState(false)

  const notes = useLive(['notes'], () => db.list('notes', { orderBy: 'updatedAt', desc: true }), [])
  const sources = useLive(
    ['sources'],
    () => db.list('sources', { orderBy: 'createdAt', desc: true }) as Promise<Source[]>,
    [],
  )
  const cards = useLive(['flashcards'], () => db.list('flashcards'), [])
  const subjectName = (id: string | null): string => subjects.find((s) => s.id === id)?.name ?? ''

  const deckCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of cards.data ?? []) {
      const key = c.subjectId ?? 'none'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [cards.data])

  const choose = (value: string): void => {
    setPick(value)
    if (kind === 'note') {
      const n = notes.data?.find((x) => x.id === value)
      if (n) {
        setTitle(n.title)
        setSubject(subjectName(n.subjectId))
      }
    } else if (kind === 'file') {
      const s = sources.data?.find((x) => x.id === value)
      if (s) {
        setTitle(s.title)
        setSubject(subjectName(s.subjectId))
      }
    } else if (kind === 'deck') {
      const name = value === 'none' ? '' : subjectName(value)
      setTitle(name ? `${name} flashcards` : 'Flashcards')
      setSubject(name)
    }
  }

  const reset = (): void => {
    setPick('')
    setUrl('')
    setTitle('')
    setDescription('')
    setTags('')
    setOwnWork(false)
  }

  const chosenSource = kind === 'file' ? sources.data?.find((s) => s.id === pick) : undefined
  const tooBig = (chosenSource?.size ?? 0) > SHARED_FILE_LIMIT

  const publish = useAction(async () => {
    const meta = {
      title: title.trim(),
      description,
      subject,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12),
      remixOf: remixOf?.id ?? null,
    }
    if (kind === 'note') await call('shared:publish', { kind, noteId: pick, ...meta })
    else if (kind === 'file') await call('shared:publish', { kind, sourceId: pick, ...meta })
    else if (kind === 'link') await call('shared:publish', { kind, url: url.trim(), ...meta })
    else {
      const ids = (cards.data ?? [])
        .filter((c) => (c.subjectId ?? 'none') === pick)
        .map((c) => c.id)
      await call('shared:publish', { kind, flashcardIds: ids, ...meta })
    }
    changed('shared')
    toast({ title: 'Shared with the library', tone: 'success' })
    reset()
    onOpenChange(false)
  })

  const ready =
    ownWork &&
    title.trim().length > 0 &&
    !tooBig &&
    (kind === 'link' ? /^https:\/\/\S+$/.test(url.trim()) : Boolean(pick))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset()
          publish.clear()
        }
        onOpenChange(next)
      }}
      title={remixOf ? `Share your version of “${remixOf.title}”` : 'Share with the library'}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ready || publish.pending}
            onClick={() => void publish.run()}
          >
            {publish.pending ? 'Sharing…' : 'Share'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          label="What to share"
          value={kind}
          onChange={(k) => {
            setKind(k)
            setPick('')
            setTitle('')
          }}
          options={KIND_OPTIONS}
        />

        {kind === 'note' ? (
          <Field label="Note">
            <Select value={pick} onChange={(e) => choose(e.target.value)}>
              <option value="">Choose a note…</option>
              {(notes.data ?? []).map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </Select>
          </Field>
        ) : kind === 'file' ? (
          <Field
            label="File from your library"
            hint={
              tooBig
                ? `This file is ${formatBytes(chosenSource?.size ?? 0)}. Files up to ${formatBytes(SHARED_FILE_LIMIT)} fit; share bigger ones as a link (Google Drive, OneDrive).`
                : `Up to ${formatBytes(SHARED_FILE_LIMIT)} each. A file someone already shared is stored once.`
            }
          >
            <Select value={pick} onChange={(e) => choose(e.target.value)}>
              <option value="">Choose a file…</option>
              {(sources.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.size ? ` (${formatBytes(s.size)})` : ''}
                </option>
              ))}
            </Select>
          </Field>
        ) : kind === 'deck' ? (
          <Field label="Flashcards from">
            <Select value={pick} onChange={(e) => choose(e.target.value)}>
              <option value="">Choose a subject…</option>
              {[...deckCounts.entries()].map(([key, count]) => (
                <option key={key} value={key}>
                  {key === 'none' ? 'No subject' : subjectName(key) || 'Archived subject'} ({count}{' '}
                  {count === 1 ? 'card' : 'cards'})
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Link" hint="A Google Drive, OneDrive or website link. Starts with https://">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              inputMode="url"
            />
          </Field>
        )}

        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              list="shared-subjects"
              maxLength={80}
            />
            <datalist id="shared-subjects">
              {subjects.map((s) => (
                <option key={s.id} value={s.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Tags" hint="Comma separated">
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Unit 3, SAC"
            />
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            placeholder="What's in it, and who it helps"
          />
        </Field>
        <label className="flex items-start gap-2.5 text-ink-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-accent)]"
            checked={ownWork}
            onChange={(e) => setOwnWork(e.target.checked)}
          />
          <span>This is my own work, or it is free to share. No textbooks or paid resources.</span>
        </label>
        {publish.error ? <ErrorState title="Not shared">{publish.error}</ErrorState> : null}
      </div>
    </Dialog>
  )
}

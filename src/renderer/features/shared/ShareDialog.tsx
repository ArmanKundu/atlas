import { useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  FileUp,
  Layers,
  Library,
  Link2,
  Sparkles,
  NotebookText,
  PenLine,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import {
  MATERIALS,
  MATERIAL_LABELS,
  SHARED_FILE_LIMIT,
  canWrite,
  formatBytes,
  guessMaterial,
  type Material,
  type PickedFile,
  type Space,
} from '@shared/community'
import { GROUP_SUBJECTS, UNITS, groupSubjectFor, type Unit } from '@shared/group-subjects'
import type { Source } from '@shared/models'
import { Button } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Field, Input, Select, Textarea } from '@/design/Form'
import { Markdown } from '@/design/Markdown'
import { Segmented } from '@/design/Segmented'
import { ErrorState } from '@/design/States'
import { useToast } from '@/design/Toast'
import { changed, db, useAction, useLive } from '@/lib/api'
import { useSubjects } from '@/lib/app-state'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'

type Mode = 'write' | 'upload' | 'note' | 'library' | 'deck' | 'link'

const MODES: { id: Mode; label: string; hint: string; Icon: LucideIcon }[] = [
  { id: 'write', label: 'Write a note', hint: 'Type it here, with Markdown', Icon: PenLine },
  { id: 'upload', label: 'Upload a file', hint: 'PDF, slides, docs, images', Icon: Upload },
  { id: 'note', label: 'One of my notes', hint: 'From Notes in Atlas', Icon: NotebookText },
  { id: 'library', label: 'From my library', hint: 'A file you imported', Icon: Library },
  { id: 'deck', label: 'Flashcards', hint: 'A subject’s cards', Icon: Layers },
  { id: 'link', label: 'A link', hint: 'Google Drive, OneDrive, a site', Icon: Link2 },
]

export function Dropzone({
  file,
  onFile,
  onError,
}: {
  file: PickedFile | null
  onFile: (file: PickedFile) => void
  onError: (message: string) => void
}) {
  const [over, setOver] = useState(false)
  const take = async (picked: Promise<PickedFile | null>): Promise<void> => {
    try {
      const f = await picked
      if (f) onFile(f)
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const tooBig = (file?.size ?? 0) > SHARED_FILE_LIMIT
  return (
    <button
      type="button"
      onClick={() => void take(call('shared:pickFile'))}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const dropped = e.dataTransfer.files[0]
        if (dropped) {
          void take(call('shared:describeFile', { path: window.atlas.pathForFile(dropped) }))
        }
      }}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-6 py-8 text-center transition-colors hover:bg-hover',
        over && 'border-blue bg-blue-soft',
        file && !tooBig && 'border-solid border-success bg-success-soft/50',
        tooBig && 'border-solid border-danger bg-danger-soft/50',
      )}
    >
      <FileUp className={cn('size-7 text-ink-3', file && 'text-ink')} aria-hidden />
      {file ? (
        <>
          <span className="max-w-full truncate font-medium text-ink">{file.name}</span>
          <span className={cn('text-2xs', tooBig ? 'text-danger' : 'text-ink-3')}>
            {formatBytes(file.size)}
            {tooBig
              ? ` · too big. Files up to ${formatBytes(SHARED_FILE_LIMIT)} fit; share bigger ones as a link.`
              : ' · click to choose another'}
          </span>
        </>
      ) : (
        <>
          <span className="font-medium text-ink">Drop a file here, or click to choose</span>
          <span className="text-2xs text-ink-3">Up to {formatBytes(SHARED_FILE_LIMIT)}</span>
        </>
      )}
    </button>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex gap-3">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-2xs text-accent-fg">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="mb-2 font-semibold text-ink">{title}</h3>
        {children}
      </div>
    </section>
  )
}

/**
 * Share something into a space. Step one picks what; step two fills it in. Everything is copied
 * up at the moment of sharing; later edits on this laptop stay here (edit the shared copy from
 * its preview).
 */
export function ShareDialog({
  open,
  onOpenChange,
  spaces,
  defaultSpaceId,
  remixOf,
  teachers = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  spaces: Space[]
  defaultSpaceId?: string | null
  /** Set when sharing back an improved version of something from a space. */
  remixOf?: { id: string; title: string; spaceId: string } | null
  /** Teachers already used in the library, offered as suggestions. */
  teachers?: string[]
}) {
  const toast = useToast()
  const subjects = useSubjects()
  const writable = spaces.filter((s) => canWrite(s.role))
  const [mode, setMode] = useState<Mode | null>(null)
  const [spaceId, setSpaceId] = useState('')
  const [pick, setPick] = useState('')
  const [file, setFile] = useState<PickedFile | null>(null)
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState<'write' | 'preview'>('write')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('')
  const [tags, setTags] = useState('')
  const [units, setUnits] = useState<Unit[]>([])
  const [material, setMaterial] = useState<Material>('other')
  const [teacher, setTeacher] = useState('')
  const [aiSummary, setAiSummary] = useState(true)
  const [ownWork, setOwnWork] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)

  const notes = useLive(['notes'], () => db.list('notes', { orderBy: 'updatedAt', desc: true }), [])
  const sources = useLive(
    ['sources'],
    () => db.list('sources', { orderBy: 'createdAt', desc: true }) as Promise<Source[]>,
    [],
  )
  const cards = useLive(['flashcards'], () => db.list('flashcards'), [])
  // Shared items use the group's subject names, so everyone's filters line up.
  const subjectName = (id: string | null): string => {
    const own = subjects.find((s) => s.id === id)
    if (!own) return ''
    return groupSubjectFor(own.name, own.code)?.name ?? own.name
  }

  const deckCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const c of cards.data ?? []) {
      const key = c.subjectId ?? 'none'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [cards.data])

  const target =
    spaceId ||
    remixOf?.spaceId ||
    (writable.some((s) => s.id === defaultSpaceId)
      ? defaultSpaceId
      : (writable.find((s) => s.isGroup) ?? writable[0])?.id) ||
    ''

  const reset = (): void => {
    setMode(remixOf ? 'write' : null)
    setSpaceId('')
    setPick('')
    setFile(null)
    setBody('')
    setPreview('write')
    setUrl('')
    setTitle(remixOf?.title ?? '')
    setDescription('')
    setSubject('')
    setTags('')
    setUnits([])
    setMaterial('other')
    setTeacher('')
    setAiSummary(true)
    setOwnWork(false)
    setPickError(null)
  }

  // Fresh form each time it opens (the parent opens it, so Radix sends no open event).
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) reset()
  }

  const choose = (value: string): void => {
    setPick(value)
    if (mode === 'note') {
      const n = notes.data?.find((x) => x.id === value)
      if (n) {
        setTitle(n.title)
        setSubject(subjectName(n.subjectId))
      }
    } else if (mode === 'library') {
      const s = sources.data?.find((x) => x.id === value)
      if (s) {
        setTitle(s.title)
        setSubject(subjectName(s.subjectId))
        setMaterial(guessMaterial(s.fileName ?? s.title))
      }
    } else if (mode === 'deck') {
      const name = value === 'none' ? '' : subjectName(value)
      setTitle(name ? `${name} flashcards` : 'Flashcards')
      setSubject(name)
    }
  }

  const chosenSource = mode === 'library' ? sources.data?.find((s) => s.id === pick) : undefined
  const size = mode === 'upload' ? (file?.size ?? 0) : (chosenSource?.size ?? 0)
  const tooBig = size > SHARED_FILE_LIMIT

  const readable = mode === 'upload' || mode === 'library' || mode === 'write' || mode === 'note'

  const publish = useAction(async () => {
    const meta = {
      spaceId: target,
      title: title.trim(),
      description,
      subject,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12),
      remixOf: remixOf?.id ?? null,
      units,
      material:
        mode === 'write' || mode === 'note'
          ? ('notes' as const)
          : mode === 'deck'
            ? ('flashcards' as const)
            : mode === 'link' && material === 'other'
              ? ('link' as const)
              : material,
      teacher: teacher.trim(),
      aiSummary: readable && aiSummary,
    }
    if (mode === 'write') await call('shared:publish', { kind: 'note', body, ...meta })
    else if (mode === 'note') await call('shared:publish', { kind: 'note', noteId: pick, ...meta })
    else if (mode === 'upload')
      await call('shared:publish', { kind: 'file', path: file?.path ?? null, ...meta })
    else if (mode === 'library')
      await call('shared:publish', { kind: 'file', sourceId: pick, ...meta })
    else if (mode === 'link')
      await call('shared:publish', { kind: 'link', url: url.trim(), ...meta })
    else {
      const ids = (cards.data ?? [])
        .filter((c) => (c.subjectId ?? 'none') === pick)
        .map((c) => c.id)
      await call('shared:publish', { kind: 'deck', flashcardIds: ids, ...meta })
    }
    changed('shared')
    toast({
      title: `Shared to ${writable.find((s) => s.id === target)?.name ?? 'the space'}`,
      tone: 'success',
    })
    onOpenChange(false)
  })

  const contentReady =
    mode === 'write'
      ? body.trim().length > 0
      : mode === 'upload'
        ? Boolean(file) && !tooBig
        : mode === 'link'
          ? /^https:\/\/\S+$/.test(url.trim())
          : Boolean(pick) && !tooBig
  const missing = !target
    ? 'Pick a space'
    : !contentReady
      ? mode === 'write'
        ? 'Write something first'
        : mode === 'upload'
          ? 'Choose a file'
          : mode === 'link'
            ? 'Paste a link that starts with https://'
            : 'Choose what to share'
      : !title.trim()
        ? 'Give it a title'
        : !ownWork
          ? 'Tick the box to confirm you can share it'
          : null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) publish.clear()
        onOpenChange(next)
      }}
      title={remixOf ? `Share your version of “${remixOf.title}”` : 'Share with a space'}
      description={
        mode
          ? undefined
          : 'Pick what you want to share. You can edit it afterwards from its preview.'
      }
      width={mode === 'write' ? 720 : 600}
      footer={
        mode ? (
          <>
            {!remixOf ? (
              <Button
                variant="ghost"
                className="mr-auto"
                icon={<ArrowLeft className="size-3.5" aria-hidden />}
                onClick={() => setMode(null)}
              >
                Back
              </Button>
            ) : null}
            <span className="self-center text-2xs text-ink-3">{missing}</span>
            <Button
              variant="primary"
              disabled={Boolean(missing) || publish.pending}
              onClick={() => void publish.run()}
            >
              {publish.pending ? 'Sharing…' : 'Share'}
            </Button>
          </>
        ) : undefined
      }
    >
      {writable.length === 0 ? (
        <ErrorState title="No space to share into">
          You are a viewer in every space you are in. Create your own space, or ask an owner to make
          you an editor.
        </ErrorState>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          {!mode ? (
            <motion.div
              key="pick"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="grid grid-cols-3 gap-2.5"
            >
              {MODES.map(({ id, label, hint, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMode(id)
                    setPick('')
                    if (id !== 'write') setTitle('')
                  }}
                  className="flex flex-col items-start gap-2 rounded-xl border border-line bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-sunken text-ink">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="font-semibold text-ink">{label}</span>
                  <span className="text-2xs text-ink-3">{hint}</span>
                </button>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="fill"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              className="flex flex-col gap-6"
            >
              <Step n={1} title={mode === 'write' ? 'Write it' : 'Choose it'}>
                {mode === 'write' ? (
                  <div className="flex flex-col gap-2">
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={200}
                      placeholder="Title, e.g. Unit 3 enzymes summary"
                      aria-label="Title"
                      autoFocus
                      className="h-10 text-[1rem] font-semibold"
                    />
                    <div className="flex items-center justify-between">
                      <Segmented
                        label="Write or preview"
                        value={preview}
                        onChange={setPreview}
                        options={[
                          { value: 'write', label: 'Write' },
                          { value: 'preview', label: 'Preview' },
                        ]}
                      />
                      <span className="text-2xs text-ink-3">
                        Markdown works: **bold**, # headings, - lists, $maths$
                      </span>
                    </div>
                    {preview === 'write' ? (
                      <Textarea
                        rows={12}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Start typing your note…"
                        aria-label="Note"
                        className="font-mono text-[0.8125rem] leading-6"
                      />
                    ) : (
                      <div className="prose-atlas min-h-[18rem] rounded-md bg-sunken px-4 py-3 text-ink">
                        <Markdown>{body || '_Nothing written yet._'}</Markdown>
                      </div>
                    )}
                  </div>
                ) : mode === 'upload' ? (
                  <Dropzone
                    file={file}
                    onFile={(f) => {
                      setFile(f)
                      setPickError(null)
                      if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
                      setMaterial(guessMaterial(f.name))
                    }}
                    onError={setPickError}
                  />
                ) : mode === 'note' ? (
                  <Select value={pick} onChange={(e) => choose(e.target.value)} aria-label="Note">
                    <option value="">Choose a note…</option>
                    {(notes.data ?? []).map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.title}
                      </option>
                    ))}
                  </Select>
                ) : mode === 'library' ? (
                  <Select value={pick} onChange={(e) => choose(e.target.value)} aria-label="File">
                    <option value="">
                      {(sources.data ?? []).length ? 'Choose a file…' : 'Your library is empty'}
                    </option>
                    {(sources.data ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                        {s.size ? ` (${formatBytes(s.size)})` : ''}
                      </option>
                    ))}
                  </Select>
                ) : mode === 'deck' ? (
                  <Select
                    value={pick}
                    onChange={(e) => choose(e.target.value)}
                    aria-label="Flashcards"
                  >
                    <option value="">
                      {deckCounts.size ? 'Choose a subject…' : 'No flashcards yet'}
                    </option>
                    {[...deckCounts.entries()].map(([key, count]) => (
                      <option key={key} value={key}>
                        {key === 'none' ? 'No subject' : subjectName(key) || 'Archived subject'} (
                        {count} {count === 1 ? 'card' : 'cards'})
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://"
                    inputMode="url"
                    aria-label="Link"
                    autoFocus
                  />
                )}
                {tooBig && mode === 'library' ? (
                  <p className="mt-2 text-2xs text-danger">
                    This file is {formatBytes(size)}. Files up to {formatBytes(SHARED_FILE_LIMIT)}{' '}
                    fit; share bigger ones as a link.
                  </p>
                ) : null}
                {pickError ? <p className="mt-2 text-2xs text-danger">{pickError}</p> : null}
              </Step>

              <Step n={2} title="Describe it">
                <div className="flex flex-col gap-3">
                  {mode !== 'write' ? (
                    <Field label="Title">
                      <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={200}
                        placeholder="What should people see?"
                      />
                    </Field>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Subject">
                      <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
                        <option value="">Choose a subject…</option>
                        {GROUP_SUBJECTS.map((g) => (
                          <option key={g.key} value={g.name}>
                            {g.name}
                          </option>
                        ))}
                        {subject && !GROUP_SUBJECTS.some((g) => g.name === subject) ? (
                          <option value={subject}>{subject}</option>
                        ) : null}
                      </Select>
                    </Field>
                    {mode === 'upload' || mode === 'library' || mode === 'link' ? (
                      <Field label="Type of material">
                        <Select
                          value={material}
                          onChange={(e) => setMaterial(e.target.value as Material)}
                        >
                          {MATERIALS.filter((m) => m !== 'flashcards').map((m) => (
                            <option key={m} value={m}>
                              {MATERIAL_LABELS[m]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : (
                      <Field label="Tags" hint="Comma separated">
                        <Input
                          value={tags}
                          onChange={(e) => setTags(e.target.value)}
                          placeholder="SAC, revision"
                        />
                      </Field>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Units">
                      <div className="flex gap-1.5" role="group" aria-label="Units">
                        {UNITS.map((u) => {
                          const on = units.includes(u)
                          return (
                            <button
                              key={u}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                setUnits((list) =>
                                  on ? list.filter((x) => x !== u) : [...list, u].sort(),
                                )
                              }
                              className={cn(
                                'h-8 flex-1 rounded-md border text-2xs font-semibold transition-colors',
                                on
                                  ? 'border-accent bg-accent text-accent-fg'
                                  : 'border-line bg-surface text-ink-2 hover:bg-hover',
                              )}
                            >
                              Unit {u}
                            </button>
                          )
                        })}
                      </div>
                    </Field>
                    <Field label="Teacher" hint="Optional">
                      <Input
                        value={teacher}
                        onChange={(e) => setTeacher(e.target.value)}
                        list="shared-teachers"
                        maxLength={80}
                        placeholder="Who made or gave it out"
                      />
                      <datalist id="shared-teachers">
                        {teachers.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </Field>
                  </div>
                  <Field label="Description" hint="Optional">
                    <Textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={2000}
                      placeholder="What's in it, and who it helps"
                    />
                  </Field>
                </div>
              </Step>

              <Step n={3} title="Share it">
                <div className="flex flex-col gap-3">
                  <Field label="Space">
                    <Select value={target} onChange={(e) => setSpaceId(e.target.value)}>
                      {writable.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {readable ? (
                    <label className="flex items-start gap-2.5 rounded-lg bg-sunken px-3 py-2.5 text-ink-2">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-[var(--color-accent)]"
                        checked={aiSummary}
                        onChange={(e) => setAiSummary(e.target.checked)}
                      />
                      <span>
                        <span className="flex items-center gap-1.5 font-medium text-ink">
                          <Sparkles className="size-3.5" aria-hidden />
                          Add an AI summary and text version
                        </span>
                        <span className="text-2xs text-ink-3">
                          Your own AI reads it after it is shared (handwriting and scans too), so
                          everyone can search and skim it. Uses your AI, not anyone else’s.
                        </span>
                      </span>
                    </label>
                  ) : null}
                  <label className="flex items-start gap-2.5 text-ink-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--color-accent)]"
                      checked={ownWork}
                      onChange={(e) => setOwnWork(e.target.checked)}
                    />
                    <span>
                      This is my own work, or it is free to share. No textbooks or paid resources.
                    </span>
                  </label>
                </div>
              </Step>
              {publish.error ? <ErrorState title="Not shared">{publish.error}</ErrorState> : null}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </Dialog>
  )
}

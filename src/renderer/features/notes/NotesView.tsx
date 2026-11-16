import { useEffect, useRef, useState } from 'react'
import { Columns2, Eye, Layers, Pencil, Pin, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { Note, Source } from '@shared/models'
import { Button, IconButton } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Field, Select } from '@/design/Form'
import { Markdown } from '@/design/Markdown'
import { Segmented } from '@/design/Segmented'
import { EmptyState } from '@/design/States'
import { useToast } from '@/design/Toast'
import { db, useAction, useLive } from '@/lib/api'
import { call } from '@/lib/ipc'

type Mode = 'write' | 'split' | 'read'

function Editor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.bodyMd)
  const [mode, setMode] = useState<Mode>('split')
  const toast = useToast()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef({ title, body })
  useEffect(() => {
    latest.current = { title, body }
  }, [title, body])

  // Autosave shortly after typing stops, and once more when leaving the note.
  const queueSave = (): void => {
    clearTimeout(timer.current)
    timer.current = setTimeout(
      () =>
        void db.update('notes', note.id, {
          title: latest.current.title || 'Untitled note',
          bodyMd: latest.current.body,
        }),
      500,
    )
  }
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      void db.update('notes', note.id, {
        title: latest.current.title || 'Untitled note',
        bodyMd: latest.current.body,
      })
    },
    [note.id],
  )

  const makeCards = useAction(async () => {
    const result = await call('ai:complete', {
      task: 'flashcards',
      prompt: `${title}\n\n${body}`,
      subjectId: note.subjectId,
    })
    const parsed = JSON.parse(
      result.text.slice(result.text.indexOf('['), result.text.lastIndexOf(']') + 1),
    ) as { front: string; back: string }[]
    for (const card of parsed)
      await db.create('flashcards', {
        subjectId: note.subjectId,
        frontMd: card.front,
        backMd: card.back,
        origin: 'ai',
        due: Date.now(),
      })
    toast({ title: `Made ${parsed.length} flashcards` })
  })

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            queueSave()
          }}
          aria-label="Note title"
          placeholder="Untitled note"
          className="min-w-0 flex-1 bg-transparent text-[1rem] font-semibold text-ink outline-none placeholder:text-ink-3"
        />
        <Segmented
          label="View"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'write', label: 'Write', icon: <Pencil className="size-3.5" aria-hidden /> },
            { value: 'split', label: 'Split', icon: <Columns2 className="size-3.5" aria-hidden /> },
            { value: 'read', label: 'Read', icon: <Eye className="size-3.5" aria-hidden /> },
          ]}
        />
        <IconButton
          label={note.pinned ? 'Unpin' : 'Pin'}
          active={note.pinned}
          onClick={() => void db.update('notes', note.id, { pinned: !note.pinned })}
        >
          <Pin className="size-4" aria-hidden />
        </IconButton>
        <IconButton
          label={makeCards.pending ? 'Making flashcards…' : 'Make flashcards with AI'}
          disabled={makeCards.pending || !body.trim()}
          onClick={() => void makeCards.run()}
        >
          <Layers className="size-4" aria-hidden />
        </IconButton>
        <IconButton label="Delete note" onClick={() => void db.remove('notes', note.id)}>
          <Trash2 className="size-4" aria-hidden />
        </IconButton>
      </div>
      {makeCards.error ? (
        <p role="alert" className="px-4 pt-2 text-danger">
          {makeCards.error}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1">
        {mode !== 'read' ? (
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              queueSave()
            }}
            spellCheck
            aria-label="Note text"
            placeholder={'Write in Markdown. Maths goes between dollar signs: $E = mc^2$'}
            className="min-w-0 flex-1 resize-none bg-transparent p-5 font-mono text-[0.8125rem] leading-6 text-ink outline-none placeholder:text-ink-3"
          />
        ) : null}
        {mode !== 'write' ? (
          <div
            className={
              mode === 'split'
                ? 'min-w-0 flex-1 overflow-y-auto border-l border-line p-5'
                : 'min-w-0 flex-1 overflow-y-auto p-5'
            }
          >
            <div className="mx-auto max-w-[720px]">
              {body.trim() ? (
                <Markdown>{body}</Markdown>
              ) : (
                <p className="text-ink-3">Nothing written yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Notes with a Markdown and KaTeX editor, a live preview, and AI summaries of imported sources. */
export function NotesView({ subjectId }: { subjectId?: string }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [summarising, setSummarising] = useState(false)
  const [sourceId, setSourceId] = useState('')
  const notes = useLive(
    ['notes'],
    () =>
      db.list('notes', {
        where: subjectId ? { subjectId } : undefined,
        orderBy: 'updatedAt',
        desc: true,
      }),
    [subjectId],
  )
  const sources = useLive(
    ['sources'],
    () => db.list('sources', { where: subjectId ? { subjectId } : undefined }) as Promise<Source[]>,
    [subjectId],
  )
  const sorted = [...(notes.data ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned))
  const active = sorted.find((n) => n.id === activeId) ?? null

  const create = useAction(async () => {
    const note = await db.create('notes', {
      subjectId: subjectId ?? null,
      title: 'Untitled note',
      bodyMd: '',
    })
    setActiveId(note.id)
  })
  const summarise = useAction(async () => {
    const source = sources.data?.find((s) => s.id === sourceId)
    if (!source) return
    const pages = await call('library:pages', { sourceId })
    const text = pages
      .map((p) => `[page ${p.number}]\n${p.text}`)
      .join('\n\n')
      .slice(0, 120_000)
    const result = await call('ai:complete', {
      task: 'summary',
      prompt: `Source: ${source.title}\n\n${text}`,
      subjectId: source.subjectId,
    })
    const title = /^#\s+(.+)$/m.exec(result.text)?.[1] ?? `Notes: ${source.title}`
    const note = await db.create('notes', {
      subjectId: source.subjectId,
      title: title.slice(0, 200),
      bodyMd: result.text,
    })
    setActiveId(note.id)
    setSummarising(false)
  })

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-line">
        <div className="flex gap-2 p-3">
          <Button
            className="flex-1"
            icon={<Plus className="size-3.5" aria-hidden />}
            onClick={() => void create.run()}
          >
            New note
          </Button>
          <IconButton label="Summarise a source with AI" onClick={() => setSummarising(true)}>
            <Sparkles className="size-4" aria-hidden />
          </IconButton>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {sorted.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => setActiveId(note.id)}
                aria-current={note.id === activeId}
                className="block w-full rounded-md px-2 py-1.5 text-left text-ink-2 hover:bg-hover aria-[current=true]:bg-hover aria-[current=true]:text-ink"
              >
                <span className="flex items-center gap-1.5 truncate font-medium">
                  {note.pinned ? <Pin className="size-3 shrink-0" aria-label="Pinned" /> : null}
                  <span className="truncate">{note.title || 'Untitled note'}</span>
                </span>
                <span className="block truncate text-2xs text-ink-3">
                  {note.bodyMd.replace(/[#*_`>$\\]/g, '').slice(0, 60) || 'Empty'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {active ? (
        <Editor key={active.id} note={active} />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8">
          <EmptyState
            eyebrow={sorted.length ? 'Notes' : 'No notes yet'}
            title={sorted.length ? 'Pick a note, or start a new one' : 'Write your first note'}
            action={
              <Button variant="primary" onClick={() => void create.run()}>
                New note
              </Button>
            }
            className="w-full max-w-lg"
          >
            Notes use Markdown with maths, and are searchable from anywhere with the command
            palette.
          </EmptyState>
        </div>
      )}

      <Dialog
        open={summarising}
        onOpenChange={setSummarising}
        title="Summarise a source into notes"
        description="AI reads the file you pick and writes revision notes from it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSummarising(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!sourceId || summarise.pending}
              onClick={() => void summarise.run()}
            >
              {summarise.pending ? 'Writing notes…' : 'Write notes'}
            </Button>
          </>
        }
      >
        <Field
          label="Source"
          error={summarise.error}
          hint={
            (sources.data ?? []).length === 0
              ? 'Import a file in the Library first.'
              : 'Long files are trimmed to the first part.'
          }
        >
          <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">Choose a file</option>
            {sources.data
              ?.filter((s) => s.ingestStatus === 'ready')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
          </Select>
        </Field>
      </Dialog>
    </div>
  )
}

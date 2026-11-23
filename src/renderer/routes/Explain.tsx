import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Download,
  FileUp,
  GraduationCap,
  ImagePlus,
  Loader2,
  MessageCircleQuestion,
  Plus,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { parseLesson, type Lesson } from '@shared/lesson'
import type { LessonRow, Question, Source, Subject } from '@shared/models'
import { Menu } from '@/design/Menu'
import { Select } from '@/design/Form'
import { Segmented } from '@/design/Segmented'
import { Player } from '@/features/explainer/Player'
import { LibraryPicker, QuestionPicker } from '@/features/explainer/Pickers'
import { questionName, stemPreview } from '@/features/explainer/names'
import { SAMPLE_LESSONS } from '@/features/explainer/samples'
import { shareLesson } from '@/features/explainer/share'
import { MicButton } from '@/features/voice/MicButton'
import { useLessonStream, type LessonRequest } from '@/features/explainer/useLessonStream'
import { db, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call, errorMessage, subscribe } from '@/lib/ipc'
import { useSetting } from '@/lib/settings'

/** Something attached to the question: an upload or screenshot, a library file, an exam question. */
type Attachment =
  | { kind: 'file'; path: string; name: string; preview?: string }
  | { kind: 'source'; id: string; name: string }
  | { kind: 'question'; id: string; name: string; detail: string }

const LEVELS = [
  'Year 7 to 10',
  'Units 1 and 2',
  'Units 3 and 4',
  'University',
  'Beyond the syllabus',
]

const IDEAS = [
  'Help me with quadratic equations',
  'Why does the chain rule work?',
  'How does photosynthesis make glucose?',
  'Explain the area between two curves',
  'What makes a strong essay introduction?',
  'How do black holes form?',
]

function attachmentKey(a: Attachment): string {
  return a.kind === 'file' ? a.path : `${a.kind}:${a.id}`
}

/**
 * The Explainer: ask anything (typed, a photo of a question, a file from the library or a past
 * exam question) and the user's own AI makes a narrated, animated lesson that plays as it is
 * written.
 */
export function Explain() {
  const subjects = useLive(['subjects'], () => db.list('subjects', { where: { active: true } }))
  const recent = useLive(['lessons'], () =>
    db.list('lessons', { orderBy: 'createdAt', desc: true, limit: 24 }),
  )
  const [subjectId, setSubjectId] = useSetting<string>('explainer.subject', '')
  const [level, setLevel] = useSetting<string>('explainer.level', 'Units 3 and 4')
  const [style, setStyle] = useSetting<'clear' | 'fun'>('explainer.style', 'clear')
  const [exam, setExam] = useSetting<boolean>('explainer.exam', false)
  const [autoShare] = useSetting<boolean>('explainer.autoShare', true)
  const [params] = useSearchParams()
  const [handledLink, setHandledLink] = useState<string | null>(null)
  const [shareNote, setShareNote] = useState<string | null>(null)

  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [picker, setPicker] = useState<'library' | 'question' | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The lesson on screen when it came from the gallery rather than the stream. */
  const [opened, setOpened] = useState<{
    key: string
    lesson: Lesson
    rowId: string | null
  } | null>(null)
  /** A lesson paused to ask a follow-up about, to come back to. */
  const [parent, setParent] = useState<{ lesson: Lesson; rowId: string | null } | null>(null)
  const [scene, setScene] = useState(0)
  const [ask, setAsk] = useState('')
  const [streamKey, setStreamKey] = useState('')
  const lastRequest = useRef<LessonRequest | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const subject: Subject | undefined = (subjects.data ?? []).find((s) => s.id === subjectId)

  const save = useCallback(
    (lesson: Lesson, _text: string, provider: string | null) => {
      const request = lastRequest.current
      if (!request) return
      void db
        .create('lessons', {
          subjectId: request.subjectId,
          title: lesson.title.slice(0, 300) || 'Explainer',
          prompt: request.prompt.slice(0, 20_000),
          lesson: lesson as unknown as Record<string, unknown>,
          level: request.level,
          attachments: [...request.files, ...request.sourceIds, ...request.questionIds],
          provider,
        })
        .then((row) => {
          setOpened((o) => (o ? o : { key: streamKey, lesson, rowId: row.id }))
          if (!autoShare || request.followUp) return
          setShareNote('Sharing with the group…')
          void shareLesson({
            lessonId: row.id,
            lesson,
            prompt: request.prompt || lesson.title,
            subject: request.subject,
            level: request.level,
          })
            .then((id) => setShareNote(id ? 'Shared with the group' : null))
            .catch(() => setShareNote("Couldn't share it with the group"))
        })
        .catch(() => undefined)
    },
    [streamKey, autoShare],
  )
  const stream = useLessonStream(save)
  const streaming = stream.state.status === 'writing'
  const streamLesson = stream.state.status === 'idle' ? null : (stream.state.lesson ?? null)

  const showing: Lesson | null = opened?.lesson ?? streamLesson
  const live = !opened && streaming

  const addFiles = async (files: File[]): Promise<void> => {
    const added: Attachment[] = []
    for (const file of files.slice(0, 6)) {
      let path = window.atlas.pathForFile(file)
      if (!path) {
        // A pasted screenshot has no file on disk yet: keep a copy for the AI to look at.
        const bytes = new Uint8Array(await file.arrayBuffer())
        const ext = file.type.split('/')[1] ?? 'png'
        path = await call('files:stashBytes', { bytes, name: `question-${Date.now()}.${ext}` })
      }
      added.push({
        kind: 'file',
        path,
        name: file.name || 'Screenshot',
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      })
    }
    setAttachments((list) => {
      const keys = new Set(list.map(attachmentKey))
      return [...list, ...added.filter((a) => !keys.has(attachmentKey(a)))].slice(0, 8)
    })
  }

  const request = (prompt: string, followUp: LessonRequest['followUp'] = null): LessonRequest => ({
    prompt,
    subjectId: subjectId || null,
    subject: subject?.name ?? null,
    level: level || null,
    style,
    exam,
    files: followUp ? [] : attachments.flatMap((a) => (a.kind === 'file' ? [a.path] : [])),
    sourceIds: followUp ? [] : attachments.flatMap((a) => (a.kind === 'source' ? [a.id] : [])),
    questionIds: followUp ? [] : attachments.flatMap((a) => (a.kind === 'question' ? [a.id] : [])),
    followUp,
  })

  const begin = (next: LessonRequest): void => {
    setError(null)
    setOpened(null)
    setScene(0)
    setShareNote(null)
    setStreamKey(`s-${Date.now()}`)
    lastRequest.current = next
    void stream.start(next)
  }

  const submit = (text = draft): void => {
    if (!text.trim() && attachments.length === 0) return
    begin(request(text.trim()))
    setDraft('')
  }

  const askFollowUp = (): void => {
    if (!showing || !ask.trim()) return
    const rowId = opened?.rowId ?? null
    setParent({ lesson: showing, rowId })
    begin(request(ask.trim(), { lesson: JSON.stringify(showing), scene }))
    setAsk('')
  }

  const backToStart = (): void => {
    stream.cancel()
    stream.reset()
    setOpened(null)
    setParent(null)
    setAttachments([])
  }

  const openRow = (row: LessonRow): void => {
    const lesson = parseLesson(JSON.stringify(row.lesson))
    if (!lesson) return
    stream.reset()
    setParent(null)
    setScene(0)
    setOpened({ key: row.id, lesson, rowId: row.id })
  }

  // Opened from a link (a saved remix): /explain?lesson=<id>.
  const wanted = params.get('lesson')
  const wantedRow = wanted ? (recent.data ?? []).find((r) => r.id === wanted) : undefined
  if (wanted && wantedRow && handledLink !== wanted) {
    setHandledLink(wanted)
    openRow(wantedRow)
  }

  const errorText = stream.state.status === 'error' ? stream.state.message : error

  const composer = (
    <Composer
      draft={draft}
      setDraft={setDraft}
      attachments={attachments}
      onRemove={(a) =>
        setAttachments((list) => list.filter((x) => attachmentKey(x) !== attachmentKey(a)))
      }
      onPaste={(files) => void addFiles(files).catch((e: unknown) => setError(String(e)))}
      onSubmit={() => submit()}
      mic={
        <MicButton onText={(text) => setDraft((d) => (d.trim() ? `${d.trim()} ${text}` : text))} />
      }
      streaming={streaming}
      onStop={stream.cancel}
      attach={
        <Menu
          align="start"
          trigger={
            <button
              type="button"
              aria-label="Attach a question"
              className="flex size-8 items-center justify-center rounded-full text-ink-2 ring-1 ring-line hover:bg-hover hover:text-ink"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          }
          items={[
            {
              label: 'Upload a photo or file',
              icon: <FileUp className="size-4" />,
              onSelect: () => fileInput.current?.click(),
            },
            {
              label: 'From your library',
              icon: <BookOpen className="size-4" />,
              onSelect: () => setPicker('library'),
            },
            {
              label: 'From an exam',
              icon: <GraduationCap className="size-4" />,
              onSelect: () => setPicker('question'),
            },
          ]}
        />
      }
      options={
        <>
          <Select
            aria-label="Subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="h-8 w-auto max-w-44 text-2xs"
          >
            <option value="">Any subject</option>
            {(subjects.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="h-8 w-auto text-2xs"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
          <Segmented
            label="Style"
            value={style}
            onChange={setStyle}
            options={[
              { value: 'clear', label: 'Clear' },
              { value: 'fun', label: 'Fun' },
            ]}
          />
          <label className="flex h-8 cursor-pointer items-center gap-2 rounded-full px-2.5 text-2xs text-ink-2 ring-1 ring-line select-none hover:bg-hover">
            <input
              type="checkbox"
              checked={exam}
              onChange={(e) => setExam(e.target.checked)}
              className="accent-[var(--atlas-blue,#2563eb)]"
            />
            Exam mode
          </label>
        </>
      }
    />
  )

  const pickers = (
    <>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept="image/*,.pdf,.pptx,.docx,.md,.txt"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          void addFiles(files).catch((err: unknown) => setError(String(err)))
        }}
      />
      <LibraryPicker
        open={picker === 'library'}
        onOpenChange={(o) => setPicker(o ? 'library' : null)}
        subjectId={subjectId || null}
        onPick={(source: Source) =>
          setAttachments((list) => [...list, { kind: 'source', id: source.id, name: source.title }])
        }
      />
      {picker === 'question' ? (
        <QuestionPicker
          open
          onOpenChange={(o) => setPicker(o ? 'question' : null)}
          subjects={subjects.data ?? []}
          initialSubjectId={subjectId || null}
          onPick={(q: Question) =>
            setAttachments((list) => [
              ...list,
              {
                kind: 'question',
                id: q.id,
                name: questionName(q),
                detail: stemPreview(q.stemMd, 90),
              },
            ])
          }
        />
      ) : null}
    </>
  )

  /* ---------- Watching a lesson ---------- */

  if (showing || streaming || stream.state.status === 'error') {
    const lesson = showing
    return (
      <div className="flex h-full flex-col overflow-y-auto">
        {pickers}
        <div className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-5 px-8 pt-6 pb-10 xl:flex-row">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={backToStart}
                className="flex h-8 items-center gap-1.5 rounded-md px-2 text-ink-2 hover:bg-hover hover:text-ink"
              >
                <ArrowLeft className="size-4" aria-hidden /> New question
              </button>
              {parent ? (
                <button
                  type="button"
                  onClick={() => {
                    stream.cancel()
                    setOpened({
                      key: `p-${Date.now()}`,
                      lesson: parent.lesson,
                      rowId: parent.rowId,
                    })
                    setParent(null)
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-md px-2 text-ink-2 hover:bg-hover hover:text-ink"
                >
                  Back to “{parent.lesson.title}”
                </button>
              ) : null}
              <h1 className="ml-2 min-w-0 flex-1 truncate text-[1.0625rem] font-semibold text-ink">
                {lesson?.title ?? 'Writing your lesson…'}
              </h1>
              {opened?.rowId && lesson ? (
                <DownloadVideo lessonId={opened.rowId} title={lesson.title} />
              ) : null}
            </div>
            {lesson ? (
              <Player
                key={opened?.key ?? streamKey}
                lesson={lesson}
                live={live}
                onScene={setScene}
              />
            ) : (
              <Writing chars={stream.state.status === 'writing' ? stream.state.chars : 0} />
            )}
            {errorText ? (
              <p role="alert" className="mt-3 text-danger">
                {errorText}
              </p>
            ) : null}
            {lesson ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  askFollowUp()
                }}
                className="mt-4 flex items-center gap-2 rounded-xl bg-surface p-2 shadow-pop"
              >
                <MessageCircleQuestion className="ml-1 size-4 shrink-0 text-ink-3" aria-hidden />
                <input
                  value={ask}
                  onChange={(e) => setAsk(e.target.value)}
                  placeholder={`Ask about scene ${scene + 1}: “why does this step work?”`}
                  aria-label="Ask about this step"
                  disabled={streaming}
                  className="h-8 min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
                />
                <button
                  type="submit"
                  aria-label="Ask"
                  disabled={!ask.trim() || streaming}
                  className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40"
                >
                  <ArrowUp className="size-4" aria-hidden />
                </button>
              </form>
            ) : null}
          </div>
          <aside className="w-full shrink-0 xl:w-[340px]">
            <h2 className="mb-2 text-2xs font-medium tracking-wide text-ink-3 uppercase">Scenes</h2>
            <ol className="flex flex-col gap-1">
              {(lesson?.scenes ?? []).map((s, i) => (
                <li
                  key={i}
                  className={cn(
                    'rounded-lg px-3 py-2 transition-colors',
                    i === scene ? 'bg-surface shadow-pop ring-1 ring-line' : 'text-ink-2',
                  )}
                >
                  <p className="text-2xs font-medium text-ink-3">
                    {i + 1}
                    {s.title ? ` · ${s.title}` : ''}
                  </p>
                  <p className={cn('leading-5', i === scene ? 'text-ink' : 'text-ink-2')}>
                    {s.say}
                  </p>
                </li>
              ))}
              {streaming ? (
                <li className="flex items-center gap-2 px-3 py-2 text-ink-3">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> Writing more…
                </li>
              ) : null}
            </ol>
            {stream.state.status === 'done' && stream.state.provider ? (
              <p className="mt-3 px-3 text-2xs text-ink-3">
                Made with {stream.state.provider}
                {shareNote ? ` · ${shareNote}` : ''}
              </p>
            ) : null}
          </aside>
        </div>
      </div>
    )
  }

  /* ---------- Asking ---------- */

  return (
    <div className="h-full overflow-y-auto">
      {pickers}
      <div className="mx-auto flex w-full max-w-[880px] flex-col px-8 pt-14 pb-12">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-surface shadow-pop ring-1 ring-line">
            <Sparkles className="size-5 text-blue" aria-hidden />
          </div>
          <h1 className="text-[1.75rem] leading-9 font-semibold tracking-[-0.025em] text-ink">
            What should we explain?
          </h1>
          <p className="mt-1.5 text-ink-2">
            Type a question, paste a screenshot, or pick one from an exam. Atlas draws and narrates
            a lesson with your own AI.
          </p>
        </div>
        {composer}
        {errorText ? (
          <p role="alert" className="mt-3 text-danger">
            {errorText}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => submit(idea)}
              className="rounded-full bg-surface px-3 py-1.5 text-2xs text-ink-2 ring-1 ring-line hover:bg-hover hover:text-ink"
            >
              {idea}
            </button>
          ))}
        </div>

        <Gallery
          title="Your lessons"
          empty="Lessons you make are kept here."
          items={(recent.data ?? []).map((row) => ({
            key: row.id,
            title: row.title,
            detail: row.level ?? '',
            onOpen: () => openRow(row),
          }))}
        />
        <Gallery
          title="Examples"
          items={SAMPLE_LESSONS.map((lesson, i) => ({
            key: `sample-${i}`,
            title: lesson.title,
            detail: lesson.subject,
            onOpen: () => {
              stream.reset()
              setScene(0)
              setOpened({ key: `sample-${i}-${Date.now()}`, lesson, rowId: null })
            },
          }))}
        />
      </div>
    </div>
  )
}

function Composer({
  draft,
  setDraft,
  attachments,
  onRemove,
  onPaste,
  onSubmit,
  streaming,
  onStop,
  attach,
  options,
  mic,
}: {
  draft: string
  setDraft: (text: string) => void
  attachments: Attachment[]
  onRemove: (a: Attachment) => void
  onPaste: (files: File[]) => void
  onSubmit: () => void
  streaming: boolean
  onStop: () => void
  attach: ReactNode
  options: ReactNode
  mic: ReactNode
}) {
  const [dragging, setDragging] = useState(false)
  const canSend = useMemo(
    () => Boolean(draft.trim()) || attachments.length > 0,
    [draft, attachments.length],
  )
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const files = [...e.dataTransfer.files]
        if (files.length) onPaste(files)
      }}
      className={cn(
        'rounded-2xl bg-surface p-3 shadow-pop ring-1 ring-line transition-shadow',
        dragging && 'ring-2 ring-blue',
      )}
    >
      {attachments.length ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <li
              key={attachmentKey(a)}
              className="flex max-w-[320px] items-center gap-2 rounded-lg bg-sunken py-1 pr-1 pl-1.5 text-2xs text-ink"
            >
              {a.kind === 'file' && a.preview ? (
                <img src={a.preview} alt="" className="size-8 rounded object-cover" />
              ) : a.kind === 'question' ? (
                <GraduationCap className="size-4 text-ink-3" aria-hidden />
              ) : a.kind === 'source' ? (
                <BookOpen className="size-4 text-ink-3" aria-hidden />
              ) : (
                <ImagePlus className="size-4 text-ink-3" aria-hidden />
              )}
              <span className="min-w-0 truncate">
                {a.name}
                {a.kind === 'question' ? <span className="text-ink-3"> · {a.detail}</span> : null}
              </span>
              <button
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => onRemove(a)}
                className="flex size-6 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-hover hover:text-ink"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onPaste={(e) => {
          const files = [...e.clipboardData.files]
          if (files.length) {
            e.preventDefault()
            onPaste(files)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            onSubmit()
          }
        }}
        rows={Math.min(8, Math.max(2, draft.split('\n').length))}
        placeholder="Ask anything: “help me with quadratic equations”, or paste a screenshot of a question"
        aria-label="Your question"
        className="block w-full resize-none bg-transparent px-1.5 py-1 text-[0.9375rem] leading-6 text-ink outline-none placeholder:text-ink-3"
      />
      <div className="flex flex-wrap items-center gap-2 pt-2">
        {attach}
        {options}
        <span className="flex-1" />
        {mic}
        {streaming ? (
          <button
            type="button"
            aria-label="Stop"
            onClick={onStop}
            className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-fg hover:bg-accent-hover"
          >
            <Square className="size-3.5 fill-current" aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Explain"
            disabled={!canSend}
            className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </form>
  )
}

/** While the first scene is written: a calm board with a pen working. */
function Writing({ chars }: { chars: number }) {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl bg-[#15171c] text-white/80 shadow-pop">
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <p>Planning the lesson…</p>
      <p className="font-mono text-2xs text-white/40">
        {chars ? `${chars} characters written` : ''}
      </p>
    </div>
  )
}

function Gallery({
  title,
  empty,
  items,
}: {
  title: string
  empty?: string
  items: { key: string; title: string; detail: string; onOpen: () => void }[]
}) {
  if (items.length === 0 && !empty) return null
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-2xs font-medium tracking-wide text-ink-3 uppercase">{title}</h2>
      {items.length === 0 ? (
        <p className="text-ink-3">{empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={item.onOpen}
                className="group flex w-full flex-col overflow-hidden rounded-xl bg-surface text-left shadow-pop ring-1 ring-line hover:ring-line-strong"
              >
                <span className="flex aspect-video w-full items-end bg-[#15171c] p-3">
                  <span className="line-clamp-2 text-[0.9375rem] leading-5 font-semibold text-white">
                    {item.title}
                  </span>
                </span>
                <span className="truncate px-3 py-2 text-2xs text-ink-3">{item.detail || ' '}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Makes an MP4 of the lesson (drawn frame by frame, with the narration) and saves it. */
function DownloadVideo({ lessonId, title }: { lessonId: string; title: string }) {
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'making'; pct: number }
    | { status: 'saved' }
    | { status: 'error'; message: string }
  >({ status: 'idle' })
  useEffect(
    () =>
      subscribe('explainer:exportProgress', (p) => {
        if (p.lessonId === lessonId)
          setState({ status: 'making', pct: Math.round((p.done / p.total) * 100) })
      }),
    [lessonId],
  )
  const make = async (): Promise<void> => {
    setState({ status: 'making', pct: 0 })
    try {
      const { saved } = await call('explainer:exportVideo', { lessonId, title })
      setState(saved ? { status: 'saved' } : { status: 'idle' })
    } catch (error) {
      setState({ status: 'error', message: errorMessage(error) })
    }
  }
  if (state.status === 'making') {
    return (
      <span className="flex h-8 items-center gap-2 rounded-md px-2 text-2xs text-ink-2">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Making video {state.pct}%
        <button
          type="button"
          onClick={() => void call('explainer:cancelExport')}
          className="text-ink-3 underline hover:text-ink"
        >
          Stop
        </button>
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => void make()}
      title={state.status === 'error' ? state.message : undefined}
      className={cn(
        'flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-ink-2 ring-1 ring-line hover:bg-hover hover:text-ink',
        state.status === 'error' && 'text-danger',
      )}
    >
      <Download className="size-4" aria-hidden />
      {state.status === 'saved'
        ? 'Saved'
        : state.status === 'error'
          ? 'Try again'
          : 'Download video'}
    </button>
  )
}

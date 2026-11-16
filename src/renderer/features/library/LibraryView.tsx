import { useState } from 'react'
import { Link } from 'react-router'
import { FileText, FolderUp, Lock, Trash2, Upload } from 'lucide-react'
import { SOURCE_KINDS, SOURCE_KIND_LABELS, type Source, type SourceKind } from '@shared/models'
import { Button, IconButton } from '@/design/Button'
import { Badge, Select, SubjectDot } from '@/design/Form'
import { EmptyState, ErrorState, SkeletonList } from '@/design/States'
import { useToast } from '@/design/Toast'
import { changed, db, useAction, useLive } from '@/lib/api'
import { useSubjects } from '@/lib/app-state'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { processImportQueue } from './ingest'

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  return bytes > 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * Every imported resource, for one subject or for all of them. Files are copied into the profile,
 * hashed and de-duplicated; PDFs are made searchable in the background.
 */
export function LibraryView({ subjectId }: { subjectId?: string }) {
  const subjects = useSubjects()
  const toast = useToast()
  const [dragging, setDragging] = useState(false)
  const [filter, setFilter] = useState<SourceKind | 'all'>('all')
  const sources = useLive(
    ['sources'],
    () => db.list('sources', { where: subjectId ? { subjectId } : undefined }) as Promise<Source[]>,
    [subjectId],
  )

  const afterImport = (count: number): void => {
    changed('sources')
    void processImportQueue()
    if (count > 0)
      toast({
        title: count === 1 ? 'Imported 1 file' : `Imported ${count} files`,
        description: 'PDFs become searchable in a moment.',
      })
  }
  const pick = useAction(async () =>
    afterImport((await call('library:pickAndImport', { subjectId: subjectId ?? null })).length),
  )
  const drop = useAction(async (paths: string[]) =>
    afterImport(
      (await call('library:importPaths', { subjectId: subjectId ?? null, paths })).length,
    ),
  )
  const remove = useAction(async (id: string) => {
    await call('library:remove', { sourceId: id })
    changed('sources')
  })

  const rows = (sources.data ?? []).filter((s) => filter === 'all' || s.kind === filter)
  const subjectOf = (id: string | null): (typeof subjects)[number] | undefined =>
    subjects.find((s) => s.id === id)

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const paths = [...event.dataTransfer.files]
          .map((file) => window.atlas.pathForFile(file))
          .filter(Boolean)
        if (paths.length) void drop.run(paths)
      }}
      className="flex flex-col gap-4"
    >
      <div
        className={cn(
          'flex items-center justify-between gap-4 rounded-lg border border-dashed px-5 py-4 transition-colors',
          dragging ? 'border-accent bg-hover' : 'border-line-strong',
        )}
      >
        <div className="flex items-center gap-3">
          <FolderUp className="size-5 text-ink-3" aria-hidden />
          <div>
            <p className="font-medium text-ink">Drop files or folders here</p>
            <p className="text-ink-2">
              PDF, text and Markdown. Study designs, past exams, solutions, examiner reports,
              textbooks, notes.
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          disabled={pick.pending || drop.pending}
          onClick={() => void pick.run()}
          icon={<Upload className="size-3.5" aria-hidden />}
        >
          {pick.pending || drop.pending ? 'Importing…' : 'Import files'}
        </Button>
      </div>
      {pick.error || drop.error || remove.error ? (
        <ErrorState title="That did not work">
          {pick.error ?? drop.error ?? remove.error}
        </ErrorState>
      ) : null}

      {sources.loading ? (
        <SkeletonList rows={4} />
      ) : (sources.data ?? []).length === 0 ? (
        <EmptyState eyebrow="Nothing imported yet" title="Your library is empty">
          Import your own resources and Atlas makes them searchable and uses them to ground AI
          answers. Files are copied onto this laptop and never uploaded.
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {(['all', ...SOURCE_KINDS] as const).map((kind) => {
              const count =
                kind === 'all'
                  ? (sources.data ?? []).length
                  : (sources.data ?? []).filter((s) => s.kind === kind).length
              if (kind !== 'all' && count === 0) return null
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={filter === kind}
                  onClick={() => setFilter(kind)}
                  className="h-7 rounded-full px-3 text-ink-2 ring-1 ring-line ring-inset hover:text-ink aria-pressed:bg-accent aria-pressed:text-accent-fg aria-pressed:ring-accent"
                >
                  {kind === 'all' ? 'All' : SOURCE_KIND_LABELS[kind]}{' '}
                  <span className="opacity-60">{count}</span>
                </button>
              )
            })}
          </div>
          <ul className="overflow-hidden rounded-lg ring-1 ring-line ring-inset">
            {rows.map((source) => {
              const subject = subjectOf(source.subjectId)
              return (
                <li
                  key={source.id}
                  className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 hover:bg-sunken"
                >
                  <FileText className="size-4 shrink-0 text-ink-3" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/viewer/${source.id}`}
                      className="block truncate font-medium text-ink hover:underline"
                    >
                      {source.title}
                    </Link>
                    <p className="flex items-center gap-2 truncate text-2xs text-ink-3">
                      {subject ? (
                        <span className="inline-flex items-center gap-1">
                          <SubjectDot colour={subject.colour} />
                          {subject.name}
                        </span>
                      ) : null}
                      {source.year ? <span>{source.year}</span> : null}
                      {source.pageCount ? <span>{source.pageCount} pages</span> : null}
                      <span>{formatSize(source.size)}</span>
                    </p>
                  </div>
                  {source.personal ? (
                    <Badge>
                      <Lock className="size-3" aria-hidden /> Personal
                    </Badge>
                  ) : null}
                  {source.ingestStatus === 'ready' ? null : source.ingestStatus === 'error' ? (
                    <Badge tone="danger">Could not read</Badge>
                  ) : (
                    <Badge tone="warn">Reading…</Badge>
                  )}
                  <Select
                    aria-label="Type"
                    className="h-7 w-[150px] text-2xs"
                    value={source.kind}
                    onChange={(e) =>
                      void db.update('sources', source.id, {
                        kind: e.target.value as SourceKind,
                        personal: e.target.value === 'textbook',
                      })
                    }
                  >
                    {SOURCE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {SOURCE_KIND_LABELS[kind]}
                      </option>
                    ))}
                  </Select>
                  {subjectId ? null : (
                    <Select
                      aria-label="Subject"
                      className="h-7 w-[150px] text-2xs"
                      value={source.subjectId ?? ''}
                      onChange={(e) =>
                        void db.update('sources', source.id, { subjectId: e.target.value || null })
                      }
                    >
                      <option value="">No subject</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  )}
                  <IconButton
                    label="Remove from library"
                    size="sm"
                    onClick={() => void remove.run(source.id)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </IconButton>
                </li>
              )
            })}
          </ul>
          <p className="text-2xs text-ink-3">
            Textbooks are marked Personal: they stay on this laptop and are left out of anything you
            share.
          </p>
        </>
      )}
    </div>
  )
}

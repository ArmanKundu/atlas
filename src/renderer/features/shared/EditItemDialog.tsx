import { useState } from 'react'
import { type PickedFile, type SharedItem } from '@shared/community'
import { Button } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Field, Input, Textarea } from '@/design/Form'
import { Markdown } from '@/design/Markdown'
import { Segmented } from '@/design/Segmented'
import { ErrorState } from '@/design/States'
import { useToast } from '@/design/Toast'
import { changed, useAction } from '@/lib/api'
import { call } from '@/lib/ipc'
import { Dropzone } from './ShareDialog'

/** Change something already shared: its details, a note's text, a link, or the file itself. */
export function EditItemDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: SharedItem
}) {
  const toast = useToast()
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.description)
  const [subject, setSubject] = useState(item.subject)
  const [tags, setTags] = useState(item.tags.join(', '))
  const [body, setBody] = useState(item.body)
  const [url, setUrl] = useState(item.linkUrl ?? '')
  const [file, setFile] = useState<PickedFile | null>(null)
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [pickError, setPickError] = useState<string | null>(null)

  const reset = (): void => {
    setTitle(item.title)
    setDescription(item.description)
    setSubject(item.subject)
    setTags(item.tags.join(', '))
    setBody(item.body)
    setUrl(item.linkUrl ?? '')
    setFile(null)
    setMode('write')
    setPickError(null)
  }

  // Fresh form each time it opens (the parent opens it, so Radix sends no open event).
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) reset()
  }

  const save = useAction(async () => {
    await call('shared:update', {
      id: item.id,
      title: title.trim(),
      description,
      subject,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12),
      ...(item.kind === 'note' ? { body } : {}),
      ...(item.kind === 'link' && url.trim() ? { url: url.trim() } : {}),
      ...(item.kind === 'file' && file ? { path: file.path } : {}),
    })
    changed('shared', `shared:${item.id}`)
    toast({
      title: 'Changes saved',
      description: 'Everyone in the space sees the new version.',
      tone: 'success',
    })
    onOpenChange(false)
  })

  const ok =
    title.trim().length > 0 &&
    (item.kind !== 'note' || body.trim().length > 0) &&
    (item.kind !== 'link' || /^https:\/\/\S+$/.test(url.trim()))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) save.clear()
        onOpenChange(next)
      }}
      title={`Edit “${item.title}”`}
      width={item.kind === 'note' ? 720 : 560}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ok || save.pending} onClick={() => void save.run()}>
            {save.pending ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </Field>
        {item.kind === 'note' ? (
          <div className="flex flex-col gap-2">
            <Segmented
              label="Write or preview"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'write', label: 'Write' },
                { value: 'preview', label: 'Preview' },
              ]}
            />
            {mode === 'write' ? (
              <Textarea
                rows={12}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-label="Note"
                className="font-mono text-[0.8125rem] leading-6"
              />
            ) : (
              <div className="prose-atlas min-h-[18rem] rounded-md bg-sunken px-4 py-3 text-ink">
                <Markdown>{body || '_Nothing written yet._'}</Markdown>
              </div>
            )}
          </div>
        ) : item.kind === 'link' ? (
          <Field label="Link">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />
          </Field>
        ) : item.kind === 'file' ? (
          <Field
            label="File"
            hint={
              file ? undefined : `Now: ${item.fileName ?? 'file'}. Drop a new one to replace it.`
            }
          >
            <Dropzone file={file} onFile={setFile} onError={setPickError} />
          </Field>
        ) : null}
        {pickError ? <p className="text-2xs text-danger">{pickError}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Tags" hint="Comma separated">
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
        </div>
        <Field label="Description">
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </Field>
        {save.error ? <ErrorState title="Not saved">{save.error}</ErrorState> : null}
      </div>
    </Dialog>
  )
}

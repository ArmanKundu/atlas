import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Copy, FileText, ShieldCheck, Smartphone, Sparkles } from 'lucide-react'
import type { ScanSession } from '@shared/scanner'
import { Button } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Select } from '@/design/Form'
import { ErrorState } from '@/design/States'
import { useToast } from '@/design/Toast'
import { changed } from '@/lib/api'
import { useSubjects } from '@/lib/app-state'
import { call, subscribe } from '@/lib/ipc'
import { processImportQueue } from './ingest'

interface Received {
  id: string
  title: string
  pages: number
}

/**
 * Scan with your phone: a one-time QR code opens a scanner page on the phone (no app to
 * install). Pages arrive in the library over the home Wi-Fi, filed in the chosen subject.
 */
export function ScanDialog({
  open,
  onOpenChange,
  subjectId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subjectId?: string
}) {
  const subjects = useSubjects()
  const toast = useToast()
  const navigate = useNavigate()
  const [folder, setFolder] = useState<string>(subjectId ?? '')
  const [session, setSession] = useState<ScanSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [received, setReceived] = useState<Received[]>([])
  const [arriving, setArriving] = useState(0)

  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setReceived([])
      setArriving(0)
      setError(null)
      setSession(null)
    }
  }

  // A fresh link each time the dialog opens or the folder changes; closed when it closes.
  useEffect(() => {
    if (!open) return
    let live = true
    call('scanner:start', { subjectId: folder || null })
      .then((s) => live && setSession(s))
      .catch(
        (cause: unknown) =>
          live && setError(cause instanceof Error ? cause.message : String(cause)),
      )
    return () => {
      live = false
      call('scanner:stop').catch(() => undefined)
    }
  }, [open, folder])

  useEffect(() => subscribe('scanner:progress', ({ pages }) => setArriving(pages)), [])

  useEffect(
    () =>
      subscribe('scanner:received', (item) => {
        setReceived((r) => [item, ...r])
        changed('sources')
        void processImportQueue()
        toast({
          title: `${item.title} arrived`,
          description: `${item.pages} page${item.pages === 1 ? '' : 's'}`,
          tone: 'success',
        })
      }),
    [toast],
  )

  const check = (item: Received): void => {
    onOpenChange(false)
    void navigate(
      `/assistant?ask=${encodeURIComponent(
        `I just scanned “${item.title}”. Look through it, mark my answers, point out any mistakes, and add the questions I got wrong to my review list.`,
      )}`,
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Scan with your phone"
      description="Point your phone’s camera at the code. No app to install."
      width={620}
    >
      <div className="flex gap-6">
        <div className="flex w-[220px] shrink-0 flex-col items-center gap-3">
          <div className="grid size-[220px] place-items-center overflow-hidden rounded-2xl bg-white p-3 ring-1 ring-line">
            <AnimatePresence mode="wait">
              {session ? (
                <motion.img
                  key={session.url}
                  src={session.qr}
                  alt="QR code that opens the Atlas scanner on your phone"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="size-full [image-rendering:pixelated]"
                />
              ) : (
                <motion.div key="wait" className="size-full animate-pulse rounded-lg bg-sunken" />
              )}
            </AnimatePresence>
          </div>
          {session ? (
            <button
              type="button"
              title={session.url}
              aria-label="Copy the scan link"
              onClick={() => {
                void navigator.clipboard.writeText(session.url)
                toast({ title: 'Link copied' })
              }}
              className="flex max-w-full items-center gap-1.5 truncate rounded-md px-2 py-1 text-2xs text-ink-3 hover:bg-hover hover:text-ink"
            >
              <Copy className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{session.url.replace(/\/s\/.*/, '/…')}</span>
            </button>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs font-medium text-ink-2">Save scans in</span>
            <Select value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="">No subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </label>
          <ol className="flex flex-col gap-2 text-ink-2">
            {[
              'Open the camera on your phone and scan the code.',
              'Take a photo of each page. Each one comes straight here.',
              'Tap Save in Atlas when you are done, or just close this window.',
            ].map((line, i) => (
              <li key={line} className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-sunken text-2xs font-semibold text-ink">
                  {i + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>
          <p className="flex items-start gap-2 rounded-lg bg-sunken px-3 py-2 text-2xs text-ink-3">
            <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
            Phone and computer must be on the same Wi-Fi. Pages travel straight between them, never
            over the internet, and the link stops working when you close this window.
          </p>
          {error ? <ErrorState>{error}</ErrorState> : null}
        </div>
      </div>

      {arriving > 0 ? (
        <p className="mt-5 flex items-center gap-2 rounded-lg bg-blue-soft px-3 py-2 text-ink">
          <Smartphone className="size-4 shrink-0" aria-hidden />
          {arriving} page{arriving === 1 ? '' : 's'} arrived. Tap Save in Atlas on your phone, or
          close this window, to put {arriving === 1 ? 'it' : 'them'} in your library.
        </p>
      ) : null}
      {received.length > 0 ? (
        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
          {received.map((item) => (
            <motion.div
              key={item.id + item.title}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 rounded-lg bg-success-soft px-3 py-2"
            >
              <CheckCircle2 className="size-4 text-success" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{item.title}</p>
                <p className="text-2xs text-ink-3">
                  {item.pages} page{item.pages === 1 ? '' : 's'} · in your library
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon={<FileText className="size-3.5" aria-hidden />}
                onClick={() => {
                  onOpenChange(false)
                  void navigate(`/viewer/${item.id}`)
                }}
              >
                Open
              </Button>
              <Button
                size="sm"
                variant="secondary"
                icon={<Sparkles className="size-3.5" aria-hidden />}
                onClick={() => check(item)}
              >
                Check my work
              </Button>
            </motion.div>
          ))}
        </div>
      ) : (
        <p className="mt-5 flex items-center justify-center gap-2 border-t border-line pt-4 text-2xs text-ink-3">
          <Smartphone className="size-3.5" aria-hidden /> Waiting for your phone…
        </p>
      )}
    </Dialog>
  )
}

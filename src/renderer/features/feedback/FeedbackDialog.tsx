import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Check, Copy, Download, Square, Trash2, Video } from 'lucide-react'
import type { FeedbackKind } from '@shared/community'
import { Button } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Field, Input, Textarea } from '@/design/Form'
import { Segmented } from '@/design/Segmented'
import { useToast } from '@/design/Toast'
import { useSharedStatus } from '@/features/shared/useSharedStatus'
import { useAction } from '@/lib/api'
import { call } from '@/lib/ipc'

type Phase = 'form' | 'capturing' | 'recording'

interface Capture {
  path: string
  /** A data URL for screenshots, an object URL for recordings. */
  preview: string
  video: boolean
}

const PLACEHOLDER: Record<FeedbackKind, { title: string; body: string }> = {
  bug: {
    title: 'What went wrong?',
    body: 'What did you do, what did you expect, and what happened instead?',
  },
  idea: { title: 'What would you like Atlas to do?', body: 'How would it help you study?' },
  other: { title: 'What is on your mind?', body: 'Anything else worth knowing.' },
}

const MAX_SECONDS = 120

/**
 * Report a bug or suggest a feature, with a screenshot of Atlas or a screen recording.
 * Reports go to the Atlas developer; the capture can also be copied or saved.
 */
export function FeedbackDialog({
  open,
  onOpenChange,
  initialKind = 'bug',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialKind?: FeedbackKind
}) {
  const toast = useToast()
  const status = useSharedStatus()
  const [kind, setKind] = useState<FeedbackKind>(initialKind)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [capture, setCapture] = useState<Capture | null>(null)
  const [phase, setPhase] = useState<Phase>('form')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)

  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open && phase === 'form') {
      setKind(initialKind)
      setError(null)
    }
  }

  const canSend = status.data?.signedIn === true && status.data.access === 'approved'

  const shoot = async (): Promise<void> => {
    setError(null)
    setPhase('capturing')
    // Let the dialog fade out so the screenshot shows Atlas, not this form.
    await new Promise((r) => window.setTimeout(r, 320))
    try {
      const shot = await call('feedback:capture')
      setCapture({ path: shot.path, preview: shot.dataUrl, video: false })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    setPhase('form')
  }

  const record = async (): Promise<void> => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      })
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 })
      const chunks: Blob[] = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data)
      }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: 'video/webm' })
        void blob.arrayBuffer().then(async (buffer) => {
          try {
            const saved = await call('feedback:saveRecording', {
              bytes: new Uint8Array(buffer),
              mime: 'video/webm',
            })
            setCapture({ path: saved.path, preview: URL.createObjectURL(blob), video: true })
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause))
          }
          setPhase('form')
        })
      }
      // Stopping the share from the system bar also ends the recording.
      stream
        .getVideoTracks()[0]
        ?.addEventListener('ended', () => rec.state !== 'inactive' && rec.stop())
      recorder.current = rec
      setSeconds(0)
      setPhase('recording')
      rec.start(1000)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(
        /denied|permission/i.test(message)
          ? 'Atlas needs screen recording permission. Allow it in System Settings, Privacy and Security.'
          : message,
      )
      setPhase('form')
    }
  }

  const stop = (): void => {
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
  }

  useEffect(() => {
    if (phase !== 'recording') return
    const timer = window.setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS && recorder.current?.state === 'recording') recorder.current.stop()
        return s + 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [phase])

  const send = useAction(async () => {
    await call('feedback:send', { kind, title, body, attachment: capture?.path ?? null })
    toast({
      title: kind === 'idea' ? 'Idea sent. Thank you!' : 'Report sent. Thank you!',
      tone: 'success',
    })
    setTitle('')
    setBody('')
    setCapture(null)
    onOpenChange(false)
  })

  const copy = useAction(async () => {
    if (!capture) return
    await call('feedback:copyImage', { path: capture.path })
    toast({ title: 'Screenshot copied', tone: 'success' })
  })
  const save = useAction(async () => {
    if (!capture) return
    if (await call('feedback:saveAs', { path: capture.path }))
      toast({ title: 'Saved', tone: 'success' })
  })

  const words = PLACEHOLDER[kind]
  return (
    <>
      <Dialog
        open={open && phase === 'form'}
        onOpenChange={(next) => {
          if (!next) onOpenChange(false)
        }}
        title="Report a bug or suggest a feature"
        description="It goes straight to the person who makes Atlas."
        width={560}
        footer={
          <div className="flex w-full items-center gap-2">
            <p className="flex-1 text-2xs text-ink-3">
              {canSend
                ? 'Sends your text, Atlas version and system. Nothing else.'
                : 'Sign in on the Shared page to send. You can still copy or save the capture.'}
            </p>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!canSend || !title.trim() || send.pending}
              onClick={() => void send.run()}
            >
              {send.pending ? 'Sending…' : 'Send'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Segmented
            label="Kind of report"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'bug', label: 'Bug' },
              { value: 'idea', label: 'Feature idea' },
              { value: 'other', label: 'Other' },
            ]}
            className="self-start"
          />
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={words.title}
              maxLength={140}
              autoFocus
            />
          </Field>
          <Field label="Details" hint="Optional">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={words.body}
              rows={4}
              maxLength={8000}
            />
          </Field>

          <div>
            <p className="mb-2 text-2xs font-medium text-ink-2">Show it</p>
            <AnimatePresence mode="wait" initial={false}>
              {capture ? (
                <motion.div
                  key="capture"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="overflow-hidden rounded-xl ring-1 ring-line"
                >
                  {capture.video ? (
                    <video src={capture.preview} controls className="max-h-56 w-full bg-black" />
                  ) : (
                    <img
                      src={capture.preview}
                      alt="Screenshot of Atlas"
                      className="max-h-56 w-full bg-sunken object-contain"
                    />
                  )}
                  <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
                    <span className="flex-1 pl-1 text-2xs text-ink-3">
                      {capture.video ? 'Screen recording' : 'Screenshot'} attached
                    </span>
                    {capture.video ? null : (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Copy className="size-3.5" aria-hidden />}
                        onClick={() => void copy.run()}
                      >
                        Copy
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Download className="size-3.5" aria-hidden />}
                      onClick={() => void save.run()}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="size-3.5" aria-hidden />}
                      onClick={() => setCapture(null)}
                    >
                      Remove
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="pick"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-2 gap-2"
                >
                  <CaptureChoice
                    icon={<Camera className="size-4" aria-hidden />}
                    title="Screenshot"
                    hint="Of this Atlas window"
                    onClick={() => void shoot()}
                  />
                  <CaptureChoice
                    icon={<Video className="size-4" aria-hidden />}
                    title="Record screen"
                    hint={`Up to ${MAX_SECONDS / 60} minutes`}
                    onClick={() => void record()}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {error || send.error || copy.error || save.error ? (
            <p className="text-2xs text-danger">
              {error ?? send.error ?? copy.error ?? save.error}
            </p>
          ) : null}
        </div>
      </Dialog>
      {phase === 'recording'
        ? createPortal(
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink py-1.5 pr-1.5 pl-4 text-surface shadow-dialog"
            >
              <motion.span
                className="size-2.5 rounded-full bg-danger"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <span className="font-medium tabular-nums">
                Recording {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
              </span>
              <button
                type="button"
                onClick={stop}
                className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-2xs font-semibold text-ink hover:opacity-90"
              >
                <Square className="size-3 fill-current" aria-hidden /> Stop
              </button>
            </motion.div>,
            document.body,
          )
        : null}
    </>
  )
}

function CaptureChoice({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  hint: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3 py-3 text-left ring-1 ring-line transition-colors hover:bg-hover"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-sunken text-ink-2">{icon}</span>
      <span>
        <span className="block font-medium text-ink">{title}</span>
        <span className="block text-2xs text-ink-3">{hint}</span>
      </span>
      <Check className="ml-auto hidden size-3.5" aria-hidden />
    </button>
  )
}

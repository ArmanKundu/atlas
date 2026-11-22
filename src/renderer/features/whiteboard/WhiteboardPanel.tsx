import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Circle,
  Download,
  FolderPlus,
  ImageDown,
  Pause,
  Play,
  RotateCcw,
  Share2,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { canWrite } from '@shared/community'
import { BOARD_H, BOARD_W, type Board } from '@shared/whiteboard'
import { Button, IconButton } from '@/design/Button'
import { Menu } from '@/design/Menu'
import { useToast } from '@/design/Toast'
import { changed, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call, subscribe } from '@/lib/ipc'
import { useSetting } from '@/lib/settings'
import { drawCursor, drawPiece, paper, plan, type Piece } from './draw'

const GAP = 110
const STEP_PAUSE = 650

interface Step {
  say: string
  pieces: Piece[]
  /** Start time of each piece inside the step, in ms. */
  starts: number[]
  drawMs: number
}

function prepare(board: Board): Step[] {
  const state = { axes: null }
  return board.steps.map((s) => {
    const pieces = plan(s.draw, state)
    const starts: number[] = []
    let t = 0
    for (const p of pieces) {
      starts.push(t)
      t += p.ms + GAP
    }
    return { say: s.say, pieces, starts, drawMs: t }
  })
}

/** Every piece before step `index`, drawn in full, since the last wipe. */
function drawUpTo(ctx: CanvasRenderingContext2D, steps: Step[], index: number): void {
  paper(ctx)
  for (let i = 0; i < index; i++) {
    for (const piece of steps[i]?.pieces ?? []) {
      if (piece.kind === 'clear') paper(ctx)
      else drawPiece(ctx, piece, 1)
    }
  }
}

function slug(title: string): string {
  return (
    title
      .replace(/[^\w ]+/g, '')
      .trim()
      .slice(0, 60) || 'Whiteboard'
  )
}

/**
 * The whiteboard explainer: draws the assistant's board step by step with a moving pen and
 * reads each step aloud with an open-source voice that runs on this computer.
 */
export function WhiteboardPanel({
  board,
  subjectId,
  onClose,
}: {
  board: Board
  subjectId: string | null
  onClose: () => void
}) {
  const toast = useToast()
  const steps = useMemo(() => prepare(board), [board])
  const canvas = useRef<HTMLCanvasElement>(null)
  const base = useRef<HTMLCanvasElement | null>(null)
  const [index, setIndex] = useState(0)
  // Starts playing as soon as it opens.
  const [playing, setPlaying] = useState(true)
  const [done, setDone] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [voiceOn, setVoiceOn] = useSetting<boolean>('whiteboard.voice', true)
  const [voiceId] = useSetting<string>('whiteboard.voiceId', 'af_heart')
  const [speed, setSpeed] = useSetting<number>('whiteboard.speed', 1)
  const voice = useLive([], () => call('voice:status'))
  const [download, setDownload] = useState<{ loaded: number; total: number } | null>(null)
  const spaces = useLive(['shared'], () => call('shared:spaces').catch(() => []))

  // Playback clock for the current step.
  const clock = useRef({ start: 0, offset: 0 })
  const audio = useRef<{ ctx: AudioContext; dest: MediaStreamAudioDestinationNode } | null>(null)
  const clips = useRef(new Map<number, Promise<AudioBuffer | null>>())
  const playingClip = useRef<AudioBufferSourceNode | null>(null)
  const clipMs = useRef(0)
  const recorder = useRef<MediaRecorder | null>(null)

  useEffect(
    () =>
      subscribe('models:progress', (p) => {
        if (p.id !== 'voice') return
        setDownload(p.state === 'downloading' ? { loaded: p.loaded, total: p.total } : null)
        if (p.state !== 'downloading') void voice.reload()
      }),
    [voice],
  )

  const audioCtx = useCallback(() => {
    if (!audio.current) {
      const ctx = new AudioContext()
      audio.current = { ctx, dest: ctx.createMediaStreamDestination() }
    }
    return audio.current
  }, [])

  const clip = useCallback(
    (i: number): Promise<AudioBuffer | null> => {
      const say = steps[i]?.say
      if (!voiceOn || !say) return Promise.resolve(null)
      const key = i
      const cached = clips.current.get(key)
      if (cached) return cached
      const job = call('voice:speak', { text: say, voice: voiceId, speed: 1 })
        .then(({ wav }) =>
          wav.byteLength ? audioCtx().ctx.decodeAudioData(wav.slice().buffer) : null,
        )
        .catch(() => null)
      clips.current.set(key, job)
      return job
    },
    [steps, voiceOn, voiceId, audioCtx],
  )

  // A new voice or a new board: forget the clips made for the old one.
  useEffect(() => {
    clips.current = new Map()
  }, [voiceId, board])

  const stopClip = (): void => {
    try {
      playingClip.current?.stop()
    } catch {
      // already stopped
    }
    playingClip.current = null
  }

  /** Redraws everything before step `i` into the base layer. */
  const rebase = useCallback(
    (i: number) => {
      const b = base.current ?? document.createElement('canvas')
      base.current = b
      b.width = BOARD_W * 2
      b.height = BOARD_H * 2
      const ctx = b.getContext('2d')
      if (!ctx) return
      ctx.setTransform(2, 0, 0, 2, 0, 0)
      drawUpTo(ctx, steps, i)
    },
    [steps],
  )

  const startStep = useCallback(
    async (i: number) => {
      stopClip()
      rebase(i)
      setIndex(i)
      setDone(false)
      clock.current = { start: performance.now(), offset: 0 }
      clipMs.current = 0
      setWaiting(true)
      const buffer = await clip(i)
      // Make the next step's voice while this one plays.
      if (i + 1 < steps.length) void clip(i + 1)
      setWaiting(false)
      clock.current = { start: performance.now(), offset: 0 }
      if (buffer) {
        const { ctx, dest } = audioCtx()
        if (ctx.state === 'suspended') await ctx.resume()
        const src = ctx.createBufferSource()
        src.buffer = buffer
        src.playbackRate.value = speed
        src.connect(ctx.destination)
        src.connect(dest)
        src.start()
        playingClip.current = src
        // Board time runs `speed` times faster than the clock, like the audio.
        clipMs.current = buffer.duration * 1000
      }
    },
    [rebase, clip, steps.length, audioCtx, speed],
  )

  // Draw loop.
  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    let frame = 0
    const render = (): void => {
      const step = steps[index]
      const elapsed =
        playing && !waiting
          ? (performance.now() - clock.current.start) * speed + clock.current.offset
          : clock.current.offset
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      if (base.current) ctx.drawImage(base.current, 0, 0, el.width, el.height)
      const scale = el.width / BOARD_W
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      let tip: [number, number] | null = null
      let tipColor = '#1f2328'
      if (step) {
        step.pieces.forEach((piece, n) => {
          const start = step.starts[n] ?? 0
          const local = done ? piece.ms : elapsed - start
          if (local <= 0) return
          if (piece.kind === 'clear') {
            paper(ctx)
            return
          }
          const t = drawPiece(ctx, piece, local / piece.ms)
          if (local < piece.ms && t) {
            tip = t
            tipColor = piece.color
          }
        })
      }
      if (tip && playing) drawCursor(ctx, tip, tipColor)
      if (playing && !waiting && step && !done) {
        const total = Math.max(step.drawMs, clipMs.current) + STEP_PAUSE
        if (elapsed >= total) {
          if (index + 1 < steps.length) void startStep(index + 1)
          else {
            setPlaying(false)
            setDone(true)
            clock.current.offset = step.drawMs
            if (recorder.current?.state === 'recording') recorder.current.stop()
          }
        }
      }
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    return () => cancelAnimationFrame(frame)
  }, [steps, index, playing, waiting, done, speed, startStep])

  // Start when the board opens. The first frame shows the paper while the voice loads.
  useEffect(() => {
    rebase(0)
    const first = window.setTimeout(() => void startStep(0), 0)
    return () => {
      window.clearTimeout(first)
      stopClip()
      void audio.current?.ctx.close()
      audio.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per board
  }, [board])

  const toggle = (): void => {
    if (done) {
      setPlaying(true)
      void startStep(0)
      return
    }
    if (playing) {
      clock.current.offset += (performance.now() - clock.current.start) * speed
      void audio.current?.ctx.suspend()
      setPlaying(false)
    } else {
      clock.current.start = performance.now()
      void audio.current?.ctx.resume()
      setPlaying(true)
    }
  }

  const go = (i: number): void => {
    const next = Math.max(0, Math.min(steps.length - 1, i))
    setPlaying(true)
    void startStep(next)
  }

  /** The finished board as a PNG, without the cursor. */
  const finishedPng = async (): Promise<Uint8Array<ArrayBuffer>> => {
    const out = document.createElement('canvas')
    out.width = BOARD_W * 2
    out.height = BOARD_H * 2
    const ctx = out.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.setTransform(2, 0, 0, 2, 0, 0)
    drawUpTo(ctx, steps, steps.length)
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'))
    if (!blob) throw new Error('no image')
    return new Uint8Array(await blob.arrayBuffer())
  }

  const saveImage = async (): Promise<void> => {
    const bytes = await finishedPng()
    if (await call('files:saveBytes', { bytes, name: `${slug(board.title)}.png` }))
      toast({ title: 'Image saved', tone: 'success' })
  }

  const toLibrary = async (): Promise<void> => {
    const bytes = await finishedPng()
    const path = await call('files:stashBytes', { bytes, name: `${slug(board.title)}.png` })
    await call('library:importPaths', { subjectId, paths: [path], kind: 'class_notes' })
    changed('sources')
    toast({ title: 'Saved to your library', tone: 'success' })
  }

  const share = async (spaceId: string, name: string): Promise<void> => {
    const bytes = await finishedPng()
    const path = await call('files:stashBytes', { bytes, name: `${slug(board.title)}.png` })
    await call('shared:publish', {
      kind: 'file',
      path,
      spaceId,
      title: board.title,
      description: steps
        .map((s) => s.say)
        .join(' ')
        .slice(0, 400),
      subject: '',
      tags: ['whiteboard'],
    })
    changed('shared')
    toast({ title: `Shared to ${name}`, tone: 'success' })
  }

  /** Plays the board from the start while recording the canvas and the voice to a video. */
  const recordVideo = async (): Promise<void> => {
    const el = canvas.current
    if (!el) return
    const { dest } = audioCtx()
    const stream = new MediaStream([
      ...el.captureStream(30).getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ])
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm'
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      setRecording(false)
      const blob = new Blob(chunks, { type: 'video/webm' })
      void blob.arrayBuffer().then(async (buffer) => {
        if (
          await call('files:saveBytes', {
            bytes: new Uint8Array(buffer),
            name: `${slug(board.title)}.webm`,
          })
        )
          toast({ title: 'Video saved', tone: 'success' })
      })
    }
    recorder.current = rec
    setRecording(true)
    rec.start(500)
    setPlaying(true)
    await startStep(0)
  }

  const run = (work: () => Promise<void>): void => {
    void work().catch((cause: unknown) =>
      toast({ title: cause instanceof Error ? cause.message : String(cause), tone: 'info' }),
    )
  }

  const writable = (spaces.data ?? []).filter((s) => canWrite(s.role))
  const voiceMissing = voiceOn && voice.data !== 'ready'
  const step = steps[index]

  return (
    <aside className="flex w-[min(52%,760px)] min-w-[420px] shrink-0 flex-col border-l border-line bg-surface">
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-medium tracking-wide text-ink-3 uppercase">Whiteboard</p>
          <h2 className="truncate font-semibold text-ink">{board.title}</h2>
        </div>
        <Menu
          trigger={
            <Button
              size="sm"
              variant="secondary"
              icon={<Download className="size-3.5" aria-hidden />}
            >
              Save
            </Button>
          }
          items={[
            {
              label: 'Download image',
              icon: <ImageDown className="size-4" aria-hidden />,
              onSelect: () => run(saveImage),
            },
            {
              label: recording ? 'Recording…' : 'Record video',
              icon: <Circle className="size-4 text-danger" aria-hidden />,
              disabled: recording,
              onSelect: () => run(recordVideo),
            },
            {
              label: 'Save to library',
              icon: <FolderPlus className="size-4" aria-hidden />,
              onSelect: () => run(toLibrary),
            },
            ...writable.map((s) => ({
              label: `Share to ${s.name}`,
              icon: <Share2 className="size-4" aria-hidden />,
              onSelect: () => run(() => share(s.id, s.name)),
            })),
          ]}
        />
        <IconButton label="Close whiteboard" size="sm" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </IconButton>
      </header>

      <div className="px-4">
        <div className="relative overflow-hidden rounded-xl shadow-pill ring-1 ring-line">
          <canvas
            ref={canvas}
            width={BOARD_W * 2}
            height={BOARD_H * 2}
            className="block aspect-[1000/625] w-full"
            onClick={toggle}
          />
          {recording ? (
            <span className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-danger px-2 py-0.5 text-2xs font-semibold text-white">
              <span className="size-1.5 animate-pulse rounded-full bg-white" /> REC
            </span>
          ) : null}
          {waiting && voiceOn ? (
            <span className="absolute right-2 bottom-2 rounded-full bg-ink/80 px-2.5 py-1 text-2xs text-surface">
              {download && download.total
                ? `Downloading voice ${Math.round((download.loaded / download.total) * 100)}%`
                : 'Preparing voice…'}
            </span>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <p className="text-2xs font-medium text-ink-3">
          Step {index + 1} of {steps.length}
        </p>
        <p className="mt-1 text-[0.9375rem] leading-6 text-ink">{step?.say}</p>
        {voiceMissing && voice.data !== 'downloading' && !download ? (
          <p className="mt-3 text-2xs text-ink-3">
            The voice is Kokoro, an open-source model that runs on this computer. It downloads once
            (about 90 MB).
          </p>
        ) : null}
      </div>

      <footer className="flex items-center gap-1 border-t border-line px-3 py-2">
        <IconButton
          label="Previous step"
          size="sm"
          onClick={() => go(index - 1)}
          disabled={index === 0}
        >
          <SkipBack className="size-4" aria-hidden />
        </IconButton>
        <button
          type="button"
          aria-label={playing ? 'Pause' : done ? 'Play again' : 'Play'}
          onClick={toggle}
          className="grid size-9 place-items-center rounded-full bg-accent text-accent-fg hover:bg-accent-hover"
        >
          {done ? (
            <RotateCcw className="size-4" aria-hidden />
          ) : playing ? (
            <Pause className="size-4 fill-current" aria-hidden />
          ) : (
            <Play className="size-4 translate-x-px fill-current" aria-hidden />
          )}
        </button>
        <IconButton
          label="Next step"
          size="sm"
          onClick={() => go(index + 1)}
          disabled={index >= steps.length - 1}
        >
          <SkipForward className="size-4" aria-hidden />
        </IconButton>
        <div className="mx-2 flex flex-1 gap-1">
          {steps.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => go(i)}
              className={cn(
                'h-1.5 flex-1 rounded-full',
                i < index || done ? 'bg-ink' : i === index ? 'bg-ink/50' : 'bg-line-strong',
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSpeed(speed >= 1.5 ? 0.75 : speed >= 1 ? 1.5 : 1)}
          className="h-7 rounded-md px-2 text-2xs font-semibold text-ink-2 tabular-nums hover:bg-hover"
          aria-label="Playback speed"
        >
          {speed}×
        </button>
        <IconButton
          label={voiceOn ? 'Turn the voice off' : 'Turn the voice on'}
          size="sm"
          onClick={() => setVoiceOn(!voiceOn)}
        >
          {voiceOn ? (
            <Volume2 className="size-4" aria-hidden />
          ) : (
            <VolumeX className="size-4" aria-hidden />
          )}
        </IconButton>
      </footer>
    </aside>
  )
}

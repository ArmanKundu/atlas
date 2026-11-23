import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Captions, Check, Hand, Loader2, Pause, Play, RotateCcw, X } from 'lucide-react'
import { speakingSeconds, subtitleAt, type Lesson } from '@shared/lesson'
import { useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { useSetting } from '@/lib/settings'
import { MicButton } from '@/features/voice/MicButton'
import { clip, lessonAudio } from './audio'
import { Stage } from './Stage'
import { Tutor } from './Tutor'

const clock = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * Plays a lesson: each scene is drawn in time with its narration. While the lesson is still being
 * written (`live`), it starts as soon as the first scene is complete and waits for the next.
 */
export function Player({
  lesson,
  live = false,
  autoPlay = true,
  startScene = 0,
  onScene,
  onEnded,
  onAsk: askProp,
  busy = false,
  tutor = true,
  models3d = true,
}: {
  lesson: Lesson
  live?: boolean
  autoPlay?: boolean
  /** Pick up from this scene (coming back after answering an interruption). */
  startScene?: number
  onScene?: (scene: number) => void
  onEnded?: () => void
  /** The student interrupted with a question, typed or spoken, at this scene. */
  onAsk?: (question: string, scene: number) => void
  /** The tutor is working on an answer. */
  busy?: boolean
  /** The talking tutor, interruptions and quick checks (the admin can turn these off). */
  tutor?: boolean
  /** Interactive 3D models (the admin can turn these off). */
  models3d?: boolean
}) {
  const onAsk = tutor ? askProp : undefined
  const [voiceOn] = useSetting<boolean>('whiteboard.voice', true)
  const [voiceId] = useSetting<string>('whiteboard.voiceId', 'af_heart')
  const [captions, setCaptions] = useSetting<boolean>('explainer.captions', true)
  const voice = useLive([], () => call('voice:status'))
  const speak = voiceOn && voice.data === 'ready'

  const [scene, setScene] = useState(() => Math.min(startScene, lesson.scenes.length - 1))
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(autoPlay)
  const [waiting, setWaiting] = useState(false)
  const [durations, setDurations] = useState<Record<number, number>>({})
  const [seek, setSeek] = useState(0)
  const source = useRef<AudioBufferSourceNode | null>(null)
  // A check-in question waiting for an answer, and the ones already answered.
  const [checking, setChecking] = useState<number | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const answered = useRef(new Set<number>())
  const [mood, setMood] = useState<'idle' | 'happy' | 'concerned' | 'thinking'>('idle')
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [lineTalking, setLineTalking] = useState(false)
  const line = useRef<AudioBufferSourceNode | null>(null)

  /** The tutor says one line outside the lesson's narration (a question, feedback). */
  const sayLine = useCallback(
    async (text: string): Promise<void> => {
      try {
        line.current?.stop()
      } catch {
        // already stopped
      }
      if (!speak || !text) return
      const { ctx, meter } = lessonAudio()
      if (ctx.state === 'suspended') await ctx.resume()
      const buf = await clip(text, voiceId)
      if (!buf) return
      const node = ctx.createBufferSource()
      node.buffer = buf
      node.connect(ctx.destination)
      node.connect(meter)
      node.onended = () => setLineTalking(false)
      setLineTalking(true)
      node.start()
      line.current = node
    },
    [speak, voiceId],
  )
  useEffect(
    () => () => {
      try {
        line.current?.stop()
      } catch {
        // already stopped
      }
    },
    [],
  )

  const seconds = useMemo(
    () => lesson.scenes.map((s, i) => durations[i] ?? speakingSeconds(s.say)),
    [lesson.scenes, durations],
  )

  // Make the voice for every scene as soon as it exists.
  useEffect(() => {
    if (!speak) return
    let alive = true
    lesson.scenes.forEach((s, i) => {
      void clip(s.say, voiceId).then((buf) => {
        if (alive && buf)
          setDurations((d) => (d[i] === buf.duration + 0.6 ? d : { ...d, [i]: buf.duration + 0.6 }))
      })
    })
    return () => {
      alive = false
    }
  }, [lesson.scenes, speak, voiceId])

  useEffect(() => onScene?.(scene), [scene, onScene])

  const stopAudio = useCallback(() => {
    try {
      source.current?.stop()
    } catch {
      // already stopped
    }
    source.current = null
  }, [])

  // The clock for the current scene: the voice when there is one, otherwise the wall clock.
  useEffect(() => {
    if (!playing) return
    const current = lesson.scenes[scene]
    if (!current) return
    let alive = true
    let frame = 0
    let begin = 0
    const offset = t
    const { ctx, tap, meter } = lessonAudio()

    const tick = (): void => {
      if (!alive) return
      const now = speak ? ctx.currentTime - begin : (performance.now() - begin) / 1000
      const local = offset + now
      const length = seconds[scene] ?? 6
      if (local >= length) {
        setT(length)
        if (tutor && current.check && !answered.current.has(scene)) {
          // The tutor asks a quick question before moving on.
          setPlaying(false)
          setChecking(scene)
          setPicked(null)
          void sayLine(current.check.q)
        } else if (scene + 1 < lesson.scenes.length) {
          setScene(scene + 1)
          setT(0)
        } else if (live) setWaiting(true)
        else {
          setPlaying(false)
          onEnded?.()
        }
        return
      }
      setT(local)
      frame = requestAnimationFrame(tick)
    }

    const start = async (): Promise<void> => {
      if (speak) {
        if (ctx.state === 'suspended') await ctx.resume()
        const buf = await clip(current.say, voiceId)
        if (!alive) return
        begin = ctx.currentTime
        if (buf && offset < buf.duration) {
          const node = ctx.createBufferSource()
          node.buffer = buf
          node.connect(ctx.destination)
          node.connect(tap)
          node.connect(meter)
          node.start(0, offset)
          source.current = node
        }
      } else begin = performance.now()
      frame = requestAnimationFrame(tick)
    }
    void start()
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      stopAudio()
    }
    // `t` is read once as the starting offset; re-running on every frame would restart the clip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, scene, seek, speak, voiceId, lesson.scenes.length, seconds[scene]])

  // A new scene arrived while we were waiting for it (adjusted during render, not in an effect).
  if (waiting && scene + 1 < lesson.scenes.length) {
    setWaiting(false)
    setScene(scene + 1)
    setT(0)
  }

  const go = (next: number, offset = 0): void => {
    stopAudio()
    setWaiting(false)
    setChecking(null)
    setScene(Math.max(0, Math.min(lesson.scenes.length - 1, next)))
    setT(offset)
    setSeek((n) => n + 1)
  }
  // One timeline for the whole lesson, like a video.
  const starts = seconds.map((_, i) => seconds.slice(0, i).reduce((a, b) => a + b, 0))
  const total = seconds.reduce((a, b) => a + b, 0)
  const now = (starts[scene] ?? 0) + t
  const seekTo = (time: number): void => {
    let i = seconds.length - 1
    while (i > 0 && (starts[i] ?? 0) > time) i--
    go(i, Math.max(0, time - (starts[i] ?? 0)))
  }
  const ended =
    !playing &&
    checking === null &&
    scene === lesson.scenes.length - 1 &&
    t >= (seconds[scene] ?? 0) - 0.01
  const say = lesson.scenes[scene]?.say ?? ''
  const check = checking === null ? null : (lesson.scenes[checking]?.check ?? null)

  const toggle = (): void => {
    if (checking !== null || asking) return
    if (ended) {
      go(0)
      setPlaying(true)
    } else setPlaying((p) => !p)
  }
  const interrupt = (): void => {
    setPlaying(false)
    setAsking(true)
    setMood('thinking')
  }
  const sendQuestion = (text: string): void => {
    const q = text.trim()
    if (!q || !onAsk) return
    setAsking(false)
    setQuestion('')
    setMood('idle')
    onAsk(q, scene)
  }
  const pick = (i: number): void => {
    if (!check || picked !== null || checking === null) return
    setPicked(i)
    answered.current.add(checking)
    const right = i === check.answer
    setMood(right ? 'happy' : 'concerned')
    void sayLine(
      `${right ? 'Yes, nice one!' : `Not quite. It's ${check.options[check.answer] ?? ''}.`} ${check.why}`,
    )
  }
  const carryOn = (): void => {
    try {
      line.current?.stop()
    } catch {
      // already stopped
    }
    setChecking(null)
    setMood('idle')
    if (scene + 1 < lesson.scenes.length) {
      setScene(scene + 1)
      setT(0)
      setPlaying(true)
    } else onEnded?.()
  }
  const tutorNote = busy
    ? 'Good question, let me show you…'
    : asking
      ? 'What would you like to know?'
      : !playing && !ended && checking === null && onAsk
        ? 'Paused. Ask me anything with ✋'
        : null

  return (
    <div className="group/player overflow-hidden rounded-2xl bg-black shadow-pop ring-1 ring-line">
      <div
        className="relative"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-interactive]')) return
          toggle()
        }}
      >
        <Stage
          lesson={lesson}
          scene={scene}
          t={t}
          seconds={seconds}
          caption={captions ? subtitleAt(say, t, seconds[scene] ?? 6) : null}
          models3d={models3d}
        />
        {waiting ? (
          <div className="absolute top-4 right-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-2xs text-white">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Writing the next scene…
          </div>
        ) : null}
        {tutor ? (
          <div className="absolute bottom-[12%] left-4">
            <Tutor
              talking={(playing && !waiting) || lineTalking || busy}
              withVoice={speak && !busy}
              mood={busy ? 'thinking' : mood}
              note={tutorNote}
            />
          </div>
        ) : null}
        {check && checking !== null ? (
          <div
            data-interactive
            className="absolute inset-0 grid place-items-center bg-black/45 p-6"
          >
            <div className="w-full max-w-lg rounded-2xl bg-surface p-5 shadow-pop">
              <p className="text-2xs font-medium tracking-wide text-ink-3 uppercase">Quick check</p>
              <p className="mt-1 text-[1.0625rem] font-semibold text-ink">{check.q}</p>
              <div className="mt-3 grid gap-2">
                {check.options.map((option, i) => {
                  const right = picked !== null && i === check.answer
                  const wrong = picked === i && i !== check.answer
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={picked !== null}
                      onClick={() => pick(i)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2.5 text-left ring-1 ring-line transition-colors',
                        picked === null && 'hover:bg-hover',
                        right && 'bg-success-soft text-success ring-success/40',
                        wrong && 'bg-danger-soft text-danger ring-danger/40',
                      )}
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-hover text-2xs font-semibold">
                        {right ? (
                          <Check className="size-3.5" aria-hidden />
                        ) : wrong ? (
                          <X className="size-3.5" aria-hidden />
                        ) : (
                          String.fromCharCode(65 + i)
                        )}
                      </span>
                      {option}
                    </button>
                  )
                })}
              </div>
              {picked !== null ? (
                <>
                  {check.why ? <p className="mt-3 text-ink-2">{check.why}</p> : null}
                  <button
                    type="button"
                    onClick={carryOn}
                    className="mt-4 h-9 rounded-lg bg-accent px-4 font-medium text-accent-fg hover:bg-accent-hover"
                  >
                    Keep going
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={carryOn}
                  className="mt-3 text-2xs text-ink-3 hover:text-ink"
                >
                  Skip
                </button>
              )}
            </div>
          </div>
        ) : null}
        {asking ? (
          <form
            data-interactive
            onSubmit={(e) => {
              e.preventDefault()
              sendQuestion(question)
            }}
            className="absolute right-4 bottom-4 left-28 flex items-center gap-2 rounded-xl bg-surface p-2 shadow-pop"
          >
            <Hand className="ml-1 size-4 shrink-0 text-ink-3" aria-hidden />
            <input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setAsking(false)
                  setMood('idle')
                  setPlaying(true)
                }
              }}
              placeholder="Type or say your question"
              aria-label="Your question"
              className="h-8 min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
            />
            <MicButton onText={(text) => sendQuestion(text)} />
            <button
              type="submit"
              aria-label="Ask"
              disabled={!question.trim()}
              className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                setAsking(false)
                setMood('idle')
                setPlaying(true)
              }}
              className="h-8 rounded-md px-2 text-2xs text-ink-2 hover:bg-hover"
            >
              Keep watching
            </button>
          </form>
        ) : null}
      </div>
      <div className="flex items-center gap-1 bg-[#101114] px-3 py-2 text-white">
        <button
          type="button"
          aria-label={ended ? 'Replay' : playing ? 'Pause' : 'Play'}
          onClick={toggle}
          className="grid size-9 place-items-center rounded-full bg-white text-black hover:bg-white/90"
        >
          {ended ? (
            <RotateCcw className="size-4" aria-hidden />
          ) : playing ? (
            <Pause className="size-4 fill-current" aria-hidden />
          ) : (
            <Play className="size-4 translate-x-px fill-current" aria-hidden />
          )}
        </button>
        <span className="ml-2 w-11 text-right font-mono text-2xs text-white/70">{clock(now)}</span>
        <div className="relative mx-3 flex h-6 flex-1 items-center">
          <div className="absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: `${total ? Math.min(100, (now / total) * 100) : 0}%` }}
            />
          </div>
          {live ? (
            <span
              className="absolute right-0 h-1.5 w-10 animate-pulse rounded-full bg-white/25"
              aria-hidden
            />
          ) : null}
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={Math.max(0.1, total)}
            step={0.1}
            value={Math.min(now, total)}
            onChange={(e) => seekTo(Number(e.target.value))}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        </div>
        <span className="mr-2 font-mono text-2xs text-white/50">
          {live ? 'writing…' : clock(total)}
        </span>
        {onAsk ? (
          <button
            type="button"
            onClick={interrupt}
            disabled={busy}
            className="mr-1 flex h-8 items-center gap-1.5 rounded-full bg-white/15 px-3 text-2xs font-medium hover:bg-white/25 disabled:opacity-40"
          >
            <Hand className="size-4" aria-hidden /> Ask
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Captions"
          aria-pressed={captions}
          onClick={() => setCaptions(!captions)}
          className={cn(
            'grid size-8 place-items-center rounded-md hover:bg-white/10',
            !captions && 'text-white/40',
          )}
        >
          <Captions className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}

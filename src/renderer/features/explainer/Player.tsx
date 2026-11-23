import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Captions, Loader2, Pause, Play, RotateCcw } from 'lucide-react'
import { speakingSeconds, subtitleAt, type Lesson } from '@shared/lesson'
import { useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { useSetting } from '@/lib/settings'
import { clip, lessonAudio } from './audio'
import { Stage } from './Stage'

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
  onScene,
  onEnded,
}: {
  lesson: Lesson
  live?: boolean
  autoPlay?: boolean
  onScene?: (scene: number) => void
  onEnded?: () => void
}) {
  const [voiceOn] = useSetting<boolean>('whiteboard.voice', true)
  const [voiceId] = useSetting<string>('whiteboard.voiceId', 'af_heart')
  const [captions, setCaptions] = useSetting<boolean>('explainer.captions', true)
  const voice = useLive([], () => call('voice:status'))
  const speak = voiceOn && voice.data === 'ready'

  const [scene, setScene] = useState(0)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(autoPlay)
  const [waiting, setWaiting] = useState(false)
  const [durations, setDurations] = useState<Record<number, number>>({})
  const [seek, setSeek] = useState(0)
  const source = useRef<AudioBufferSourceNode | null>(null)

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
    const { ctx, tap } = lessonAudio()

    const tick = (): void => {
      if (!alive) return
      const now = speak ? ctx.currentTime - begin : (performance.now() - begin) / 1000
      const local = offset + now
      const length = seconds[scene] ?? 6
      if (local >= length) {
        setT(length)
        if (scene + 1 < lesson.scenes.length) {
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
  const ended = !playing && scene === lesson.scenes.length - 1 && t >= (seconds[scene] ?? 0) - 0.01
  const say = lesson.scenes[scene]?.say ?? ''

  return (
    <div className="group/player overflow-hidden rounded-2xl bg-black shadow-pop ring-1 ring-line">
      <div className="relative">
        <Stage
          lesson={lesson}
          scene={scene}
          t={t}
          seconds={seconds}
          caption={captions ? subtitleAt(say, t, seconds[scene] ?? 6) : null}
        />
        {waiting ? (
          <div className="absolute top-4 right-4 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-2xs text-white">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Writing the next scene…
          </div>
        ) : null}
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (ended) {
              go(0)
              setPlaying(true)
            } else setPlaying((p) => !p)
          }}
          className="absolute inset-0"
        />
      </div>
      <div className="flex items-center gap-1 bg-[#101114] px-3 py-2 text-white">
        <button
          type="button"
          aria-label={ended ? 'Replay' : playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (ended) {
              go(0)
              setPlaying(true)
            } else setPlaying((p) => !p)
          }}
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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useToast } from '@/design/Toast'
import { changed, db } from '@/lib/api'
import { useAppState } from '@/lib/app-state'
import { call } from '@/lib/ipc'

export type TimerMode = 'focus' | 'stopwatch'

interface Saved {
  mode: TimerMode
  subjectId: string | null
  /** When the current run started, or null while paused or idle. */
  runningSince: number | null
  /** Seconds already counted before the current run. */
  banked: number
  /** When the whole session began (first start). */
  startedAt: number | null
}

interface TimerState extends Saved {
  /** Seconds studied in this session so far. */
  elapsed: number
  /** Focus length in seconds. */
  target: number
  running: boolean
  active: boolean
  start: () => void
  pause: () => void
  /** Ends the session and logs it. Sessions under a minute are not logged. */
  stop: () => Promise<void>
  setMode: (mode: TimerMode) => void
  setSubject: (subjectId: string | null) => void
}

const IDLE: Saved = {
  mode: 'focus',
  subjectId: null,
  runningSince: null,
  banked: 0,
  startedAt: null,
}
const TimerContext = createContext<TimerState | null>(null)

/**
 * The study timer. Its state is saved on every change, so it keeps counting across reloads and
 * while other screens are open. Finishing a session writes a study session row.
 */
export function TimerProvider({ children }: { children: ReactNode }) {
  const { meta } = useAppState()
  const toast = useToast()
  const [saved, setSaved] = useState<Saved>(IDLE)
  const [now, setNow] = useState(() => Date.now())
  const announced = useRef(false)
  const target = (meta?.studyGoals.focusMinutes ?? 25) * 60

  useEffect(() => {
    void call('settings:get', { key: 'timer.state' }).then((value) => {
      if (value && typeof value === 'object') setSaved({ ...IDLE, ...(value as Partial<Saved>) })
    })
  }, [])

  const update = useCallback((next: Saved) => {
    setSaved(next)
    void call('settings:set', { key: 'timer.state', value: next })
  }, [])

  const running = saved.runningSince !== null
  useEffect(() => {
    if (!running) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [running])

  const elapsed =
    saved.banked +
    (saved.runningSince ? Math.max(0, Math.floor((now - saved.runningSince) / 1000)) : 0)

  useEffect(() => {
    if (saved.mode === 'focus' && running && elapsed >= target && !announced.current) {
      announced.current = true
      toast({
        title: 'Focus session complete',
        description: 'Take a break, or keep going. Stop the timer to log it.',
        durationMs: 12_000,
      })
    }
    if (!running && elapsed === 0) announced.current = false
  }, [saved.mode, running, elapsed, target, toast])

  const value = useMemo<TimerState>(() => {
    const start = (): void => {
      if (saved.runningSince) return
      update({ ...saved, runningSince: Date.now(), startedAt: saved.startedAt ?? Date.now() })
    }
    const pause = (): void => {
      if (!saved.runningSince) return
      update({
        ...saved,
        runningSince: null,
        banked: saved.banked + Math.floor((Date.now() - saved.runningSince) / 1000),
      })
    }
    const stop = async (): Promise<void> => {
      const seconds =
        saved.banked +
        (saved.runningSince ? Math.floor((Date.now() - saved.runningSince) / 1000) : 0)
      const startedAt = saved.startedAt ?? Date.now() - seconds * 1000
      update({ ...IDLE, mode: saved.mode, subjectId: saved.subjectId })
      if (seconds < 60) {
        if (seconds > 0)
          toast({
            title: 'Not logged',
            description: 'Sessions under a minute are not saved.',
            tone: 'info',
          })
        return
      }
      await db.create('studySessions', {
        subjectId: saved.subjectId,
        startedAt,
        endedAt: Date.now(),
        seconds,
        mode: saved.mode,
        source: 'timer',
      })
      changed('stats')
      toast({
        title: 'Session logged',
        description: `${Math.round(seconds / 60)} minutes added to today.`,
      })
    }
    return {
      ...saved,
      elapsed,
      target,
      running,
      active: running || saved.banked > 0,
      start,
      pause,
      stop,
      setMode: (mode) => update({ ...saved, mode }),
      setSubject: (subjectId) => update({ ...saved, subjectId }),
    }
  }, [saved, elapsed, target, running, update, toast])

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTimer(): TimerState {
  const timer = useContext(TimerContext)
  if (!timer) throw new Error('useTimer must be used inside <TimerProvider>')
  return timer
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// eslint-disable-next-line react-refresh/only-export-components
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60)
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

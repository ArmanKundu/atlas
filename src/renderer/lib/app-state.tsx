import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppInfo, Prefs, PrefsPatch } from '@shared/ipc'
import { ErrorState } from '@/design/States'
import { call, errorMessage, subscribe } from './ipc'

interface AppState {
  info: AppInfo
  prefs: Prefs
  /** Applies the change straight away, then saves it. Rolls back if saving fails. */
  setPrefs: (patch: PrefsPatch) => Promise<void>
}

const AppStateContext = createContext<AppState | null>(null)

type Boot =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; info: AppInfo; prefs: Prefs }

/** Loads app info and preferences once, then keeps preferences in sync with the main process. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([call('app:info'), call('prefs:get')])
      .then(([info, prefs]) => {
        if (!cancelled) setBoot({ status: 'ready', info, prefs })
      })
      .catch((error: unknown) => {
        if (!cancelled) setBoot({ status: 'error', message: errorMessage(error) })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(
    () =>
      subscribe('prefs:changed', (prefs) => {
        setBoot((current) => (current.status === 'ready' ? { ...current, prefs } : current))
      }),
    [],
  )

  const setPrefs = useCallback(async (patch: PrefsPatch) => {
    let previous: Prefs | undefined
    setBoot((current) => {
      if (current.status !== 'ready') return current
      previous = current.prefs
      return { ...current, prefs: { ...current.prefs, ...patch } }
    })
    try {
      const saved = await call('prefs:set', patch)
      setBoot((current) => (current.status === 'ready' ? { ...current, prefs: saved } : current))
    } catch (error) {
      const rollback = previous
      if (rollback) {
        setBoot((current) =>
          current.status === 'ready' ? { ...current, prefs: rollback } : current,
        )
      }
      throw error
    }
  }, [])

  // The theme attribute forces a side; with "system" the CSS follows the OS on its own.
  const theme = boot.status === 'ready' ? boot.prefs.theme : undefined
  useEffect(() => {
    if (!theme) return
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
  }, [theme])

  const value = useMemo<AppState | null>(
    () => (boot.status === 'ready' ? { info: boot.info, prefs: boot.prefs, setPrefs } : null),
    [boot, setPrefs],
  )

  if (boot.status === 'loading') return null

  if (boot.status === 'error' || !value) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <ErrorState
          title="Atlas could not start"
          onRetry={() => {
            setBoot({ status: 'loading' })
            setAttempt((n) => n + 1)
          }}
          className="max-w-md"
        >
          {boot.status === 'error' ? boot.message : 'Try again.'}
        </ErrorState>
      </div>
    )
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppState(): AppState {
  const state = useContext(AppStateContext)
  if (!state) throw new Error('useAppState must be used inside <AppStateProvider>')
  return state
}

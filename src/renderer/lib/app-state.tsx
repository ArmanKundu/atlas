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
import type { ProfileMeta, ProfileMetaPatch, ProfileSummary, Subject } from '@shared/models'
import { ErrorState } from '@/design/States'
import { changed, db, useLive } from './api'
import { call, errorMessage, subscribe } from './ipc'

interface AppState {
  info: AppInfo
  prefs: Prefs
  /** Applies the change straight away, then saves it. Rolls back if saving fails. */
  setPrefs: (patch: PrefsPatch) => Promise<void>
  profiles: ProfileSummary[]
  /** The unlocked profile's details, or null while no profile is open. */
  meta: ProfileMeta | null
  updateMeta: (patch: ProfileMetaPatch) => Promise<void>
  /** Re-reads the profile list and the open profile from the main process. */
  refreshSession: () => Promise<void>
}

const AppStateContext = createContext<AppState | null>(null)

interface Ready {
  status: 'ready'
  info: AppInfo
  prefs: Prefs
  profiles: ProfileSummary[]
  meta: ProfileMeta | null
}
type Boot = { status: 'loading' } | { status: 'error'; message: string } | Ready

async function loadSession(
  prefs: Prefs,
): Promise<{ profiles: ProfileSummary[]; meta: ProfileMeta | null }> {
  let profiles = await call('profile:list')
  let meta = await call('profile:meta')
  if (!meta) {
    // Open the last profile automatically when nothing protects it.
    const candidate =
      profiles.find((p) => p.id === prefs.lastProfileId) ??
      (profiles.length === 1 ? profiles[0] : undefined)
    if (candidate && !candidate.hasPassword) {
      await call('profile:unlock', { id: candidate.id })
      profiles = await call('profile:list')
      meta = await call('profile:meta')
    }
  }
  return { profiles, meta }
}

/** Loads app info, preferences and the profile session, and keeps them in sync with main. */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [info, prefs] = await Promise.all([call('app:info'), call('prefs:get')])
        const session = await loadSession(prefs)
        if (!cancelled) setBoot({ status: 'ready', info, prefs, ...session })
      } catch (error) {
        if (!cancelled) setBoot({ status: 'error', message: errorMessage(error) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [attempt])

  const refreshSession = useCallback(async () => {
    const [profiles, meta] = await Promise.all([call('profile:list'), call('profile:meta')])
    setBoot((current) => (current.status === 'ready' ? { ...current, profiles, meta } : current))
    changed('subjects', 'profile')
  }, [])

  useEffect(
    () =>
      subscribe('prefs:changed', (prefs) => {
        setBoot((current) => (current.status === 'ready' ? { ...current, prefs } : current))
      }),
    [],
  )
  useEffect(() => subscribe('profile:changed', () => void refreshSession()), [refreshSession])

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
      if (rollback)
        setBoot((current) =>
          current.status === 'ready' ? { ...current, prefs: rollback } : current,
        )
      throw error
    }
  }, [])

  const updateMeta = useCallback(async (patch: ProfileMetaPatch) => {
    const meta = await call('profile:updateMeta', patch)
    setBoot((current) => (current.status === 'ready' ? { ...current, meta } : current))
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
    () =>
      boot.status === 'ready'
        ? {
            info: boot.info,
            prefs: boot.prefs,
            setPrefs,
            profiles: boot.profiles,
            meta: boot.meta,
            updateMeta,
            refreshSession,
          }
        : null,
    [boot, setPrefs, updateMeta, refreshSession],
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

/** Active subjects, in the user's order. Shared by the sidebar and every subject picker. */
// eslint-disable-next-line react-refresh/only-export-components
export function useSubjects(): Subject[] {
  const { data } = useLive(['subjects'], () => db.list('subjects', { orderBy: 'createdAt' }))
  return useMemo(() => (data ?? []).filter((s) => s.active), [data])
}

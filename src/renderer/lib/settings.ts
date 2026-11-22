import { useCallback, useEffect, useState } from 'react'
import { call } from './ipc'

/**
 * A value kept in the profile's settings table (remembered views, revealed solutions). Reads once,
 * writes through. Use for small UI memory only; real data belongs in its own table.
 */
export function useSetting<T>(key: string, fallback: T): [T, (next: T) => void, boolean] {
  const [state, setState] = useState<{ key: string; value: T; loaded: boolean }>({
    key,
    value: fallback,
    loaded: false,
  })
  useEffect(() => {
    let cancelled = false
    void call('settings:get', { key })
      .then((value) => {
        if (!cancelled) setState({ key, value: (value ?? fallback) as T, loaded: true })
      })
      .catch(() => !cancelled && setState({ key, value: fallback, loaded: true }))
    return () => {
      cancelled = true
    }
    // The fallback is a default for the first read only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const set = useCallback(
    (next: T) => {
      setState({ key, value: next, loaded: true })
      void call('settings:set', { key, value: next }).catch(() => undefined)
    },
    [key],
  )
  const current = state.key === key ? state : { value: fallback, loaded: false }
  return [current.value, set, current.loaded]
}

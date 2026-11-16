import { useCallback, useEffect, useRef, useState } from 'react'
import type { EntityInput, EntityName, EntityRow } from '@shared/models'
import { call, errorMessage } from './ipc'

/* ---------- Change bus: lets any view refresh when data it shows is written elsewhere ---------- */

const listeners = new Map<string, Set<() => void>>()

/** Tells every `useLive` that depends on `key` to reload. */
export function changed(...keys: string[]): void {
  for (const key of keys) for (const listener of listeners.get(key) ?? []) listener()
}

function onChange(keys: readonly string[], listener: () => void): () => void {
  for (const key of keys) {
    const set = listeners.get(key) ?? new Set()
    set.add(listener)
    listeners.set(key, set)
  }
  return () => {
    for (const key of keys) listeners.get(key)?.delete(listener)
  }
}

/* ---------- Typed data access ---------- */

interface ListOptions {
  where?: Record<string, unknown>
  orderBy?: string
  desc?: boolean
  limit?: number
}

export const db = {
  list: <E extends EntityName>(entity: E, options: ListOptions = {}) =>
    call('db:list', { entity, ...options }) as Promise<EntityRow<E>[]>,
  get: <E extends EntityName>(entity: E, id: string) =>
    call('db:get', { entity, id }) as Promise<EntityRow<E> | null>,
  create: async <E extends EntityName>(entity: E, values: EntityInput<E>) => {
    const row = (await call('db:create', { entity, values })) as EntityRow<E>
    changed(entity)
    return row
  },
  update: async <E extends EntityName>(entity: E, id: string, patch: Partial<EntityInput<E>>) => {
    const row = (await call('db:update', { entity, id, patch })) as EntityRow<E>
    changed(entity)
    return row
  },
  remove: async (entity: EntityName, id: string) => {
    await call('db:remove', { entity, id })
    changed(entity)
  },
}

/* ---------- Loading hook ---------- */

export interface Live<T> {
  data: T | undefined
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Loads data and keeps it fresh: reloads when `deps` change and whenever one of `keys` is
 * reported through `changed()`. Stale responses from an earlier load are ignored.
 */
export function useLive<T>(
  keys: readonly string[],
  loader: () => Promise<T>,
  deps: readonly unknown[] = [],
): Live<T> {
  const [state, setState] = useState<{
    data: T | undefined
    loading: boolean
    error: string | null
  }>({
    data: undefined,
    loading: true,
    error: null,
  })
  const run = useRef(0)
  const loaderRef = useRef(loader)
  useEffect(() => {
    loaderRef.current = loader
  })

  const reload = useCallback(() => {
    const id = ++run.current
    loaderRef.current().then(
      (data) => {
        if (id === run.current) setState({ data, loading: false, error: null })
      },
      (error: unknown) => {
        if (id === run.current)
          setState((s) => ({ ...s, loading: false, error: errorMessage(error) }))
      },
    )
  }, [])

  const keyList = keys.join('|')
  useEffect(() => {
    reload()
    return onChange(keyList.split('|'), reload)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the caller's reload triggers
  }, [reload, keyList, ...deps])

  return { ...state, reload }
}

/** Runs an async action with pending and error state for buttons and forms. */
export function useAction<A extends unknown[]>(
  action: (...args: A) => Promise<unknown>,
): {
  run: (...args: A) => Promise<boolean>
  pending: boolean
  error: string | null
  clear: () => void
} {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef(action)
  useEffect(() => {
    ref.current = action
  })
  const run = useCallback(async (...args: A) => {
    setPending(true)
    setError(null)
    try {
      await ref.current(...args)
      return true
    } catch (cause) {
      setError(errorMessage(cause))
      return false
    } finally {
      setPending(false)
    }
  }, [])
  return { run, pending, error, clear: useCallback(() => setError(null), []) }
}

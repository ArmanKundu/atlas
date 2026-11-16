import {
  PrefsSchema,
  type AtlasBridge,
  type IpcEvent,
  type IpcResult,
  type Prefs,
} from '@shared/ipc'

/**
 * Development only: lets the renderer run in a plain browser tab (no Electron) for quick visual
 * checks. It keeps preferences in memory and answers the same channels as the real bridge.
 * `main.tsx` loads it with a dynamic import behind `import.meta.env.DEV`, so it is not part of
 * a production build.
 */
export function createDevBridge(): AtlasBridge {
  let prefs: Prefs = PrefsSchema.parse({})
  const listeners = new Map<IpcEvent, Set<(payload: never) => void>>()

  const emit = (event: IpcEvent, payload: unknown): void => {
    for (const listener of listeners.get(event) ?? []) listener(payload as never)
  }
  const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data })

  const handlers: Record<string, (payload: unknown) => IpcResult<unknown>> = {
    'app:info': () =>
      ok({
        name: 'Atlas',
        version: '0.0.0-browser',
        platform: 'darwin',
        arch: 'browser',
        electron: '-',
        chrome: '-',
        node: '-',
        isPackaged: false,
        systemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      }),
    'prefs:get': () => ok(prefs),
    'prefs:set': (patch) => {
      prefs = PrefsSchema.parse({ ...prefs, ...(patch as object) })
      emit('prefs:changed', prefs)
      return ok(prefs)
    },
    'shell:openExternal': (payload) => {
      window.open((payload as { url: string }).url, '_blank', 'noopener')
      return ok(undefined)
    },
    'log:rendererError': (payload) => {
      console.error('[renderer error]', payload)
      return ok(undefined)
    },
  }

  return {
    platform: 'darwin',
    invoke(channel: string, payload?: unknown) {
      const handler = handlers[channel]
      const result: IpcResult<unknown> = handler
        ? handler(payload)
        : { ok: false, error: { code: 'forbidden', message: 'That action is not available.' } }
      return Promise.resolve(result as never)
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set()
      set.add(listener as (payload: never) => void)
      listeners.set(event, set)
      return () => set.delete(listener as (payload: never) => void)
    },
  }
}

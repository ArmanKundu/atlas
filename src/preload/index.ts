import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, IPC_EVENTS } from '../shared/ipc-channels'
import type { AtlasBridge, IpcResult, Platform } from '../shared/ipc'

/**
 * The only bridge between the sandboxed renderer and the main process.
 *
 * It exposes two functions and nothing from Electron or Node. Channel and event names are checked
 * against the contract here, and the main process validates every payload again with zod.
 */
const channels = new Set<string>(IPC_CHANNELS)
const events = new Set<string>(IPC_EVENTS)

const bridge: AtlasBridge = {
  platform: process.platform as Platform,

  invoke(channel: string, payload?: unknown) {
    if (!channels.has(channel)) {
      const blocked: IpcResult<never> = {
        ok: false,
        error: { code: 'forbidden', message: 'That action is not available.' },
      }
      return Promise.resolve(blocked)
    }
    return ipcRenderer.invoke(channel, payload)
  },

  on(event: string, listener: (payload: never) => void) {
    if (!events.has(event)) return () => undefined
    const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
      listener(payload as never)
    }
    ipcRenderer.on(event, wrapped)
    return () => {
      ipcRenderer.removeListener(event, wrapped)
    }
  },
}

contextBridge.exposeInMainWorld('atlas', bridge)

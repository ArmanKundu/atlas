import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { CHANNEL_PATTERN, IPC_EVENTS } from '../shared/ipc-channels'
import type { AtlasBridge, IpcResult, Platform } from '../shared/ipc'

/**
 * The only bridge between the sandboxed renderer and the main process.
 *
 * It exposes three functions and nothing else from Electron or Node. The main process is the
 * authority: only channels in the contract have a handler, it checks the sender, and it validates
 * every payload with zod. A call to anything else comes back as a `forbidden` result.
 */
const events = new Set<string>(IPC_EVENTS)

const forbidden: IpcResult<never> = {
  ok: false,
  error: { code: 'forbidden', message: 'That action is not available.' },
}

const bridge: AtlasBridge = {
  platform: process.platform as Platform,

  invoke(channel: string, payload?: unknown) {
    if (!CHANNEL_PATTERN.test(channel)) return Promise.resolve(forbidden)
    return ipcRenderer.invoke(channel, payload).catch(() => forbidden)
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

  pathForFile(file: File) {
    return webUtils.getPathForFile(file)
  },
}

contextBridge.exposeInMainWorld('atlas', bridge)

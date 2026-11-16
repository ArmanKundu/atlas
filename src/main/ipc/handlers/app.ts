import { app, nativeTheme, shell, type BrowserWindow } from 'electron'
import { AtlasError } from '@shared/errors'
import { PlatformSchema, ipcEvents, type IpcEvent, type IpcEventPayload } from '@shared/ipc'
import type { Logger } from '../../log'
import type { PrefsStore } from '../../prefs'
import { isSafeExternalUrl } from '../../security'
import type { IpcRegistry } from '../registry'

export interface AppHandlerDeps {
  registry: IpcRegistry
  prefs: PrefsStore
  log: Logger
  windows: () => BrowserWindow[]
}

/** Sends a validated push event to every open window. */
export function broadcast<E extends IpcEvent>(
  windows: BrowserWindow[],
  event: E,
  payload: IpcEventPayload<E>,
): void {
  const data = ipcEvents[event].parse(payload)
  for (const window of windows) {
    if (!window.isDestroyed()) window.webContents.send(event, data)
  }
}

export function registerAppHandlers({ registry, prefs, log, windows }: AppHandlerDeps): void {
  registry.handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: PlatformSchema.catch('linux').parse(process.platform),
    arch: process.arch,
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node,
    isPackaged: app.isPackaged,
    systemDark: nativeTheme.shouldUseDarkColors,
  }))

  registry.handle('prefs:get', () => prefs.get())

  registry.handle('prefs:set', async (patch) => {
    const next = await prefs.set(patch)
    if (patch.theme) nativeTheme.themeSource = next.theme
    broadcast(windows(), 'prefs:changed', next)
    return next
  })

  registry.handle('shell:openExternal', async ({ url }) => {
    if (!isSafeExternalUrl(url)) {
      throw new AtlasError('forbidden', 'Atlas only opens https and mail links.')
    }
    await shell.openExternal(url)
  })

  registry.handle('log:rendererError', ({ scope, message, stack }) => {
    log.error(`renderer ${scope}: ${message}`, stack)
  })
}

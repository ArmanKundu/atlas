import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  net,
  protocol,
  session,
  shell,
  type IpcMainInvokeEvent,
} from 'electron'
import { APP_NAME, APP_SCHEME } from '@shared/constants'
import { AiService } from './ai/service'
import { CalendarSync } from './calendar/sync'
import { SecretStore } from './ai/secrets'
import { broadcast, registerAppHandlers } from './ipc/handlers/app'
import { registerDataHandlers } from './ipc/handlers/data'
import { createIpcRegistry } from './ipc/registry'
import { createFileLogger } from './log'
import { PrefsStore } from './prefs'
import { ProfileManager } from './profiles'
import { buildCsp, isAppUrl, resolveRendererPath } from './security'
import { Updater } from './updater'
import { createMainWindow, printRouteToPdf } from './window'

// Set by electron-vite while `npm run dev` is running; absent in a built app.
const devServerUrl = (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) || undefined

// End-to-end tests point each run at a throwaway data folder.
const testUserData = process.env['ATLAS_USER_DATA']
if (testUserData) app.setPath('userData', testUserData)

app.setName(APP_NAME)

// Must run before the app is ready: gives the packaged renderer a real, secure origin.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void main()
}

async function main(): Promise<void> {
  let mainWindow: BrowserWindow | null = null

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  await app.whenReady()

  const log = createFileLogger(join(app.getPath('userData'), 'logs'), { echo: !app.isPackaged })
  process.on('uncaughtException', (error) => log.error('uncaught exception', error))
  process.on('unhandledRejection', (reason) => log.error('unhandled rejection', reason))

  const prefs = new PrefsStore(join(app.getPath('userData'), 'prefs.json'))
  nativeTheme.themeSource = (await prefs.load()).theme

  registerRendererProtocol()
  lockDownSession()

  const windows = (): BrowserWindow[] => BrowserWindow.getAllWindows()
  const registry = createIpcRegistry<IpcMainInvokeEvent>({
    ipcMain,
    isTrustedSender: (event) =>
      event.senderFrame !== null && isAppUrl(event.senderFrame.url, devServerUrl),
    log,
  })
  registerAppHandlers({ registry, prefs, log, windows })

  const profiles = new ProfileManager(join(app.getPath('userData'), 'profiles'), log)
  const secrets = new SecretStore(join(app.getPath('userData'), 'secrets.json'))
  const ai = new AiService({
    profiles,
    secrets,
    log,
    emitDelta: (payload) => broadcast(windows(), 'ai:delta', payload),
    emitFinished: (payload) => broadcast(windows(), 'ai:finished', payload),
  })
  const calendar = new CalendarSync(profiles, secrets, log, () =>
    broadcast(windows(), 'calendar:changed', { at: Date.now() }),
  )
  registerDataHandlers({
    registry,
    profiles,
    prefs,
    ai,
    calendar,
    log,
    emit: {
      profileChanged: (activeId) => broadcast(windows(), 'profile:changed', { activeId }),
      libraryChanged: (sourceId) => broadcast(windows(), 'library:changed', { sourceId }),
    },
    printRoute: (hash) => printRouteToPdf({ devServerUrl, hash }),
  })
  const updater = new Updater({
    log,
    profiles,
    emit: (status) => broadcast(windows(), 'update:changed', status),
    backupRoot: () => join(app.getPath('documents'), 'Atlas Backups'),
  })
  registry.handle('update:status', () => updater.current)
  registry.handle('update:check', () => updater.check())
  registry.handle('update:install', () => updater.install())
  registry.handle('update:revealBackup', ({ path }) => {
    if (path.startsWith(join(app.getPath('documents'), 'Atlas Backups')))
      shell.showItemInFolder(path)
  })
  updater.start()
  app.on('will-quit', () => {
    updater.stop()
    profiles.lock()
  })
  const missing = registry.missing()
  if (missing.length > 0) log.warn(`ipc channels without a handler: ${missing.join(', ')}`)

  nativeTheme.on('updated', () => {
    broadcast(windows(), 'theme:systemChanged', { dark: nativeTheme.shouldUseDarkColors })
  })

  const openWindow = (): void => {
    mainWindow = createMainWindow({ devServerUrl, log })
    mainWindow.on('closed', () => {
      mainWindow = null
    })
  }
  openWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  log.info(`started ${app.getName()} ${app.getVersion()} on ${process.platform}-${process.arch}`)
}

/** Serves the built renderer from `atlas://app/`, with the CSP attached to every response. */
function registerRendererProtocol(): void {
  const rendererRoot = join(__dirname, '../renderer')
  const csp = buildCsp()

  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveRendererPath(rendererRoot, request.url)
    if (!filePath) return new Response('Not found', { status: 404 })

    try {
      const file = await net.fetch(pathToFileURL(filePath).toString())
      const headers = new Headers(file.headers)
      headers.set('Content-Security-Policy', csp)
      headers.set('X-Content-Type-Options', 'nosniff')
      return new Response(file.body, { status: file.status, headers })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

/** No permissions, and (in development) the CSP applied to the dev server's responses. */
function lockDownSession(): void {
  const defaultSession = session.defaultSession
  defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  )
  defaultSession.setPermissionCheckHandler(() => false)

  if (!devServerUrl) return
  const csp = buildCsp({ devServerUrl })
  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.resourceType !== 'mainFrame') {
      callback({})
      return
    }
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] },
    })
  })
}

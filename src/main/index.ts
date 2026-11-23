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
import { extractText } from './extract-text'
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
import { CommunityLibrary } from './community'
import { Voice } from './voice'
import { PhoneScanner } from './scanner'
import { importPaths } from './library'
import { localModels } from './ai/local-model'
import {
  allowScreenRecording,
  captureWindow,
  copyImage,
  saveAs,
  saveBytes,
  saveRecording,
  stashBytes,
} from './feedback'
import { Updater } from './updater'
import { createMainWindow, printRouteToPdf } from './window'
import { VideoExporter } from './video-export'

// Set by electron-vite while `npm run dev` is running; absent in a built app.
const devServerUrl = (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) || undefined

// End-to-end tests point each run at a throwaway data folder.
const testUserData = process.env['ATLAS_USER_DATA']
// End-to-end tests read files with the packaged text extractor through this hook.
if (testUserData) {
  ;(globalThis as { __atlasExtractText?: typeof extractText }).__atlasExtractText = extractText
}
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
    emitLesson: ({ kind, ...payload }) =>
      kind === 'delta'
        ? broadcast(windows(), 'explainer:delta', payload as { requestId: string; text: string })
        : broadcast(
            windows(),
            'explainer:done',
            payload as {
              requestId: string
              text: string
              provider: string | null
              error: string | null
            },
          ),
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

  const videos = new VideoExporter({
    devServerUrl,
    log,
    emitProgress: (payload) => broadcast(windows(), 'explainer:exportProgress', payload),
  })
  registry.handle('explainer:exportVideo', async ({ lessonId, title }) => ({
    saved: await videos.export({
      lessonId,
      title,
      parent: BrowserWindow.getFocusedWindow() ?? mainWindow,
    }),
  }))
  registry.handle('explainer:cancelExport', () => videos.cancel())
  registry.handle('explainer:captureFrame', () => videos.frame())
  registry.handle('explainer:videoProgress', ({ done, total }) => videos.progress(done, total))
  registry.handle('explainer:videoReady', ({ bytes }) => videos.finished(bytes))
  registry.handle('explainer:videoFailed', ({ message }) => videos.failed(message))

  const filesDirNow = (): string => {
    const current = profiles.current
    if (!current) throw new Error('no profile open')
    return profiles.filesDir(current.id)
  }
  const shared = new CommunityLibrary({
    secrets,
    log,
    db: () => profiles.db(),
    filesDir: () => {
      const current = profiles.current
      if (!current) throw new Error('no profile open')
      return profiles.filesDir(current.id)
    },
    onLibraryChanged: () => broadcast(windows(), 'library:changed', { sourceId: null }),
    // Uploads are read by the uploader's own AI in the background; the summary and text version
    // then go up with the item so everyone in the group can search and skim it.
    onPublished: ({ id, input, localPath, body }) => {
      void ai
        .digest({
          path: localPath,
          title: input.title,
          description: input.description,
          subject: input.subject,
          material: input.material,
          body: body ?? undefined,
        })
        .then(async (digest) => {
          if (!digest) return
          await shared.saveDigest({ id, ...digest })
          broadcast(windows(), 'shared:changed', { id })
        })
        .catch((error: unknown) => log.warn(`shared digest failed: ${String(error)}`))
    },
  })
  ai.setSharedContext((question) => shared.assistantContext(question))
  registry.handle('shared:status', () => shared.status())
  registry.handle('shared:sendCode', ({ email }) => shared.sendCode(email))
  registry.handle('shared:verifyCode', (input) => shared.verifyCode(input))
  registry.handle('shared:signOut', () => shared.signOut())
  registry.handle('shared:usernameFree', ({ username }) => shared.usernameFree(username))
  registry.handle('shared:saveProfile', (input) => shared.saveProfile(input))
  registry.handle('shared:spaces', () => shared.spaces())
  registry.handle('shared:createSpace', (input) => shared.createSpace(input))
  registry.handle('shared:updateSpace', (input) => shared.updateSpace(input))
  registry.handle('shared:deleteSpace', ({ id }) => shared.deleteSpace(id))
  registry.handle('shared:regenerateCode', ({ spaceId }) => shared.regenerateCode(spaceId))
  registry.handle('shared:joinByCode', ({ code }) => shared.joinByCode(code))
  registry.handle('shared:people', ({ spaceId }) => shared.people(spaceId))
  registry.handle('shared:searchUsers', ({ q }) => shared.searchUsers(q))
  registry.handle('shared:invite', (input) => shared.invite(input))
  registry.handle('shared:setRole', (input) => shared.setRole(input))
  registry.handle('shared:removeMember', (input) => shared.removeMember(input))
  registry.handle('shared:leave', ({ spaceId }) => shared.leave(spaceId))
  registry.handle('shared:inbox', () => shared.inbox())
  registry.handle('shared:markRead', () => shared.markRead())
  registry.handle('shared:respondInvite', (input) => shared.respondInvite(input))
  registry.handle('shared:decideRequest', (input) => shared.decideRequest(input))
  registry.handle('shared:list', (query) => shared.list(query))
  registry.handle('shared:get', ({ id }) => shared.get(id))
  registry.handle('shared:pickFile', () => shared.pickFile())
  registry.handle('shared:describeFile', ({ path }) => shared.describeFile(path))
  registry.handle('shared:publish', (input) => shared.publish(input))
  registry.handle('shared:update', (input) => shared.update(input))
  registry.handle('shared:remove', ({ id }) => shared.remove(id))
  registry.handle('shared:react', (input) => shared.react(input))
  registry.handle('shared:remix', ({ id }) => shared.remix(id))
  registry.handle('shared:capacity', () => shared.capacity())
  registry.handle('shared:recheckAccess', () => shared.recheckAccess())
  registry.handle('admin:access', () => shared.adminAccess())
  registry.handle('admin:setAccess', (input) => shared.adminSetAccess(input))
  registry.handle('admin:setCapacity', ({ capacity }) => shared.adminSetCapacity(capacity))
  registry.handle('admin:feedback', () => shared.adminFeedback())
  registry.handle('admin:attachment', ({ id }) => shared.adminAttachment(id))
  registry.handle('admin:setFeedback', (input) => shared.adminSetFeedback(input))
  registry.handle('feedback:capture', () => captureWindow())
  registry.handle('feedback:saveRecording', (input) => saveRecording(input))
  registry.handle('feedback:copyImage', ({ path }) => copyImage(path))
  registry.handle('feedback:saveAs', ({ path }) => saveAs(path))
  registry.handle('feedback:send', (input) => shared.sendFeedback(input))
  allowScreenRecording()

  const voice = new Voice({
    log,
    progress: (p) => broadcast(windows(), 'models:progress', p),
  })
  registry.handle('files:saveBytes', (input) => saveBytes(input))
  registry.handle('files:stashBytes', (input) => stashBytes(input))
  localModels.onProgress((p) =>
    broadcast(windows(), 'models:progress', {
      id: `llm:${p.id}`,
      state: p.failed ? 'error' : p.done ? 'ready' : 'downloading',
      loaded: p.loaded,
      total: p.total,
    }),
  )
  const scanner = new PhoneScanner({
    importFiles: async ({ subjectId, paths }) => {
      const rows = await importPaths(profiles.db(), filesDirNow(), {
        subjectId,
        paths,
        kind: 'class_notes',
      })
      broadcast(windows(), 'library:changed', { sourceId: null })
      return rows.map((r) => ({ id: String(r['id']), title: String(r['title'] ?? '') }))
    },
    onReceived: (item) => broadcast(windows(), 'scanner:received', item),
    onProgress: (pages) => broadcast(windows(), 'scanner:progress', { pages }),
  })
  registry.handle('scanner:start', ({ subjectId }) => scanner.start({ subjectId }))
  registry.handle('scanner:stop', () => scanner.stop())
  app.on('will-quit', () => void scanner.stop())
  registry.handle('localai:list', () => localModels.list())
  registry.handle('localai:download', ({ id }) => localModels.download(id))
  registry.handle('localai:cancel', ({ id }) => localModels.cancel(id))
  registry.handle('localai:remove', ({ id }) => localModels.remove(id))
  registry.handle('voice:status', () => voice.state)
  registry.handle('voice:prepare', () => voice.prepare())
  registry.handle('voice:speak', (input) => voice.speak(input))
  app.on('will-quit', () => {
    updater.stop()
    voice.stop()
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

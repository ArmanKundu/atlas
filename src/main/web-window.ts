import { BrowserWindow, session, shell } from 'electron'
import type { Logger } from './log'
import { isSafeExternalUrl } from './security'

/** Sites keep their own cookies here, apart from Atlas, so Google Drive stays signed in. */
const PARTITION = 'persist:atlas-web'

let prepared = false

/** Sites such as Google refuse sign-in from browsers that say they are Electron. */
function prepareSession(): Electron.Session {
  const web = session.fromPartition(PARTITION)
  if (!prepared) {
    prepared = true
    web.setUserAgent(
      web
        .getUserAgent()
        .replace(/\s?Electron\/\S+/, '')
        .replace(/\s?Atlas\/\S+/i, ''),
    )
    // Sites get nothing beyond what a normal tab gets without asking: no camera, mic or location.
    web.setPermissionRequestHandler((_wc, permission, callback) =>
      callback(permission === 'fullscreen' || permission === 'clipboard-sanitized-write'),
    )
  }
  return web
}

/**
 * Opens a web page (a shared link, Google Drive, a school site) in its own Atlas window. The page
 * runs sandboxed with no access to Atlas: no preload, no Node, a separate cookie store.
 * Back and forward: ⌘[ and ⌘] (Ctrl on Windows), reload ⌘R, open in your browser ⌘⇧O.
 */
export function openWebWindow(url: string, log: Logger, parent?: BrowserWindow): BrowserWindow {
  const web = prepareSession()
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 480,
    minHeight: 360,
    title: 'Loading…',
    autoHideMenuBar: true,
    ...(parent ? { x: parent.getBounds().x + 40, y: parent.getBounds().y + 40 } : {}),
    webPreferences: {
      session: web,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  })
  const contents = win.webContents

  // Pop-ups (Drive "open in new tab", sign-in windows) open as more Atlas web windows.
  contents.setWindowOpenHandler(({ url: next }) => {
    if (next.startsWith('https:')) openWebWindow(next, log, win)
    else if (isSafeExternalUrl(next)) void shell.openExternal(next)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, next) => {
    if (!next.startsWith('https:') && !next.startsWith('about:')) {
      event.preventDefault()
      if (isSafeExternalUrl(next)) void shell.openExternal(next)
    }
  })
  contents.on('page-title-updated', (event, title) => {
    event.preventDefault()
    win.setTitle(`${title} · Atlas`)
  })
  contents.on('before-input-event', (event, input) => {
    const mod = process.platform === 'darwin' ? input.meta : input.control
    if (input.type !== 'keyDown' || !mod) return
    const key = input.key.toLowerCase()
    if (key === '[' || (input.alt && key === 'arrowleft')) {
      if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack()
    } else if (key === ']' || (input.alt && key === 'arrowright')) {
      if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward()
    } else if (key === 'r') {
      contents.reload()
    } else if (key === 'o' && input.shift) {
      const now = contents.getURL()
      if (isSafeExternalUrl(now)) void shell.openExternal(now)
    } else if (key === 'w') {
      win.close()
    } else return
    event.preventDefault()
  })
  contents.on('did-fail-load', (_e, code, description, failedUrl, isMainFrame) => {
    if (isMainFrame && code !== -3) log.warn(`web window failed to load (${code} ${description})`)
    void failedUrl
  })

  void win.loadURL(url)
  return win
}

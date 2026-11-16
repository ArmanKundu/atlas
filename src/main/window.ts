import { join } from 'node:path'
import { BrowserWindow, nativeTheme, shell } from 'electron'
import { APP_NAME, APP_ORIGIN, TOPBAR_HEIGHT, WINDOW_DEFAULT, WINDOW_MIN } from '@shared/constants'
import type { Logger } from './log'
import { isAppUrl, isSafeExternalUrl } from './security'

/** Window background per theme, matching `--atlas-canvas`, so there is no flash before paint. */
const CANVAS = { light: '#f5f5f7', dark: '#1c1c1e' } as const

export function canvasColor(): string {
  return nativeTheme.shouldUseDarkColors ? CANVAS.dark : CANVAS.light
}

function overlayColors(): { color: string; symbolColor: string; height: number } {
  return {
    color: canvasColor(),
    symbolColor: nativeTheme.shouldUseDarkColors ? '#ededec' : '#1b1b1a',
    height: TOPBAR_HEIGHT,
  }
}

export function createMainWindow(options: { devServerUrl?: string; log: Logger }): BrowserWindow {
  const { devServerUrl, log } = options
  const isMac = process.platform === 'darwin'

  const window = new BrowserWindow({
    title: APP_NAME,
    width: WINDOW_DEFAULT.width,
    height: WINDOW_DEFAULT.height,
    minWidth: WINDOW_MIN.width,
    minHeight: WINDOW_MIN.height,
    show: false,
    backgroundColor: canvasColor(),
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? { trafficLightPosition: { x: 16, y: 16 } } : { titleBarOverlay: overlayColors() }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  // The renderer never opens windows or leaves the app. Links go to the system browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
    else log.warn('blocked window.open to a non-https url')
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url, devServerUrl)) return
    event.preventDefault()
    if (isSafeExternalUrl(url)) void shell.openExternal(url)
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    log.error(`renderer process gone: ${details.reason}`)
  })

  const applyThemeChrome = (): void => {
    if (window.isDestroyed()) return
    window.setBackgroundColor(canvasColor())
    if (!isMac) window.setTitleBarOverlay(overlayColors())
  }
  nativeTheme.on('updated', applyThemeChrome)
  window.on('closed', () => nativeTheme.off('updated', applyThemeChrome))

  void window.loadURL(devServerUrl ?? `${APP_ORIGIN}/index.html`)
  return window
}

/**
 * Renders one app route in a hidden window and returns it as an A4 PDF. The route signals that
 * it has finished laying out by setting the document title to `atlas-print-ready`.
 */
export async function printRouteToPdf(options: {
  devServerUrl?: string
  hash: string
}): Promise<Buffer> {
  const window = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  try {
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('print view timed out')), 25_000)
      window.webContents.on('page-title-updated', (_event, title) => {
        if (title === 'atlas-print-ready') {
          clearTimeout(timer)
          resolve()
        }
      })
    })
    await window.loadURL(`${options.devServerUrl ?? `${APP_ORIGIN}/index.html`}#${options.hash}`)
    await ready
    return await window.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })
  } finally {
    window.destroy()
  }
}

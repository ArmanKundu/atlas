import { isAbsolute, join, normalize, relative } from 'node:path'
import { APP_HOST, APP_ORIGIN, APP_SCHEME } from '@shared/constants'

/**
 * Content Security Policy for the renderer (DECISIONS.md D-006).
 *
 * Production allows only the app's own origin. KaTeX fonts are bundled, so they are `'self'`.
 * Development additionally allows what the local Vite dev server needs for hot reload.
 */
export function buildCsp(options: { devServerUrl?: string } = {}): string {
  const { devServerUrl } = options

  if (devServerUrl) {
    const origin = new URL(devServerUrl).origin
    const ws = origin.replace(/^http/, 'ws')
    return [
      `default-src 'none'`,
      `script-src 'self' 'unsafe-inline'`,
      `style-src 'self' 'unsafe-inline'`,
      `font-src 'self' data:`,
      `img-src 'self' data: blob:`,
      `media-src 'self' data: blob:`,
      `connect-src 'self' ${origin} ${ws}`,
      `worker-src 'self' blob:`,
      `base-uri 'none'`,
      `form-action 'none'`,
      `frame-ancestors 'none'`,
    ].join('; ')
  }

  return [
    `default-src 'none'`,
    `script-src 'self'`,
    // Inline styles only: Radix injects a small <style> to lock scrolling behind dialogs, and
    // KaTeX writes style attributes. Scripts stay strictly 'self'.
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self' data:`,
    `img-src 'self' data: blob:`,
    `media-src 'self' data: blob:`,
    `connect-src 'self'`,
    `worker-src 'self' blob:`,
    `base-uri 'none'`,
    `form-action 'none'`,
    `frame-ancestors 'none'`,
  ].join('; ')
}

/**
 * Maps an `atlas://app/...` URL to a file inside the built renderer folder.
 * Returns `null` for anything that is not ours or that would escape that folder.
 */
export function resolveRendererPath(rendererRoot: string, requestUrl: string): string | null {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host !== APP_HOST) return null

  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return null
  }
  if (pathname.includes('\0')) return null
  if (pathname === '' || pathname === '/') pathname = '/index.html'

  const target = normalize(join(rendererRoot, pathname))
  const rel = relative(rendererRoot, target)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return target
}

/** True when `url` is a page of the app itself (packaged origin or the dev server). */
export function isAppUrl(url: string, devServerUrl?: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (`${parsed.protocol}//${parsed.host}` === APP_ORIGIN) return true
  if (devServerUrl) return parsed.origin === new URL(devServerUrl).origin
  return false
}

/** Only plain web and mail links may be handed to the operating system. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

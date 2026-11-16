import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCsp, isAppUrl, isSafeExternalUrl, resolveRendererPath } from '../../src/main/security'

const root = join(sep, 'opt', 'atlas', 'out', 'renderer')

describe('resolveRendererPath', () => {
  it('maps the app origin to files inside the renderer folder', () => {
    expect(resolveRendererPath(root, 'atlas://app/')).toBe(join(root, 'index.html'))
    expect(resolveRendererPath(root, 'atlas://app/index.html')).toBe(join(root, 'index.html'))
    expect(resolveRendererPath(root, 'atlas://app/assets/main-abc.js?v=1#x')).toBe(
      join(root, 'assets', 'main-abc.js'),
    )
  })

  it('never resolves outside the renderer folder', () => {
    // URL parsing clamps plain and percent-encoded `..` segments at the origin.
    expect(resolveRendererPath(root, 'atlas://app/../main/index.js')).toBe(
      join(root, 'main', 'index.js'),
    )
    expect(resolveRendererPath(root, 'atlas://app/%2e%2e/%2e%2e/secret.txt')).toBe(
      join(root, 'secret.txt'),
    )
    // Encoded slashes survive URL parsing and only become `..` segments after decoding.
    expect(resolveRendererPath(root, 'atlas://app/..%2f..%2fetc%2fpasswd')).toBeNull()
    expect(
      resolveRendererPath(root, 'atlas://app/assets/..%2f..%2f..%2fmain%2findex.js'),
    ).toBeNull()
    expect(resolveRendererPath(root, 'atlas://app/assets/%00.js')).toBeNull()
  })

  it('refuses other hosts, other schemes and malformed input', () => {
    expect(resolveRendererPath(root, 'atlas://evil/index.html')).toBeNull()
    expect(resolveRendererPath(root, 'file:///etc/passwd')).toBeNull()
    expect(resolveRendererPath(root, 'https://app/index.html')).toBeNull()
    expect(resolveRendererPath(root, 'not a url')).toBeNull()
    expect(resolveRendererPath(root, 'atlas://app/%E0%A4%A')).toBeNull()
  })
})

describe('buildCsp', () => {
  it('allows only the app origin in production', () => {
    const csp = buildCsp()
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe/)
    expect(csp).not.toMatch(/https?:|wss?:/)
  })

  it('adds only the dev server origin in development', () => {
    const csp = buildCsp({ devServerUrl: 'http://localhost:5173/' })
    expect(csp).toContain('http://localhost:5173')
    expect(csp).toContain('ws://localhost:5173')
    expect(csp).not.toContain('https:')
  })
})

describe('isAppUrl', () => {
  it('accepts the packaged origin and the dev server only', () => {
    expect(isAppUrl('atlas://app/index.html#/settings')).toBe(true)
    expect(isAppUrl('http://localhost:5173/#/', 'http://localhost:5173')).toBe(true)
    expect(isAppUrl('http://localhost:5173/')).toBe(false)
    expect(isAppUrl('http://localhost:9999/', 'http://localhost:5173')).toBe(false)
    expect(isAppUrl('atlas://other/index.html')).toBe(false)
    expect(isAppUrl('https://example.com')).toBe(false)
    expect(isAppUrl('garbage')).toBe(false)
  })
})

describe('isSafeExternalUrl', () => {
  it('allows https and mailto, and nothing else', () => {
    expect(isSafeExternalUrl('https://github.com')).toBe(true)
    expect(isSafeExternalUrl('mailto:someone@example.com')).toBe(true)
    expect(isSafeExternalUrl('http://example.com')).toBe(false)
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('smb://server/share')).toBe(false)
    expect(isSafeExternalUrl('nope')).toBe(false)
  })
})

import { z } from 'zod'

/** Where Atlas looks for new versions: published (not draft) releases of the public repo. */
export const UPDATE_REPO = 'ArmanKundu/atlas'

export const UpdateStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle'), checkedAt: z.number().nullable() }),
  z.object({ state: z.literal('checking') }),
  z.object({
    state: z.literal('available'),
    version: z.string(),
    notes: z.string(),
    url: z.string(),
    /** False when this copy cannot replace itself (running from the disk image, or in dev). */
    canInstall: z.boolean(),
  }),
  z.object({ state: z.literal('backingUp'), version: z.string() }),
  z.object({
    state: z.literal('downloading'),
    version: z.string(),
    percent: z.number(),
  }),
  z.object({ state: z.literal('installing'), version: z.string(), backupPath: z.string() }),
  z.object({ state: z.literal('error'), message: z.string(), version: z.string().nullable() }),
])
export type UpdateStatus = z.infer<typeof UpdateStatusSchema>

/** Compares "0.1.3" with "v0.2.0". Pre-release suffixes sort before the release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): { nums: number[]; pre: string } => {
    const [core = '', pre = ''] = v.trim().replace(/^v/i, '').split('-', 2)
    return { nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  if (x.pre === y.pre) return 0
  if (!x.pre) return 1
  if (!y.pre) return -1
  return x.pre < y.pre ? -1 : 1
}

/**
 * Reads the file list from electron-builder's `latest.yml` / `latest-mac.yml`:
 * `files: - url: Atlas-0.2.0-mac-arm64.zip  sha512: …  size: …`.
 */
export function parseLatestYml(text: string): { url: string; sha512: string; size: number }[] {
  const out: { url: string; sha512: string; size: number }[] = []
  let current: { url?: string; sha512?: string; size?: number } | null = null
  const flush = (): void => {
    if (current?.url && current.sha512) {
      out.push({ url: current.url, sha512: current.sha512, size: current.size ?? 0 })
    }
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const item = /^-\s+url:\s*(.+)$/.exec(line)
    if (item?.[1]) {
      flush()
      current = { url: unquote(item[1]) }
      continue
    }
    if (!current) continue
    const sha = /^sha512:\s*(.+)$/.exec(line)
    if (sha?.[1]) current.sha512 = unquote(sha[1])
    const size = /^size:\s*(\d+)$/.exec(line)
    if (size?.[1]) current.size = Number(size[1])
    if (/^[a-zA-Z]+:/.test(raw)) {
      // A top-level key ends the files list.
      flush()
      current = null
    }
  }
  flush()
  return out
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

/** The installer this machine needs, from the names electron-builder gives them. */
export function pickAssetName(names: string[], platform: string, arch: string): string | undefined {
  if (platform === 'darwin') {
    return names.find((n) => n.endsWith(`-mac-${arch}.zip`))
  }
  if (platform === 'win32') {
    return names.find((n) => /-win-x64\.exe$/.test(n)) ?? names.find((n) => n.endsWith('.exe'))
  }
  return undefined
}

/** First few lines of the release notes, without the auto-generated "Full Changelog" link. */
export function shortNotes(body: string | null | undefined): string {
  return (body ?? '')
    .replace(/\*\*Full Changelog\*\*.*$/ms, '')
    .replace(/^#+\s*/gm, '')
    .trim()
    .slice(0, 600)
}

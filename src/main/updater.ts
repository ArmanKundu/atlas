import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  accessSync,
} from 'node:fs'
import { constants as fsConstants } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, net } from 'electron'
import {
  UPDATE_REPO,
  compareVersions,
  parseLatestYml,
  pickAssetName,
  shortNotes,
  type UpdateStatus,
} from '@shared/update'
import type { Logger } from './log'
import type { ProfileManager } from './profiles'

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const FIRST_CHECK_MS = 15_000

interface ReleaseAsset {
  name: string
  browser_download_url: string
}
interface Release {
  tag_name: string
  html_url: string
  body: string | null
  draft: boolean
  prerelease: boolean
  assets: ReleaseAsset[]
}

/**
 * Checks GitHub for a newer published release and, when the person clicks Update now, backs up
 * everything, downloads the installer for this machine, checks its SHA-512 against the release's
 * `latest*.yml`, and swaps it in.
 *
 * Mac builds are ad-hoc signed, so Squirrel (Electron's built-in updater) refuses them. Instead
 * the new `Atlas.app` is unzipped next to the old one and a small script swaps them once this
 * process exits. Windows runs the NSIS installer silently, which is what electron-updater does.
 *
 * The only request made is to api.github.com and GitHub's download host. Nothing is sent about
 * the person or their data.
 */
export class Updater {
  private status: UpdateStatus = { state: 'idle', checkedAt: null }
  private release: Release | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly deps: {
      log: Logger
      profiles: ProfileManager
      emit: (status: UpdateStatus) => void
      backupRoot: () => string
    },
  ) {}

  get current(): UpdateStatus {
    return this.status
  }

  start(): void {
    // End-to-end tests and screenshots show the bar without asking GitHub.
    const fake = process.env['ATLAS_FAKE_UPDATE']
    if (fake) {
      this.status = {
        state: 'available',
        version: fake,
        notes: 'Test release',
        url: `https://github.com/${UPDATE_REPO}/releases`,
        canInstall: false,
      }
      return
    }
    if (!app.isPackaged || process.env['ATLAS_USER_DATA']) return
    setTimeout(() => void this.check(), FIRST_CHECK_MS)
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.deps.emit(status)
  }

  async check(): Promise<UpdateStatus> {
    if (['backingUp', 'downloading', 'installing'].includes(this.status.state)) return this.status
    this.set({ state: 'checking' })
    try {
      const response = await net.fetch(
        `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`,
        {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Atlas-updater' },
        },
      )
      if (response.status === 404) {
        this.set({ state: 'idle', checkedAt: Date.now() })
        return this.status
      }
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`)
      const release = (await response.json()) as Release
      const version = release.tag_name.replace(/^v/, '')
      if (release.draft || release.prerelease || compareVersions(version, app.getVersion()) <= 0) {
        this.release = null
        this.set({ state: 'idle', checkedAt: Date.now() })
        return this.status
      }
      this.release = release
      this.set({
        state: 'available',
        version,
        notes: shortNotes(release.body),
        url: release.html_url,
        canInstall: this.canInstall(release),
      })
    } catch (error) {
      this.deps.log.warn('update check failed', error)
      this.set({ state: 'idle', checkedAt: Date.now() })
    }
    return this.status
  }

  /** The running `Atlas.app` on a Mac, or null when it is elsewhere (dev, a read-only disk image). */
  private macBundle(): string | null {
    const exe = app.getPath('exe')
    const bundle = dirname(dirname(dirname(exe)))
    if (!bundle.endsWith('.app') || bundle.startsWith('/Volumes/')) return null
    try {
      accessSync(dirname(bundle), fsConstants.W_OK)
      return bundle
    } catch {
      return null
    }
  }

  private canInstall(release: Release): boolean {
    if (!app.isPackaged) return false
    const name = pickAssetName(
      release.assets.map((a) => a.name),
      process.platform,
      process.arch,
    )
    if (!name) return false
    if (process.platform === 'darwin') return this.macBundle() !== null
    return process.platform === 'win32'
  }

  async install(): Promise<UpdateStatus> {
    const release = this.release
    if (!release || this.status.state !== 'available') return this.status
    const version = release.tag_name.replace(/^v/, '')
    try {
      // 1. A full copy of everyone's data, outside the app's own folder.
      this.set({ state: 'backingUp', version })
      const root = this.deps.backupRoot()
      mkdirSync(root, { recursive: true })
      const backupPath = this.deps.profiles.copyEverythingTo(root, `v${version}`)
      this.deps.log.info(`pre-update copy written to ${backupPath}`)

      // 2. The installer for this machine, checked against the published hash.
      const names = release.assets.map((a) => a.name)
      const name = pickAssetName(names, process.platform, process.arch)
      const asset = release.assets.find((a) => a.name === name)
      if (!asset) throw new Error('This release has no installer for this computer.')
      const ymlName = process.platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml'
      const yml = release.assets.find((a) => a.name === ymlName)
      const expected = yml
        ? parseLatestYml(await (await net.fetch(yml.browser_download_url)).text()).find(
            (f) => f.url === asset.name,
          )?.sha512
        : undefined
      if (!expected) throw new Error('The release is missing its checksum file.')

      const work = join(app.getPath('temp'), `atlas-update-${version}`)
      rmSync(work, { recursive: true, force: true })
      mkdirSync(work, { recursive: true })
      const file = join(work, asset.name)
      const actual = await this.download(asset.browser_download_url, file, version)
      if (actual !== expected) throw new Error('The download did not match its checksum.')

      // 3. Swap it in and restart.
      this.set({ state: 'installing', version, backupPath })
      if (process.platform === 'darwin') await this.installMac(file, work)
      else this.installWindows(file)
      setTimeout(() => app.quit(), 400)
      return this.status
    } catch (error) {
      this.deps.log.error('update failed', error)
      const message = error instanceof Error ? error.message : 'The update could not be installed.'
      this.set({ state: 'error', message, version })
      return this.status
    }
  }

  private async download(url: string, file: string, version: string): Promise<string> {
    const response = await net.fetch(url)
    if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}).`)
    const total = Number(response.headers.get('content-length')) || 0
    const hash = createHash('sha512')
    const out = createWriteStream(file)
    const reader = response.body.getReader()
    let received = 0
    let lastPercent = -1
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      received += value.length
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()))
      const percent = total ? Math.floor((received / total) * 100) : 0
      if (percent !== lastPercent) {
        lastPercent = percent
        this.set({ state: 'downloading', version, percent })
      }
    }
    await new Promise<void>((resolve, reject) => {
      out.end(() => resolve())
      out.on('error', reject)
    })
    return hash.digest('base64')
  }

  private async installMac(zip: string, work: string): Promise<void> {
    const bundle = this.macBundle()
    if (!bundle) throw new Error('Move Atlas to Applications first, then update.')
    const unpacked = join(work, 'app')
    await run('/usr/bin/ditto', ['-x', '-k', zip, unpacked])
    const fresh = join(unpacked, 'Atlas.app')
    if (!existsSync(fresh)) throw new Error('The update did not contain Atlas.app.')
    const script = join(work, 'swap.sh')
    writeFileSync(
      script,
      [
        '#!/bin/bash',
        `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
        `OLD="${bundle}"; NEW="${fresh}"`,
        'rm -rf "$OLD.previous"',
        'mv "$OLD" "$OLD.previous" && mv "$NEW" "$OLD" || { mv "$OLD.previous" "$OLD"; open "$OLD"; exit 1; }',
        'xattr -dr com.apple.quarantine "$OLD" 2>/dev/null',
        'rm -rf "$OLD.previous"',
        'open "$OLD"',
      ].join('\n'),
      { mode: 0o755 },
    )
    spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }).unref()
  }

  private installWindows(installer: string): void {
    // Silent install over the current one, then start Atlas again. User data is in AppData.
    spawn(installer, ['/S', '--updated', '--force-run'], {
      detached: true,
      stdio: 'ignore',
    }).unref()
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    )
  })
}

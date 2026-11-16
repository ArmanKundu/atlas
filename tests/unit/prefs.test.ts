import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PrefsStore } from '../../src/main/prefs'

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'atlas-prefs-'))
  file = join(dir, 'nested', 'prefs.json')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('PrefsStore', () => {
  it('starts with defaults when there is no file', async () => {
    const store = new PrefsStore(file)
    expect(await store.load()).toEqual({ theme: 'system', sidebarCollapsed: false })
  })

  it('saves a change and reads it back in a new store', async () => {
    const store = new PrefsStore(file)
    await store.load()
    await store.set({ theme: 'dark' })
    await store.set({ sidebarCollapsed: true })

    const reopened = new PrefsStore(file)
    expect(await reopened.load()).toEqual({ theme: 'dark', sidebarCollapsed: true })
  })

  it('leaves no temp files behind and keeps the last of several quick writes', async () => {
    const store = new PrefsStore(file)
    await Promise.all([
      store.set({ theme: 'light' }),
      store.set({ theme: 'dark' }),
      store.set({ sidebarCollapsed: true }),
    ])
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      theme: 'dark',
      sidebarCollapsed: true,
    })
    expect(await readdir(join(dir, 'nested'))).toEqual(['prefs.json'])
  })

  it('falls back to defaults on a damaged file and keeps a copy of it', async () => {
    const store = new PrefsStore(join(dir, 'prefs.json'))
    await writeFile(join(dir, 'prefs.json'), '{ this is not json', 'utf8')
    expect(await store.load()).toEqual({ theme: 'system', sidebarCollapsed: false })
    expect(await readFile(join(dir, 'prefs.json.corrupt'), 'utf8')).toBe('{ this is not json')
  })

  it('falls back to defaults when values are the wrong type', async () => {
    await writeFile(join(dir, 'prefs.json'), JSON.stringify({ theme: 42 }), 'utf8')
    const store = new PrefsStore(join(dir, 'prefs.json'))
    expect((await store.load()).theme).toBe('system')
  })

  it('fills in defaults for keys added after the file was written', async () => {
    await writeFile(join(dir, 'prefs.json'), JSON.stringify({ theme: 'light' }), 'utf8')
    const store = new PrefsStore(join(dir, 'prefs.json'))
    expect(await store.load()).toEqual({ theme: 'light', sidebarCollapsed: false })
  })
})

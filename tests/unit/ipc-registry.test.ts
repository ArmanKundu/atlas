import { describe, expect, it, vi } from 'vitest'
import { AtlasError } from '@shared/errors'
import { ipcContract, ipcEvents, IPC_EVENTS } from '@shared/ipc'
import { CHANNEL_PATTERN } from '@shared/ipc-channels'
import { createIpcRegistry, runHandler, type IpcMainLike } from '../../src/main/ipc/registry'

const quietLog = { warn: vi.fn(), error: vi.fn() }

const prefs = { theme: 'dark', sidebarCollapsed: false, lastProfileId: null } as const

describe('ipc contract', () => {
  it('has a schema for every event name, and channel names the preload will pass through', () => {
    expect(Object.keys(ipcEvents).sort()).toEqual([...IPC_EVENTS].sort())
    for (const channel of Object.keys(ipcContract)) expect(channel).toMatch(CHANNEL_PATTERN)
    expect('__proto__').not.toMatch(CHANNEL_PATTERN)
    expect('fs:read file').not.toMatch(CHANNEL_PATTERN)
  })
})

describe('runHandler', () => {
  it('returns the handler result in an ok envelope', async () => {
    const result = await runHandler('prefs:get', () => prefs, undefined, quietLog)
    expect(result).toEqual({ ok: true, data: prefs })
  })

  it('rejects a request that does not match the schema, without calling the handler', async () => {
    const handler = vi.fn(() => prefs)
    const result = await runHandler('prefs:set', handler, { theme: 'neon' }, quietLog)
    expect(result).toMatchObject({ ok: false, error: { code: 'bad_request' } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects unknown keys in a patch', async () => {
    const result = await runHandler('prefs:set', () => prefs, { admin: true }, quietLog)
    expect(result).toMatchObject({ ok: false, error: { code: 'bad_request' } })
  })

  it('rejects a handler result that does not match the schema', async () => {
    const result = await runHandler(
      'prefs:get',
      () => ({ theme: 'neon' }) as never,
      undefined,
      quietLog,
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'bad_response' } })
  })

  it('passes the code and message of an AtlasError through', async () => {
    const result = await runHandler(
      'shell:openExternal',
      () => {
        throw new AtlasError('forbidden', 'Atlas only opens https and mail links.')
      },
      { url: 'https://example.com' },
      quietLog,
    )
    expect(result).toEqual({
      ok: false,
      error: { code: 'forbidden', message: 'Atlas only opens https and mail links.' },
    })
  })

  it('hides the details of an unexpected error', async () => {
    const result = await runHandler(
      'prefs:get',
      () => {
        throw new Error('ENOENT /Users/someone/secret/path')
      },
      undefined,
      quietLog,
    )
    expect(result).toMatchObject({ ok: false, error: { code: 'internal' } })
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})

describe('createIpcRegistry', () => {
  function fakeIpcMain() {
    const handlers = new Map<string, (event: { trusted: boolean }, payload: unknown) => unknown>()
    const ipcMain: IpcMainLike<{ trusted: boolean }> = {
      handle: (channel, listener) => void handlers.set(channel, listener),
      removeHandler: (channel) => void handlers.delete(channel),
    }
    return { ipcMain, handlers }
  }

  it('blocks senders that are not the app page', async () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const registry = createIpcRegistry({
      ipcMain,
      isTrustedSender: (event) => event.trusted,
      log: quietLog,
    })
    const handler = vi.fn(() => prefs)
    registry.handle('prefs:get', handler)

    const blocked = await handlers.get('prefs:get')?.({ trusted: false }, undefined)
    expect(blocked).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(handler).not.toHaveBeenCalled()

    const allowed = await handlers.get('prefs:get')?.({ trusted: true }, undefined)
    expect(allowed).toEqual({ ok: true, data: prefs })
  })

  it('refuses a second handler for the same channel and reports missing ones', () => {
    const { ipcMain } = fakeIpcMain()
    const registry = createIpcRegistry({ ipcMain, isTrustedSender: () => true, log: quietLog })
    registry.handle('prefs:get', () => prefs)
    expect(() => registry.handle('prefs:get', () => prefs)).toThrow(/already has a handler/)
    expect(registry.missing()).not.toContain('prefs:get')
    expect(registry.missing()).toContain('app:info')
  })

  it('removes its handlers on dispose', () => {
    const { ipcMain, handlers } = fakeIpcMain()
    const registry = createIpcRegistry({ ipcMain, isTrustedSender: () => true, log: quietLog })
    registry.handle('prefs:get', () => prefs)
    registry.dispose()
    expect(handlers.size).toBe(0)
  })
})

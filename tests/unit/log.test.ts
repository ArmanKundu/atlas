import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFileLogger, formatDetail } from '../../src/main/log'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'atlas-log-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createFileLogger', () => {
  it('appends one line per entry with level and detail', async () => {
    const log = createFileLogger(join(dir, 'logs'))
    log.info('started')
    log.error('failed', new Error('boom'))

    const text = await readFile(join(dir, 'logs', 'atlas.log'), 'utf8')
    const lines = text.trimEnd().split('\n')
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.* INFO started$/)
    expect(text).toContain('ERROR failed | Error: boom')
  })

  it('rotates by size and keeps at most five files', async () => {
    const log = createFileLogger(dir, { maxBytes: 200 })
    for (let i = 0; i < 200; i++) log.info(`entry ${i} ${'x'.repeat(40)}`)

    const files = (await readdir(dir)).sort()
    expect(files).toEqual(['atlas.1.log', 'atlas.2.log', 'atlas.3.log', 'atlas.4.log', 'atlas.log'])
    expect(await readFile(join(dir, 'atlas.log'), 'utf8')).toContain('entry 199')
  })
})

describe('formatDetail', () => {
  it('handles strings, objects, errors and unserialisable values', () => {
    expect(formatDetail(undefined)).toBe('')
    expect(formatDetail('text')).toBe(' | text')
    expect(formatDetail({ a: 1 })).toBe(' | {"a":1}')
    expect(formatDetail(new TypeError('bad'))).toContain('TypeError: bad')
    const loop: Record<string, unknown> = {}
    loop['self'] = loop
    expect(formatDetail(loop)).toBe(' | [unserialisable detail]')
  })
})

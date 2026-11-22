import { describe, expect, it } from 'vitest'
import { compareVersions, parseLatestYml, pickAssetName, shortNotes } from '@shared/update'

describe('compareVersions', () => {
  it('orders numeric parts and ignores a leading v', () => {
    expect(compareVersions('0.1.3', 'v0.2.0')).toBe(-1)
    expect(compareVersions('v1.10.0', '1.9.9')).toBe(1)
    expect(compareVersions('0.2.0', '0.2.0')).toBe(0)
  })
  it('puts pre-releases before the release', () => {
    expect(compareVersions('0.2.0-beta.1', '0.2.0')).toBe(-1)
    expect(compareVersions('0.2.0', '0.2.0-rc.1')).toBe(1)
  })
})

describe('parseLatestYml', () => {
  it('reads every file with its hash and size', () => {
    const yml = [
      'version: 0.2.0',
      'files:',
      '  - url: Atlas-0.2.0-mac-arm64.zip',
      '    sha512: abc==',
      '    size: 123',
      "  - url: 'Atlas-0.2.0-mac-x64.zip'",
      '    sha512: def==',
      '    size: 456',
      'path: Atlas-0.2.0-mac-arm64.zip',
      'sha512: abc==',
      "releaseDate: '2026-11-22T00:00:00.000Z'",
    ].join('\n')
    expect(parseLatestYml(yml)).toEqual([
      { url: 'Atlas-0.2.0-mac-arm64.zip', sha512: 'abc==', size: 123 },
      { url: 'Atlas-0.2.0-mac-x64.zip', sha512: 'def==', size: 456 },
    ])
  })
})

describe('pickAssetName', () => {
  const names = [
    'Atlas-0.2.0-mac-arm64.dmg',
    'Atlas-0.2.0-mac-arm64.zip',
    'Atlas-0.2.0-mac-x64.zip',
    'Atlas-0.2.0-win-x64.exe',
    'latest-mac.yml',
  ]
  it('picks the zip for this Mac and the exe for Windows', () => {
    expect(pickAssetName(names, 'darwin', 'arm64')).toBe('Atlas-0.2.0-mac-arm64.zip')
    expect(pickAssetName(names, 'darwin', 'x64')).toBe('Atlas-0.2.0-mac-x64.zip')
    expect(pickAssetName(names, 'win32', 'x64')).toBe('Atlas-0.2.0-win-x64.exe')
    expect(pickAssetName(names, 'linux', 'x64')).toBeUndefined()
  })
})

describe('shortNotes', () => {
  it('drops the changelog link and heading marks', () => {
    expect(shortNotes("## What's changed\n* Exam mode\n\n**Full Changelog**: https://x")).toBe(
      "What's changed\n* Exam mode",
    )
  })
})

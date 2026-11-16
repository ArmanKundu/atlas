import { platform } from './ipc'

export function isMac(): boolean {
  return platform() === 'darwin'
}

/** Shortcut label for the platform: `⌘K` on macOS, `Ctrl K` elsewhere. */
export function modKey(key: string): string {
  return isMac() ? `⌘${key}` : `Ctrl ${key}`
}

/** True when the platform's main modifier (⌘ or Ctrl) is held, and nothing else. */
export function isModOnly(event: KeyboardEvent): boolean {
  const mod = isMac() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  return mod && !event.altKey && !event.shiftKey
}

export interface ShortcutInfo {
  keys: string
  description: string
}

/** Shortcuts that work today. Later phases add to this list as their features land. */
export function globalShortcuts(): ShortcutInfo[] {
  return [
    { keys: modKey('K'), description: 'Search everything and run commands' },
    { keys: modKey('\\'), description: 'Show or hide the sidebar' },
    { keys: modKey(','), description: 'Open Settings' },
    { keys: modKey('1'), description: 'Go to Today' },
    { keys: modKey('J'), description: 'Open the assistant' },
  ]
}

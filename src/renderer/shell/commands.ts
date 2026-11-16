import { useEffect, useSyncExternalStore } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface Command {
  id: string
  title: string
  /** Heading the command is listed under in the palette. */
  group: string
  icon?: LucideIcon
  keywords?: string[]
  shortcut?: string
  run: () => void
}

/**
 * Registry behind the command palette. The shell registers navigation and appearance commands;
 * each feature registers its own ("Start timer: Methods", "New note") while it is mounted.
 */
const sources = new Map<string, Command[]>()
const subscribers = new Set<() => void>()
let snapshot: Command[] = []

function publish(): void {
  snapshot = [...sources.values()].flat()
  for (const notify of subscribers) notify()
}

export function registerCommands(source: string, commands: Command[]): () => void {
  sources.set(source, commands)
  publish()
  return () => {
    if (sources.get(source) === commands) {
      sources.delete(source)
      publish()
    }
  }
}

function subscribeToCommands(notify: () => void): () => void {
  subscribers.add(notify)
  return () => subscribers.delete(notify)
}

export function useCommands(): Command[] {
  return useSyncExternalStore(subscribeToCommands, () => snapshot)
}

/** Registers `commands` while the calling component is mounted. Pass a memoised array. */
export function useRegisterCommands(source: string, commands: Command[]): void {
  useEffect(() => registerCommands(source, commands), [source, commands])
}

/** Groups commands by heading, keeping first-seen order for both groups and commands. */
export function groupCommands(commands: Command[]): { group: string; commands: Command[] }[] {
  const groups = new Map<string, Command[]>()
  for (const command of commands) {
    const list = groups.get(command.group)
    if (list) list.push(command)
    else groups.set(command.group, [command])
  }
  return [...groups].map(([group, list]) => ({ group, commands: list }))
}

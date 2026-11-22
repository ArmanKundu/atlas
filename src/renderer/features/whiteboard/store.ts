import { useSyncExternalStore } from 'react'
import type { Board } from '@shared/whiteboard'

/** The board open in the side panel, shared between chat cards and the panel. */
let current: { board: Board; key: number } | null = null
const listeners = new Set<() => void>()

export function openBoard(board: Board): void {
  current = { board, key: Date.now() }
  for (const l of listeners) l()
}

export function closeBoard(): void {
  current = null
  for (const l of listeners) l()
}

export function useOpenBoard(): { board: Board; key: number } | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

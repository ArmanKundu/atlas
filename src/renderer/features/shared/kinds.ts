import type { SharedKind } from '@shared/community'

export const KIND_LABEL: Record<SharedKind, string> = {
  note: 'Note',
  file: 'File',
  deck: 'Flashcards',
  link: 'Link',
  lesson: 'Lesson',
}

/** "just now", "5 min ago", "3 days ago", or a date for anything older than a month. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

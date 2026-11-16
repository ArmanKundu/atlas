import type { Stats } from '@shared/models'
import type { Database } from './db/database'

export function localDay(time: number): string {
  const d = new Date(time)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Monday 00:00 local time of the week containing `time`. */
export function startOfWeek(time: number): number {
  const d = new Date(time)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

/** Consecutive days with study time, ending today (or yesterday, if today has none yet). */
export function streak(days: Record<string, number>, now: number): number {
  let count = 0
  const cursor = new Date(now)
  cursor.setHours(12, 0, 0, 0)
  if (!days[localDay(cursor.getTime())]) cursor.setDate(cursor.getDate() - 1)
  while (days[localDay(cursor.getTime())]) {
    count++
    cursor.setDate(cursor.getDate() - 1)
  }
  return count
}

export function computeStats(db: Database, now = Date.now()): Stats {
  const since = now - 371 * 86_400_000
  const sessions = db.all(
    'SELECT started_at, seconds, subject_id FROM study_sessions WHERE deleted_at IS NULL AND started_at >= ?',
    since,
  )
  const days: Record<string, number> = {}
  const weekBySubject: Record<string, number> = {}
  const weekStart = startOfWeek(now)
  let weekSeconds = 0
  for (const s of sessions) {
    const at = Number(s['started_at'])
    const seconds = Number(s['seconds'])
    const day = localDay(at)
    days[day] = (days[day] ?? 0) + seconds
    if (at >= weekStart) {
      weekSeconds += seconds
      const key = String(s['subject_id'] ?? '')
      weekBySubject[key] = (weekBySubject[key] ?? 0) + seconds
    }
  }
  const count = (sql: string, ...params: number[]): number =>
    Number(db.one(sql, ...params)?.['n'] ?? 0)
  return {
    todaySeconds: days[localDay(now)] ?? 0,
    weekSeconds,
    streakDays: streak(days, now),
    dueCards: count(
      'SELECT COUNT(*) AS n FROM flashcards WHERE deleted_at IS NULL AND due <= ?',
      now,
    ),
    openMistakes: count(
      "SELECT COUNT(*) AS n FROM mistakes WHERE deleted_at IS NULL AND status = 'open'",
    ),
    weekBySubject,
    days,
    counts: {
      sources: count('SELECT COUNT(*) AS n FROM sources WHERE deleted_at IS NULL'),
      pages: count('SELECT COUNT(*) AS n FROM pages'),
      notes: count('SELECT COUNT(*) AS n FROM notes WHERE deleted_at IS NULL'),
      flashcards: count('SELECT COUNT(*) AS n FROM flashcards WHERE deleted_at IS NULL'),
      chats: count('SELECT COUNT(*) AS n FROM chats WHERE deleted_at IS NULL'),
    },
  }
}

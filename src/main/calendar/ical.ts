/** A small iCalendar reader: enough for school portal feeds (Compass, Canvas, Google, Outlook). */
export interface IcsEvent {
  uid: string
  title: string
  location: string | null
  description: string | null
  start: number
  end: number
  allDay: boolean
}

const unescapeText = (value: string): string =>
  value
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .trim()

/**
 * Reads an iCalendar date. `...Z` is UTC and a bare date is all-day. Times with a named zone
 * (TZID) or no zone are read as this computer's local time, which is right for a student in
 * the same place as their school.
 */
export function parseIcsDate(value: string): { time: number; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return null
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((part) =>
    Number(part ?? 0),
  ) as [number, number, number, number, number, number]
  if (m[4] === undefined) return { time: new Date(y, mo - 1, d).getTime(), allDay: true }
  const time = m[7] ? Date.UTC(y, mo - 1, d, h, mi, s) : new Date(y, mo - 1, d, h, mi, s).getTime()
  return { time, allDay: false }
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const events: IcsEvent[] = []
  let current: Record<string, string> | null = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = {}
    else if (line === 'END:VEVENT') {
      if (current) {
        const start = parseIcsDate(current['DTSTART'] ?? '')
        if (start && current['SUMMARY']) {
          const end = parseIcsDate(current['DTEND'] ?? '')
          const fallback = start.time + (start.allDay ? 86_400_000 : 3_600_000)
          events.push({
            uid: current['UID'] ?? `${current['SUMMARY']}-${start.time}`,
            title: unescapeText(current['SUMMARY']).slice(0, 300),
            location: current['LOCATION'] ? unescapeText(current['LOCATION']).slice(0, 300) : null,
            description: current['DESCRIPTION']
              ? unescapeText(current['DESCRIPTION']).slice(0, 5000)
              : null,
            start: start.time,
            end: end && end.time > start.time ? end.time : fallback,
            allDay: start.allDay,
          })
        }
      }
      current = null
    } else if (current) {
      const colon = line.indexOf(':')
      if (colon === -1) continue
      const name = line.slice(0, colon).split(';')[0]?.toUpperCase()
      if (name && !(name in current)) current[name] = line.slice(colon + 1)
    }
  }
  return events
}

/** Lesson, assessment, exam or due date, guessed from the event title. */
export function eventKindFromTitle(title: string): 'lesson' | 'sac' | 'exam' | 'due' | 'event' {
  const t = title.toLowerCase()
  if (/\bexam(ination)?s?\b/.test(t)) return 'exam'
  if (/\bsacs?\b|\btest\b|assessment|\bcat\b/.test(t)) return 'sac'
  if (/\bdue\b|submission|submit|hand in/.test(t)) return 'due'
  if (/excursion|assembly|meeting|camp|carnival|interview/.test(t)) return 'event'
  return 'lesson'
}

/** The subject whose name or code appears in the event title, if any. */
export function matchSubject(
  title: string,
  subjects: { id: string; name: string; code: string | null }[],
): string | null {
  const t = title.toLowerCase()
  const byName = subjects
    .filter((s) => t.includes(s.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0]
  if (byName) return byName.id
  for (const s of subjects) {
    const code = s.code?.trim().toLowerCase()
    if (
      code &&
      code.length >= 2 &&
      new RegExp(`(^|[^a-z0-9])${code.replace(/[^a-z0-9]/g, '')}`).test(
        t.replace(/[^a-z0-9 ]/g, ' '),
      )
    )
      return s.id
  }
  return null
}

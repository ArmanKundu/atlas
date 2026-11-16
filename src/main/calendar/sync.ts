import { AtlasError } from '@shared/errors'
import type { SecretStore } from '../ai/secrets'
import type { Logger } from '../log'
import type { ProfileManager } from '../profiles'
import { eventKindFromTitle, matchSubject, parseIcs } from './ical'

export interface CalendarStatus {
  connected: boolean
  lastSyncedAt: number | null
  events: number
  error: string | null
}

const DAY = 86_400_000

/**
 * School calendar sync through an iCal subscription link (Compass and other portals).
 * Read-only: Atlas downloads the feed and never writes to the portal. The link is a private URL,
 * so it is stored in the keychain, not in the database.
 */
export class CalendarSync {
  private timer: ReturnType<typeof setInterval> | undefined

  constructor(
    private readonly profiles: ProfileManager,
    private readonly secrets: SecretStore,
    private readonly log: Logger,
    private readonly onChange: () => void,
  ) {}

  private secretName(): string {
    return `${this.profiles.current?.id ?? 'none'}:calendar.ical`
  }

  status(): CalendarStatus {
    const db = this.profiles.db()
    return {
      connected: this.secrets.has(this.secretName()),
      lastSyncedAt: db.getSetting<number | null>('calendar.lastSyncedAt', null),
      events: Number(
        db.one(
          "SELECT COUNT(*) AS n FROM calendar_events WHERE source = 'compass_ical' AND deleted_at IS NULL",
        )?.['n'] ?? 0,
      ),
      error: db.getSetting<string | null>('calendar.lastError', null),
    }
  }

  async connect(rawUrl: string): Promise<CalendarStatus> {
    const url = rawUrl.trim().replace(/^webcals?:\/\//i, 'https://')
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new AtlasError(
        'bad_request',
        'That does not look like a calendar link. Copy the whole link and paste it again.',
      )
    }
    if (parsed.protocol !== 'https:')
      throw new AtlasError('bad_request', 'The calendar link must start with https or webcal.')
    await this.download(url) // fail before saving if the link does not work
    this.secrets.set(this.secretName(), url)
    return this.sync()
  }

  private async download(url: string): Promise<string> {
    let response: Response
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        headers: { Accept: 'text/calendar' },
      })
    } catch {
      throw new AtlasError(
        'unavailable',
        'The calendar could not be reached. Check your internet connection and try again.',
      )
    }
    if (!response.ok)
      throw new AtlasError(
        'unavailable',
        'The school portal refused that link. Copy a fresh link from the portal and connect again.',
      )
    const text = await response.text()
    if (!text.includes('BEGIN:VCALENDAR'))
      throw new AtlasError(
        'bad_request',
        'That link did not return a calendar. Make sure it is the calendar subscription link.',
      )
    return text
  }

  async sync(): Promise<CalendarStatus> {
    const db = this.profiles.db()
    const url = this.secrets.get(this.secretName())
    if (!url) return this.status()
    try {
      const now = Date.now()
      const events = parseIcs(await this.download(url))
        .filter((e) => e.end > now - 30 * DAY && e.start < now + 200 * DAY)
        .slice(0, 4000)
      const subjects = db.list('subjects').map((s) => ({
        id: String(s['id']),
        name: String(s['name']),
        code: (s['code'] as string | null) ?? null,
      }))
      db.tx(() => {
        db.run("DELETE FROM calendar_events WHERE source = 'compass_ical'")
        for (const event of events) {
          db.insert('calendar_events', {
            source: 'compass_ical',
            externalId: event.uid.slice(0, 300),
            title: event.title,
            location: event.location,
            startsAt: event.start,
            endsAt: event.end,
            allDay: event.allDay,
            subjectId: matchSubject(event.title, subjects),
            kind: eventKindFromTitle(event.title),
            notes: event.description,
          })
        }
      })
      db.setSetting('calendar.lastSyncedAt', now)
      db.setSetting('calendar.lastError', null)
    } catch (error) {
      const message =
        error instanceof AtlasError ? error.message : 'The calendar could not be read.'
      db.setSetting('calendar.lastError', message)
      this.log.warn('calendar sync failed')
    }
    this.onChange()
    return this.status()
  }

  disconnect(): CalendarStatus {
    const db = this.profiles.db()
    this.secrets.delete(this.secretName())
    db.tx(() => db.run("DELETE FROM calendar_events WHERE source = 'compass_ical'"))
    db.setSetting('calendar.lastSyncedAt', null)
    db.setSetting('calendar.lastError', null)
    this.onChange()
    return this.status()
  }

  /** Syncs now if connected, and then every hour while the app is open. */
  start(): void {
    clearInterval(this.timer)
    const run = (): void => {
      if (this.profiles.current && this.secrets.has(this.secretName()))
        void this.sync().catch(() => undefined)
    }
    run()
    this.timer = setInterval(run, 60 * 60_000)
  }
}

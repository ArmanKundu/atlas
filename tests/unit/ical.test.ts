import { describe, expect, it } from 'vitest'
import {
  eventKindFromTitle,
  matchSubject,
  parseIcs,
  parseIcsDate,
} from '../../src/main/calendar/ical'

const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:lesson-1@school',
  'DTSTART;TZID=Australia/Melbourne:20261116T090000',
  'DTEND;TZID=Australia/Melbourne:20261116T101500',
  'SUMMARY:12CHEM1 - Chemistry\\, Period 1',
  'LOCATION:S12',
  'DESCRIPTION:Bring your data book\\nand lab coat with a very long line that is fol',
  ' ded across two lines',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:sac-9',
  'DTSTART:20261120T000000Z',
  'DTEND:20261120T010000Z',
  'SUMMARY:Maths Methods SAC 3',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20261201',
  'SUMMARY:Curriculum day',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'SUMMARY:No start time, skipped',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('parseIcs', () => {
  it('reads timed, UTC and all-day events and skips broken ones', () => {
    const events = parseIcs(FEED)
    expect(events).toHaveLength(3)
    expect(events[0]).toMatchObject({
      uid: 'lesson-1@school',
      title: '12CHEM1 - Chemistry, Period 1',
      location: 'S12',
      allDay: false,
    })
    expect(events[0]?.description).toBe(
      'Bring your data book\nand lab coat with a very long line that is folded across two lines',
    )
    expect(new Date(events[0]?.start ?? 0).getHours()).toBe(9)
    expect((events[0]?.end ?? 0) - (events[0]?.start ?? 0)).toBe(75 * 60_000)
    expect(events[1]?.start).toBe(Date.UTC(2026, 10, 20))
    expect(events[2]).toMatchObject({ title: 'Curriculum day', allDay: true })
    expect((events[2]?.end ?? 0) - (events[2]?.start ?? 0)).toBe(86_400_000)
  })

  it('rejects dates it cannot read', () => {
    expect(parseIcsDate('tomorrow')).toBeNull()
    expect(parseIcsDate('20261116')).toMatchObject({ allDay: true })
  })
})

describe('calendar mapping', () => {
  const subjects = [
    { id: 'chem', name: 'Chemistry', code: 'CHEM' },
    { id: 'mm', name: 'Mathematical Methods', code: 'MM' },
    { id: 'eng', name: 'English', code: null },
  ]

  it('matches a subject by name first, then by code', () => {
    expect(matchSubject('12CHEM1 - Chemistry, Period 1', subjects)).toBe('chem')
    expect(matchSubject('MM SAC 2', subjects)).toBe('mm')
    expect(matchSubject('English Language oral', subjects)).toBe('eng')
    expect(matchSubject('Assembly', subjects)).toBeNull()
  })

  it('guesses the kind of event from its title', () => {
    expect(eventKindFromTitle('Chemistry SAC 2')).toBe('sac')
    expect(eventKindFromTitle('English Exam')).toBe('exam')
    expect(eventKindFromTitle('Essay due')).toBe('due')
    expect(eventKindFromTitle('Whole school assembly')).toBe('event')
    expect(eventKindFromTitle('12CHEM1 Period 3')).toBe('lesson')
  })
})

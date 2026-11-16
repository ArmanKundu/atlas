import { describe, expect, it } from 'vitest'
import { intervalLabel, reviewCard } from '@shared/sm2'
import { excerptAround, toRetrievalQuery } from '../../src/main/ai/service'
import { extractJson } from '../../src/main/ai/prompts/tasks'
import { parseLine } from '../../src/main/ai/adapters/claude-code/cli'
import {
  detectKind,
  detectYear,
  splitTextIntoPages,
  titleFromFileName,
} from '../../src/main/ingest/detect'
import { localDay, startOfWeek, streak } from '../../src/main/stats'

const DAY = 86_400_000
const fresh = { ease: 2.5, interval: 0, reps: 0, lapses: 0 }

describe('SM-2', () => {
  it('schedules a new card: again soon, good tomorrow, easy in four days', () => {
    expect(reviewCard(fresh, 1, 0)).toMatchObject({ interval: 0, reps: 0, lapses: 1, due: 600_000 })
    expect(reviewCard(fresh, 3, 0)).toMatchObject({ interval: 1, reps: 1, due: DAY })
    expect(reviewCard(fresh, 4, 0)).toMatchObject({ interval: 4, reps: 1 })
  })

  it('grows intervals with ease and never lets ease fall below 1.3', () => {
    let card = { ...fresh }
    const intervals: number[] = []
    for (let i = 0; i < 5; i++) {
      card = reviewCard(card, 3, 0)
      intervals.push(card.interval)
    }
    expect(intervals).toEqual([1, 3, 8, 20, 50])
    let hard = { ...fresh }
    for (let i = 0; i < 20; i++) hard = reviewCard(hard, 1, 0)
    expect(hard.ease).toBe(1.3)
    expect(
      reviewCard({ ease: 2.5, interval: 10, reps: 3, lapses: 0 }, 2, 0).interval,
    ).toBeGreaterThan(10)
  })

  it('labels the next interval', () => {
    expect(intervalLabel(fresh, 1)).toBe('10 min')
    expect(intervalLabel(fresh, 3)).toBe('1 d')
    expect(intervalLabel({ ease: 2.5, interval: 40, reps: 4, lapses: 0 }, 3)).toBe('3 mo')
  })
})

describe('document type detection', () => {
  it.each([
    ['2023 VCE Chemistry examination report.pdf', '', 'examiner_report'],
    ['Biology Study Design 2022-2026.pdf', '', 'study_design'],
    ['2022-mm2-solutions.pdf', '', 'solutions'],
    ['2021 Specialist Maths Exam 2.pdf', '', 'exam'],
    ['chem_data_book.pdf', '', 'data_book'],
    ['scan0042.pdf', 'Written examination\nReading time: 15 minutes', 'exam'],
    ['scan0043.pdf', 'Chapter 4 Enzymes', 'textbook'],
    ['holiday-photo.pdf', 'nothing useful here', 'other'],
  ])('%s → %s', (name, page, kind) => {
    expect(detectKind(name, page).kind).toBe(kind)
  })

  it('is less sure when only the page text matches', () => {
    expect(detectKind('2021 Exam.pdf').confidence).toBeGreaterThanOrEqual(0.8)
    expect(detectKind('x.pdf', 'lecture slides').confidence).toBeLessThan(0.8)
  })

  it('reads a year and a title from the file name', () => {
    expect(detectYear('2023_Chem_Exam.pdf')).toBe(2023)
    expect(detectYear('2022-2026 study design.pdf')).toBeNull()
    expect(detectYear('notes.pdf')).toBeNull()
    expect(titleFromFileName('2023_Chem_Exam-1.pdf')).toBe('2023 Chem Exam 1')
  })

  it('splits text into pages on form feeds or by size', () => {
    expect(splitTextIntoPages('one\ftwo\fthree')).toEqual(['one', 'two', 'three'])
    const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} ${'x'.repeat(300)}`).join(
      '\n\n',
    )
    const pages = splitTextIntoPages(long, 1000)
    expect(pages.length).toBeGreaterThan(5)
    expect(pages.join(' ')).toContain('Paragraph 39')
  })
})

describe('study stats', () => {
  it('finds Monday as the start of the week', () => {
    const wednesday = new Date(2026, 10, 18, 15, 30).getTime()
    const monday = new Date(startOfWeek(wednesday))
    expect([monday.getDay(), monday.getDate(), monday.getHours()]).toEqual([1, 16, 0])
    expect(new Date(startOfWeek(new Date(2026, 10, 22, 23, 59).getTime())).getDate()).toBe(16)
  })

  it('counts a streak that may end yesterday', () => {
    const now = new Date(2026, 10, 18, 9).getTime()
    const day = (offset: number): string => localDay(now - offset * DAY)
    expect(streak({ [day(0)]: 600, [day(1)]: 600, [day(2)]: 600 }, now)).toBe(3)
    expect(streak({ [day(1)]: 600, [day(2)]: 600 }, now)).toBe(2)
    expect(streak({ [day(2)]: 600 }, now)).toBe(0)
    expect(streak({}, now)).toBe(0)
  })
})

describe('AI helpers', () => {
  it('builds a retrieval query from the distinctive words', () => {
    expect(toRetrievalQuery('Can you explain what competitive inhibition does to enzymes?')).toBe(
      '"competitive" OR "inhibition" OR "enzymes"',
    )
    expect(toRetrievalQuery('why?')).toBe('')
  })

  it('excerpts around the first match', () => {
    const text = `${'a '.repeat(2000)}the enzyme binds ${'b '.repeat(2000)}`
    const excerpt = excerptAround(text, 'enzyme', 300)
    expect(excerpt).toContain('enzyme')
    expect(excerpt.length).toBeLessThan(320)
    expect(excerpt.startsWith('… ')).toBe(true)
  })

  it('pulls JSON out of model output', () => {
    expect(extractJson('Here you go:\n```json\n[{"front":"a","back":"b"}]\n```')).toEqual([
      { front: 'a', back: 'b' },
    ])
    expect(extractJson('{"a": [1, 2]} trailing')).toEqual({ a: [1, 2] })
    expect(() => extractJson('no json here')).toThrow()
  })

  it('reads Claude Code stream events', () => {
    expect(
      parseLine(
        JSON.stringify({
          type: 'stream_event',
          event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
        }),
      ),
    ).toEqual({ text: 'Hi' })
    expect(
      parseLine(JSON.stringify({ type: 'result', is_error: false, result: 'Hi there' })),
    ).toEqual({ final: { ok: true, text: 'Hi there' } })
    expect(parseLine(JSON.stringify({ type: 'system', subtype: 'init' }))).toEqual({})
    expect(parseLine('not json')).toEqual({})
  })
})

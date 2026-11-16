import { describe, expect, it } from 'vitest'
import { groupCommands, type Command } from '@/shell/commands'
import { greetingFor } from '@/lib/greeting'

const command = (id: string, group: string): Command => ({
  id,
  title: id,
  group,
  run: () => undefined,
})

describe('groupCommands', () => {
  it('groups by heading and keeps first-seen order', () => {
    const grouped = groupCommands([
      command('a', 'Go to'),
      command('b', 'Appearance'),
      command('c', 'Go to'),
    ])
    expect(grouped.map((g) => g.group)).toEqual(['Go to', 'Appearance'])
    expect(grouped[0]?.commands.map((c) => c.id)).toEqual(['a', 'c'])
  })

  it('returns nothing for no commands', () => {
    expect(groupCommands([])).toEqual([])
  })
})

describe('greetingFor', () => {
  it('matches the time of day', () => {
    expect(greetingFor(2)).toBe('Still up')
    expect(greetingFor(5)).toBe('Good morning')
    expect(greetingFor(12)).toBe('Good afternoon')
    expect(greetingFor(18)).toBe('Good evening')
    expect(greetingFor(23)).toBe('Good evening')
  })
})

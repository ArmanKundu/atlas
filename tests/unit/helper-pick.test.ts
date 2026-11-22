import { describe, expect, it } from 'vitest'
import { pickHelper } from '../../src/shared/helper-pick'

const ALL = [
  'tutor',
  'solver',
  'examiner',
  'marker',
  'checker',
  'notes',
  'cards',
  'quiz',
  'planner',
  'exam-maker',
  'maths-coach',
  'proof-coach',
  'essay-coach',
]

describe('pickHelper', () => {
  it('picks a maker for flashcards and exams', () => {
    expect(pickHelper('Make flashcards on cell biology', ALL)).toBe('cards')
    expect(pickHelper('Write me a practice exam for unit 3', ALL)).toBe('exam-maker')
  })
  it('picks the marker and the checker', () => {
    expect(pickHelper('Can you mark my answer out of 4?', ALL)).toBe('marker')
    expect(pickHelper('Is this right? x = 4', ALL)).toBe('checker')
  })
  it('uses subject helpers only inside a matching subject', () => {
    expect(pickHelper('Prove that root 2 is irrational', ALL, 'maths')).toBe('proof-coach')
    expect(pickHelper('Prove that root 2 is irrational', ALL, 'essay')).toBe('tutor')
    expect(pickHelper('Help with my essay introduction', ALL, 'essay')).toBe('essay-coach')
  })
  it('skips helpers that are not available and falls back to the tutor', () => {
    expect(pickHelper('Make flashcards', ['tutor'])).toBe('tutor')
    expect(pickHelper('Why is the sky blue?', ALL)).toBe('tutor')
  })
})

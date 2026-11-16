import { describe, expect, it } from 'vitest'
import { answerSpace, parseExam } from '@shared/exam-format'

const PAPER = `# Chemistry practice examination
## Section A - Multiple-choice questions
### Question 1
Which one is a strong acid?
A. ethanoic acid
B. hydrochloric acid
## Section B - Short-answer questions
### Question 1 (6 marks)
A student titrates an acid.
**a.** Write a balanced equation. (1 mark)
**b.** Calculate the concentration. (3 marks)
**c.** Explain the choice of indicator. (2 marks)
### Question 2 (3 marks)
Explain how a catalyst works. (3 marks)`

describe('parseExam', () => {
  const exam = parseExam(PAPER)

  it('reads the title, sections, questions and marks', () => {
    expect(exam.structured).toBe(true)
    expect(exam.title).toBe('Chemistry practice examination')
    expect(
      exam.sections.map((s) => [s.title, s.multipleChoice, s.questions.length, s.marks]),
    ).toEqual([
      ['Section A - Multiple-choice questions', true, 1, 1],
      ['Section B - Short-answer questions', false, 2, 9],
    ])
    expect(exam.totalMarks).toBe(10)
  })

  it('gives each part its own answer space and none to multiple choice', () => {
    const [mc] = exam.sections[0]?.questions ?? []
    expect(mc?.chunks.every((c) => c.marks === 0)).toBe(true)
    expect(mc?.chunks[0]?.markdown).toContain('**A.**')
    const [q1, q2] = exam.sections[1]?.questions ?? []
    expect(q1?.heading).toBe('Question 1')
    expect(q1?.chunks.map((c) => c.marks)).toEqual([1, 3, 2])
    expect(q2?.chunks.map((c) => c.marks)).toEqual([3])
  })

  it('falls back to plain text when there are no question headings', () => {
    expect(parseExam('Just some text\\n\\n1. A question').structured).toBe(false)
  })
})

describe('answerSpace', () => {
  it('uses lines for sciences, more lines for essays and blank working for maths', () => {
    expect(answerSpace(3, 'science')).toEqual({ type: 'lines', count: 7 })
    expect(answerSpace(10, 'essay')).toEqual({ type: 'lines', count: 30 })
    expect(answerSpace(2, 'maths')).toEqual({ type: 'blank', count: 4 })
    expect(answerSpace(0, 'science').count).toBe(0)
  })
})

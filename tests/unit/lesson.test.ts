import { describe, expect, it } from 'vitest'
import {
  compileFormula,
  crossings,
  integrate,
  parseLesson,
  parseLessonPartial,
  sceneTimeline,
} from '../../src/shared/lesson'

const LESSON = {
  title: 'Area between curves',
  theme: 'board',
  scenes: [
    {
      title: 'Where do they meet?',
      say: 'First we find where the curves cross.',
      graph: { x: [-2, 3], y: [-2, 5] },
      items: [
        { t: 'curve', id: 'f', fn: 'x^2 - 2x', c: 'blue' },
        { t: 'curve', id: 'g', fn: '4 - x^2', c: 'yellow' },
        { t: 'meet', of: ['f', 'g'] },
        { t: 'math', tex: 'x^2-2x = 4-x^2' },
        { t: 'nonsense', x: 1 },
      ],
    },
    {
      say: 'Then we subtract and integrate.',
      items: [{ t: 'area', between: ['g', 'f'], from: -1, to: 2 }],
    },
  ],
}

describe('lesson', () => {
  it('parses a lesson and drops items it does not know', () => {
    const lesson = parseLesson('```atlas-lesson\n' + JSON.stringify(LESSON) + '\n```')
    expect(lesson?.scenes).toHaveLength(2)
    expect(lesson?.scenes[0]?.items).toHaveLength(4)
    expect(lesson?.scenes[0]?.graph?.x).toEqual([-2, 3])
  })

  it('reads the finished scenes of a lesson still being written', () => {
    const text = JSON.stringify(LESSON)
    const cut = text.slice(0, text.indexOf('Then we subtract'))
    const partial = parseLessonPartial(cut)
    expect(partial?.title).toBe('Area between curves')
    expect(partial?.scenes).toHaveLength(1)
  })

  it('finds crossings and areas itself', () => {
    const f = compileFormula('x^2 - 2x')
    const g = compileFormula('4 - x^2')
    if (!f || !g) throw new Error('formula')
    const xs = crossings(f, g, -5, 5).map((x) => Math.round(x * 1000) / 1000)
    expect(xs).toEqual([-1, 2])
    expect(integrate((x) => g(x) - f(x), -1, 2)).toBeCloseTo(9, 6)
  })

  it('spreads drawing across the narration', () => {
    const lesson = parseLesson(JSON.stringify(LESSON))
    const scene = lesson?.scenes[0]
    if (!scene) throw new Error('scene')
    const times = sceneTimeline(scene, 10)
    expect(times).toHaveLength(4)
    expect(times[0]?.start).toBeGreaterThanOrEqual(0)
    expect(times.at(-1)?.end).toBeLessThanOrEqual(10)
    for (let i = 1; i < times.length; i++)
      expect(times[i]?.start).toBeGreaterThanOrEqual(times[i - 1]?.start ?? 0)
  })
})

describe('explainer helpers', () => {
  it('reads the syllabus units from a level', async () => {
    const { unitsFor } = await import('../../src/renderer/features/explainer/names')
    expect(unitsFor('Units 3 and 4')).toEqual([3, 4])
    expect(unitsFor('Units 1 and 2')).toEqual([1, 2])
    expect(unitsFor('Beyond the syllabus')).toEqual([])
  })

  it('writes a lesson prompt that knows every icon and the options', async () => {
    const { lessonSystemPrompt } = await import('../../src/main/ai/prompts/lesson')
    const prompt = lessonSystemPrompt({
      subject: 'Chemistry',
      level: 'Units 3 and 4',
      style: 'fun',
      exam: true,
    })
    expect(prompt).toContain('atlas-lesson')
    expect(prompt).toContain('flask')
    expect(prompt).toContain('Exam mode')
    expect(prompt).toContain('playful')
  })
})

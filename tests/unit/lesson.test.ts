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

describe('subtitleAt', () => {
  it('shows a short line that moves through the narration', async () => {
    const { subtitleAt } = await import('../../src/shared/lesson')
    const say =
      'First we differentiate the function. Setting the derivative to zero gives the stationary points, which we then substitute back in.'
    expect(subtitleAt(say, 0, 10)).toBe('First we differentiate the function.')
    expect(subtitleAt(say, 9.3, 10)).toMatch(/substitute back in\.$/)
    expect(subtitleAt('', 1, 5)).toBe('')
  })
})

describe('LabelPlacer', () => {
  it('moves a label that would sit on another one', async () => {
    const { LabelPlacer, overlap } = await import('../../src/shared/label-layout')
    const placer = new LabelPlacer({ x: 0, y: 0, w: 1600, h: 900 })
    const a = placer.place(400, 400, '(1, -1)', 26)
    const b = placer.place(400, 400, '(1, 2)', 26)
    expect(overlap(a.box, b.box)).toBe(0)
    expect(a.x).toBe(400)
  })

  it('keeps labels off reserved space and away from curve points', async () => {
    const { LabelPlacer, overlap } = await import('../../src/shared/label-layout')
    const placer = new LabelPlacer({ x: 0, y: 0, w: 1600, h: 900 })
    const column = { x: 0, y: 0, w: 800, h: 900 }
    placer.reserve(column)
    const pts: [number, number][] = Array.from({ length: 50 }, (_, i) => [820 + i * 4, 400])
    placer.avoidPoints(pts)
    const spot = placer.place(780, 410, 'y = x^2', 26)
    expect(overlap(spot.box, column)).toBe(0)
    expect(
      pts.some(
        ([x, y]) =>
          x > spot.box.x &&
          x < spot.box.x + spot.box.w &&
          y > spot.box.y &&
          y < spot.box.y + spot.box.h,
      ),
    ).toBe(false)
  })
})

describe('auditLesson', () => {
  const wrap = (lesson: unknown) => '```atlas-lesson\n' + JSON.stringify(lesson) + '\n```'

  it('finds boxes on top of each other and words too long for their box', async () => {
    const { auditLesson } = await import('../../src/shared/lesson-audit')
    const lesson = parseLesson(
      wrap({
        title: 'Galvanic cell',
        scenes: [
          {
            say: 'Two half cells.',
            items: [
              { t: 'box', at: [30, 50], w: 26, h: 12, text: 'Anode' },
              { t: 'box', at: [34, 52], w: 26, h: 12, text: 'Cathode' },
              { t: 'box', at: [80, 20], w: 8, h: 6, text: 'Oxidation happens at the anode' },
            ],
          },
        ],
      }),
    )
    expect(lesson).not.toBeNull()
    const issues = auditLesson(lesson as NonNullable<typeof lesson>)
    expect(issues.some((i) => i.includes('overlaps'))).toBe(true)
    expect(issues.some((i) => i.includes('do not fit'))).toBe(true)
  })

  it('passes a clean board', async () => {
    const { auditLesson } = await import('../../src/shared/lesson-audit')
    const lesson = parseLesson(
      wrap({
        title: 'Flow',
        scenes: [
          {
            say: 'Light goes in.',
            items: [
              { t: 'box', at: [25, 50], w: 26, h: 12, text: 'Light' },
              { t: 'box', at: [75, 50], w: 26, h: 12, text: 'Glucose' },
              { t: 'arrow', from: [38, 50], to: [62, 50] },
            ],
          },
        ],
      }),
    )
    expect(auditLesson(lesson as NonNullable<typeof lesson>)).toEqual([])
  })
})

describe('3D models and quick checks', () => {
  it('compiles formulas in several variables', async () => {
    const { compileExpression } = await import('../../src/shared/whiteboard')
    const f = compileExpression('x^2 - y^2', ['x', 'y'])
    expect(f?.([3, 1])).toBe(8)
    expect(compileExpression('2xy', ['x', 'y'])?.([2, 3])).toBe(12)
    expect(compileExpression('z = 3 - x - y', ['x', 'y'])?.([1, 1])).toBe(1)
    expect(compileExpression('foo(x)', ['x'])).toBeNull()
  })

  it('reads a model and a check, dropping broken parts', () => {
    const lesson = parseLesson(
      '```atlas-lesson\n' +
        JSON.stringify({
          title: 'Water',
          scenes: [
            {
              say: 'A water molecule.',
              model: {
                objects: [
                  { k: 'molecule', atoms: [{ el: 'O', at: [0, 0, 0] }], bonds: [] },
                  { k: 'nonsense' },
                ],
              },
              check: {
                q: 'Bent or linear?',
                options: ['Bent', 'Linear'],
                answer: 9,
                why: 'Lone pairs.',
              },
            },
          ],
        }) +
        '\n```',
    )
    const scene = lesson?.scenes[0]
    expect(scene?.model?.objects).toHaveLength(1)
    expect(scene?.check?.answer).toBe(1)
  })
})

describe('reading lessons leniently', () => {
  const body = '{"title":"T","subject":"S","theme":"board","scenes":[{"say":"Hi","items":[]}]}'
  it('reads a lesson with an unusual fence label and words after it', () => {
    expect(parseLesson('Sure!\n```atlas\n' + body + '\n```\nHope that helps.')?.title).toBe('T')
  })
  it('reads a bare lesson followed by words', () => {
    expect(parseLesson(body + '\n\nLet me know if you want more.')?.title).toBe('T')
  })
})

import { describe, expect, it } from 'vitest'
import {
  compileFormula,
  expandOp,
  parseBoard,
  parseBoardPartial,
} from '../../src/shared/whiteboard'

describe('compileFormula', () => {
  it('evaluates common graphs', () => {
    expect(compileFormula('sin(x)')?.(Math.PI / 2)).toBeCloseTo(1)
    expect(compileFormula('y = 2x^2 - 3')?.(2)).toBeCloseTo(5)
    expect(compileFormula('3cos x')?.(0)).toBeCloseTo(3)
    expect(compileFormula('(x+1)(x-1)')?.(3)).toBeCloseTo(8)
    expect(compileFormula('-x^2')?.(3)).toBeCloseTo(-9)
    expect(compileFormula('2pi')?.(0)).toBeCloseTo(2 * Math.PI)
  })
  it('rejects anything that is not maths', () => {
    expect(compileFormula('alert(1)')).toBeNull()
    expect(compileFormula('process.exit()')).toBeNull()
    expect(compileFormula('sin(')).toBeNull()
  })
})

describe('parseBoard', () => {
  it('keeps good drawing commands and drops broken ones', () => {
    const board = parseBoard(
      JSON.stringify({
        title: 'Pythagoras',
        steps: [
          {
            say: 'Draw a right triangle.',
            draw: [
              {
                t: 'poly',
                points: [
                  [100, 500],
                  [400, 500],
                  [100, 200],
                ],
                close: true,
              },
              { t: 'nonsense' },
              { t: 'text', x: 240, y: 540, text: 'a', color: 'blue' },
            ],
          },
        ],
      }),
    )
    expect(board?.steps[0]?.draw.map((d) => d.t)).toEqual(['poly', 'text'])
  })
  it('returns null for text that is not a board', () => {
    expect(parseBoard('not json')).toBeNull()
    expect(parseBoard('{"steps": []}')).toBeNull()
  })
})

describe('shapes', () => {
  it('a nearly square rect becomes a square', () => {
    const [op] = expandOp({ t: 'rect', x: 0, y: 0, w: 200, h: 186 })
    expect(op?.t === 'rect' && op.w === op.h).toBe(true)
  })

  it('triangle side labels sit outside the triangle', () => {
    const ops = expandOp({
      t: 'triangle',
      points: [
        [200, 450],
        [440, 450],
        [200, 270],
      ],
      sides: ['a', 'c', 'b'],
      right: 0,
    })
    const label = (name: string) => ops.find((o) => o.t === 'text' && o.text === name)
    const a = label('a')
    const b = label('b')
    const c = label('c')
    // a is under the base, b left of the upright side, c beyond the hypotenuse.
    expect(a && a.t === 'text' && a.y > 450).toBe(true)
    expect(b && b.t === 'text' && b.x < 200).toBe(true)
    // The hypotenuse runs from (440,450) to (200,270); outside means x/240 + (450-y)/180 > 1 side.
    expect(c && c.t === 'text' && (c.x - 200) / 240 + (450 - c.y) / 180 > 1).toBe(true)
    // The right-angle mark is a small open poly at the corner.
    const mark = ops.find((o) => o.t === 'poly' && !o.close)
    expect(mark?.t === 'poly' && mark.points.every(([x, y]) => x >= 200 && y <= 450)).toBe(true)
  })

  it('squareOn builds outward, away from the given point', () => {
    const [sq] = expandOp({ t: 'squareOn', from: [200, 450], to: [440, 450], away: [200, 270] })
    expect(sq?.t === 'poly' && sq.points.every(([, y]) => y >= 450)).toBe(true)
  })
})

describe('parseBoardPartial', () => {
  it('reads the steps finished so far', () => {
    const full = JSON.stringify({
      title: 'T',
      steps: [
        { say: 'one', draw: [{ t: 'dot', x: 1, y: 1 }] },
        { say: 'two "quoted" }', draw: [] },
        { say: 'three', draw: [] },
      ],
    })
    const cut = full.slice(0, full.indexOf('three') - 5)
    expect(parseBoardPartial(cut)?.steps.map((s) => s.say)).toEqual(['one', 'two "quoted" }'])
    expect(parseBoardPartial(full.slice(0, 20))).toBeNull()
    expect(parseBoardPartial(full)?.steps).toHaveLength(3)
  })
})

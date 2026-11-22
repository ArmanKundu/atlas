import { describe, expect, it } from 'vitest'
import { compileFormula, parseBoard } from '../../src/shared/whiteboard'

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

import type { Lesson } from '@shared/lesson'
import { parseLesson } from '@shared/lesson'

/** Example lessons for the design system and the empty Explainer page. */
const AREA = {
  title: 'Area between two curves',
  subject: 'Mathematical Methods',
  theme: 'board',
  scenes: [
    {
      title: 'Area between two curves',
      say: 'We want the area enclosed between y equals x squared minus two x, and y equals four minus x squared.',
      graph: { x: [-2.5, 3.5], y: [-2, 5], equal: false },
      items: [
        { t: 'text', text: 'Two curves:' },
        { t: 'math', tex: 'y = x^2 - 2x', c: 'blue' },
        { t: 'curve', id: 'f', fn: 'x^2 - 2x', c: 'blue', label: 'y = x² − 2x' },
        { t: 'math', tex: 'y = 4 - x^2', c: 'yellow' },
        { t: 'curve', id: 'g', fn: '4 - x^2', c: 'yellow', label: 'y = 4 − x²' },
      ],
    },
    {
      say: 'First, find where they meet. Set them equal: two x squared minus two x minus four is zero, so x is minus one or two.',
      items: [
        { t: 'math', tex: 'x^2 - 2x = 4 - x^2', c: 'ink' },
        { t: 'math', tex: '2(x+1)(x-2) = 0', c: 'ink' },
        { t: 'meet', of: ['f', 'g'], c: 'red' },
      ],
    },
    {
      say: 'Between those points the yellow curve is on top. So the height of each thin strip is top minus bottom, and we add up the strips with an integral.',
      items: [
        { t: 'area', between: ['g', 'f'], from: -1, to: 2, c: 'green', label: 'A' },
        {
          t: 'math',
          tex: 'A = \\int_{-1}^{2} \\big[(4 - x^2) - (x^2 - 2x)\\big]\\,dx',
          c: 'green',
        },
        { t: 'math', tex: '= \\left[4x - \\tfrac{2}{3}x^3 + x^2\\right]_{-1}^{2} = 9', c: 'green' },
      ],
    },
  ],
}

const SODIUM = {
  title: 'Why sodium reacts so easily',
  subject: 'Chemistry',
  theme: 'night',
  scenes: [
    {
      title: 'Sodium: 2, 8, 1',
      clear: true,
      say: 'Sodium has eleven electrons, arranged two, eight, one. That single outer electron is far from the nucleus and easy to lose.',
      items: [
        { t: 'atom', at: [32, 50], symbol: 'Na', shells: [2, 8, 1], size: 50, c: 'orange' },
        { t: 'arrow', from: [62, 78], to: [52, 66], c: 'yellow', label: 'one outer electron' },
        { t: 'box', at: [80, 40], w: 32, h: 16, text: 'Loses 1 e⁻ → Na⁺', c: 'teal' },
        { t: 'label', at: [80, 20], tex: '\\ce{Na -> Na+ + e-}', c: 'ink' },
      ],
    },
  ],
}

const PLANE = {
  title: 'A plane and its normal',
  subject: 'Specialist Mathematics',
  theme: 'board',
  scenes: [
    {
      title: 'A plane and its normal',
      say: 'Here is the plane x plus y plus z equals three. Drag the picture to turn it around and see it from any side.',
      model: {
        camera: [7, -8, 5],
        objects: [
          { k: 'axes', size: 4 },
          {
            k: 'surface',
            fn: '3 - x - y',
            x: [-1, 3],
            y: [-1, 3],
            c: 'teal',
            opacity: 0.75,
            label: 'x + y + z = 3',
          },
        ],
      },
      items: [
        { t: 'text', text: 'The plane:' },
        { t: 'math', tex: 'x + y + z = 3', c: 'teal' },
      ],
    },
    {
      say: 'The numbers in front of x, y and z give a vector that sticks straight out of the plane. We call it the normal.',
      model: {
        camera: [7, -8, 5],
        objects: [
          { k: 'axes', size: 4 },
          { k: 'surface', fn: '3 - x - y', x: [-1, 3], y: [-1, 3], c: 'teal', opacity: 0.75 },
          { k: 'sphere', at: [1, 1, 1], r: 0.12, c: 'yellow', label: 'P(1, 1, 1)' },
          { k: 'arrow', from: [1, 1, 1], to: [2.2, 2.2, 2.2], c: 'red', label: 'n = (1, 1, 1)' },
        ],
      },
      items: [{ t: 'math', tex: '\\vec n = \\begin{pmatrix}1\\\\1\\\\1\\end{pmatrix}', c: 'red' }],
      check: {
        q: 'What is a normal to the plane 2x − y + 5z = 7?',
        options: ['(2, −1, 5)', '(2, 1, 5)', '(7, 7, 7)'],
        answer: 0,
        why: 'Read the coefficients of x, y and z, signs included.',
      },
    },
    {
      say: 'So any plane a x plus b y plus c z equals d has normal a, b, c. That is the key idea.',
      items: [{ t: 'math', tex: 'ax + by + cz = d \\Rightarrow \\vec n = (a, b, c)', c: 'yellow' }],
    },
  ],
}

export const SAMPLE_LESSONS: Lesson[] = [AREA, PLANE, SODIUM]
  .map((raw) => parseLesson(JSON.stringify(raw)))
  .filter((l): l is Lesson => l !== null)

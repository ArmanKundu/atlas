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

/** An exam walkthrough: the question pinned on top, a chapter per part, key results. */
const WALK = {
  title: 'Walkthrough: water in a tank',
  subject: 'Mathematical Methods',
  theme: 'paper',
  question:
    'Water drains from a tank. The volume V(t) litres after t minutes is given at t = 0, 2, 5 and 8: 80, 68, 50 and 38. (a) Estimate V′(3.5). (b) Use a left sum to estimate the total of V over 0 ≤ t ≤ 8.',
  scenes: [
    {
      chapter: 'Understanding the question',
      title: 'What is going on?',
      say: 'A tank is draining. V of t is how much water is left, in litres, after t minutes. We are given four readings.',
      graph: { x: [0, 9], y: [0, 90], xlabel: 't (min)', ylabel: 'V (L)' },
      items: [
        { t: 'text', text: 'V(t) = litres left', c: 'yellow' },
        { t: 'text', text: 't = minutes', c: 'blue' },
      ],
    },
    {
      say: 'Let us plot the readings. Each one is a dot: time across, water up.',
      items: [
        { t: 'point', at: [0, 80], label: '80', c: 'yellow' },
        { t: 'point', at: [2, 68], label: '68', c: 'yellow' },
        { t: 'point', at: [5, 50], label: '50', c: 'yellow' },
        { t: 'point', at: [8, 38], label: '38', c: 'yellow' },
      ],
    },
    {
      chapter: 'Part (a)',
      title: 'Estimate the rate at t = 3.5',
      clear: true,
      say: 'Part a wants the rate the water is leaving at three and a half minutes. Three and a half sits between two and five, so use those two readings.',
      graph: { x: [0, 9], y: [0, 90], xlabel: 't (min)', ylabel: 'V (L)' },
      items: [
        { t: 'point', at: [2, 68], c: 'yellow' },
        { t: 'point', at: [5, 50], c: 'yellow' },
        { t: 'line', from: [2, 68], to: [5, 50], c: 'red', label: 'slope' },
      ],
    },
    {
      say: 'The rate is change in water over change in time: fifty minus sixty eight, over five minus two. That is minus six litres per minute.',
      key: "V'(3.5) \\approx -6 \\text{ L/min}",
      items: [
        { t: 'math', tex: "V'(3.5) \\approx \\frac{50 - 68}{5 - 2}", c: 'red' },
        { t: 'math', tex: '= -6 \\text{ L/min}', c: 'red' },
      ],
    },
    {
      chapter: 'Part (b)',
      title: 'A left sum',
      clear: true,
      say: 'Part b. A left sum uses the height at the left of each gap, times the width of the gap.',
      graph: { x: [0, 9], y: [0, 90], xlabel: 't (min)', ylabel: 'V (L)' },
      items: [
        {
          t: 'poly',
          points: [
            [0, 0],
            [0, 80],
            [2, 80],
            [2, 0],
          ],
          fill: 'yellow',
          c: 'yellow',
        },
        {
          t: 'poly',
          points: [
            [2, 0],
            [2, 68],
            [5, 68],
            [5, 0],
          ],
          fill: 'yellow',
          c: 'yellow',
        },
        {
          t: 'poly',
          points: [
            [5, 0],
            [5, 50],
            [8, 50],
            [8, 0],
          ],
          fill: 'yellow',
          c: 'yellow',
        },
      ],
    },
    {
      say: 'Eighty times two, plus sixty eight times three, plus fifty times three. That gives five hundred and fourteen.',
      key: '80(2) + 68(3) + 50(3) = 514',
      items: [
        { t: 'math', tex: '80 \\times 2 + 68 \\times 3 + 50 \\times 3', c: 'yellow' },
        { t: 'math', tex: '= 514', c: 'green' },
      ],
    },
  ],
}

export const SAMPLE_LESSONS: Lesson[] = [AREA, PLANE, SODIUM, WALK]
  .map((raw) => parseLesson(JSON.stringify(raw)))
  .filter((l): l is Lesson => l !== null)

/** A sample board for the design system page: graphs of sin, cos and tan. */
export const SAMPLE_BOARD = JSON.stringify({
  title: 'Graphing sin, cos and tan',
  steps: [
    {
      say: 'Start with axes from minus two pi to two pi, and from minus two to two.',
      draw: [
        {
          t: 'axes',
          x: 60,
          y: 70,
          w: 880,
          h: 480,
          xmin: -6.3,
          xmax: 6.3,
          ymin: -2,
          ymax: 2,
          xlabel: 'x',
          ylabel: 'y',
        },
      ],
    },
    {
      say: 'Sine starts at zero, rises to one at a half pi, and repeats every two pi.',
      draw: [{ t: 'curve', fn: 'sin(x)', color: 'blue', tool: 'marker', label: 'sin x' }],
    },
    {
      say: 'Cosine is the same wave shifted left by a half pi, so it starts at one.',
      draw: [{ t: 'curve', fn: 'cos(x)', color: 'red', tool: 'marker', label: 'cos x' }],
    },
    {
      say: 'Tangent is sine over cosine. It shoots off to infinity wherever cosine is zero.',
      draw: [
        { t: 'curve', fn: 'tan(x)', color: 'green', tool: 'marker' },
        { t: 'text', x: 700, y: 110, text: 'tan x = sin x / cos x', size: 30, color: 'green' },
        { t: 'highlight', x: 690, y: 80, w: 250, h: 42, color: 'orange' },
      ],
    },
  ],
})

/** Pythagoras with the shape commands: Atlas works out the squares and label positions. */
export const PYTHAGORAS_BOARD = JSON.stringify({
  title: "Pythagoras' theorem",
  steps: [
    {
      say: 'Start with a right-angled triangle.',
      draw: [
        {
          t: 'triangle',
          points: [
            [300, 380],
            [500, 380],
            [300, 230],
          ],
          right: 0,
        },
      ],
    },
    {
      say: 'The shorter sides are a and b. The longest side is the hypotenuse c.',
      draw: [
        { t: 'label', from: [300, 380], to: [500, 380], away: [400, 520], text: 'a' },
        { t: 'label', from: [300, 230], to: [300, 380], away: [160, 300], text: 'b' },
        {
          t: 'label',
          from: [500, 380],
          to: [300, 230],
          away: [520, 200],
          text: 'c',
          at: 0.62,
          color: 'red',
        },
      ],
    },
    {
      say: 'Build a square on each side.',
      draw: [
        {
          t: 'squareOn',
          from: [300, 380],
          to: [500, 380],
          away: [300, 230],
          label: 'a²',
          color: 'blue',
        },
        {
          t: 'squareOn',
          from: [300, 230],
          to: [300, 380],
          away: [500, 380],
          label: 'b²',
          color: 'green',
        },
        {
          t: 'squareOn',
          from: [500, 380],
          to: [300, 230],
          away: [300, 380],
          label: 'c²',
          color: 'red',
        },
      ],
    },
    {
      say: 'The two smaller squares add up to the big one.',
      draw: [
        { t: 'text', x: 830, y: 470, text: 'a² + b² = c²', size: 44, align: 'center' },
        { t: 'highlight', x: 700, y: 430, w: 260, h: 56 },
      ],
    },
  ],
})

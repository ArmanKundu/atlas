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

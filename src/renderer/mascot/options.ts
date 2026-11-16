export type MascotMood = 'idle' | 'thinking' | 'happy' | 'celebrating' | 'sleepy' | 'concerned'

export const MASCOT_MOODS: readonly MascotMood[] = [
  'idle',
  'thinking',
  'happy',
  'celebrating',
  'sleepy',
  'concerned',
]

export type MascotAccessory = 'none' | 'glasses' | 'cap' | 'bow'

export const MASCOT_ACCESSORIES: readonly { id: MascotAccessory; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'glasses', label: 'Glasses' },
  { id: 'cap', label: 'Graduation cap' },
  { id: 'bow', label: 'Bow' },
]

export type MascotColour = 'ink' | 'coral' | 'amber' | 'green' | 'blue' | 'purple' | 'pink'

interface MascotPalette {
  label: string
  body: string
  eye: string
  pupil: string
}

/**
 * `ink` is the default: black on light grey like the icon, and its negative in the dark theme.
 * The colours keep white eyes and dark pupils in both themes.
 */
export const MASCOT_COLOURS: Record<MascotColour, MascotPalette> = {
  ink: {
    label: 'Ink',
    body: 'var(--atlas-mascot-body)',
    eye: 'var(--atlas-mascot-eye)',
    pupil: 'var(--atlas-mascot-pupil)',
  },
  coral: { label: 'Coral', body: '#df6f5e', eye: '#ffffff', pupil: '#1c1c1c' },
  amber: { label: 'Amber', body: '#dd9d38', eye: '#ffffff', pupil: '#1c1c1c' },
  green: { label: 'Green', body: '#56a06a', eye: '#ffffff', pupil: '#1c1c1c' },
  blue: { label: 'Blue', body: '#4b8cd9', eye: '#ffffff', pupil: '#1c1c1c' },
  purple: { label: 'Purple', body: '#8c6cd3', eye: '#ffffff', pupil: '#1c1c1c' },
  pink: { label: 'Pink', body: '#d6699c', eye: '#ffffff', pupil: '#1c1c1c' },
}

export const MASCOT_COLOUR_IDS = Object.keys(MASCOT_COLOURS) as MascotColour[]

import type { SUBJECT_COLOURS } from './models'

/**
 * The six subjects the group studies. Atlas offers only these, each with Units 1 to 4, so every
 * shared resource files into the same place for everyone.
 */
export interface GroupSubject {
  key: 'english' | 'methods' | 'general' | 'chemistry' | 'biology' | 'accounting'
  name: string
  code: string
  kind: 'essay' | 'maths' | 'science' | 'accounting'
  colour: (typeof SUBJECT_COLOURS)[number]
  /** Other names people use, matched without case. */
  aliases: string[]
}

export const GROUP_SUBJECTS: GroupSubject[] = [
  {
    key: 'english',
    name: 'English',
    code: 'EN',
    kind: 'essay',
    colour: 'red',
    aliases: ['english mainstream', 'eng'],
  },
  {
    key: 'methods',
    name: 'Mathematical Methods',
    code: 'MM',
    kind: 'maths',
    colour: 'orange',
    aliases: ['maths methods', 'math methods', 'methods'],
  },
  {
    key: 'general',
    name: 'General Mathematics',
    code: 'GM',
    kind: 'maths',
    colour: 'yellow',
    aliases: ['general maths', 'general math', 'further mathematics', 'further maths'],
  },
  {
    key: 'chemistry',
    name: 'Chemistry',
    code: 'CHEM',
    kind: 'science',
    colour: 'teal',
    aliases: ['chem'],
  },
  {
    key: 'biology',
    name: 'Biology',
    code: 'BIO',
    kind: 'science',
    colour: 'green',
    aliases: ['bio'],
  },
  {
    key: 'accounting',
    name: 'Accounting',
    code: 'ACC',
    kind: 'accounting',
    colour: 'blue',
    aliases: ['acc'],
  },
]

export const UNITS = [1, 2, 3, 4] as const
export type Unit = (typeof UNITS)[number]

/** The group subject a name or code refers to, if any. */
export function groupSubjectFor(name: string, code?: string | null): GroupSubject | null {
  const n = name.trim().toLowerCase()
  const c = (code ?? '').trim().toLowerCase()
  return (
    GROUP_SUBJECTS.find(
      (g) =>
        g.name.toLowerCase() === n ||
        g.aliases.includes(n) ||
        (c !== '' && g.code.toLowerCase() === c),
    ) ?? null
  )
}

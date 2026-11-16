import type { StudySystem } from './models'

type Kind = 'science' | 'maths' | 'essay' | 'accounting' | 'language' | 'other'

export interface SystemPreset {
  label: string
  /** What an in-school assessed task is called. */
  assessment: string
  /** What the overall result is called, or null when there is none. */
  overall: string | null
  overallHint: string
  yearLevels: string[]
  /** Suggested subject names only. Presets ship no content. */
  subjects: { name: string; code?: string; kind: Kind }[]
}

const s = (
  name: string,
  kind: Kind,
  code?: string,
): { name: string; code?: string; kind: Kind } => ({ name, kind, code })

export const SYSTEM_PRESETS: Record<StudySystem, SystemPreset> = {
  vce: {
    label: 'VCE',
    assessment: 'SAC',
    overall: 'ATAR',
    overallHint: 'e.g. 90.00',
    yearLevels: ['Year 10', 'Year 11', 'Year 12'],
    subjects: [
      s('English', 'essay', 'EN'),
      s('English Language', 'essay', 'EL'),
      s('Literature', 'essay', 'LIT'),
      s('Mathematical Methods', 'maths', 'MM'),
      s('Specialist Mathematics', 'maths', 'SM'),
      s('General Mathematics', 'maths', 'GM'),
      s('Biology', 'science', 'BIO'),
      s('Chemistry', 'science', 'CHEM'),
      s('Physics', 'science', 'PHYS'),
      s('Psychology', 'science', 'PSY'),
      s('Accounting', 'accounting', 'ACC'),
      s('Economics', 'essay', 'ECO'),
      s('Business Management', 'essay', 'BM'),
      s('Legal Studies', 'essay', 'LS'),
      s('History', 'essay', 'HIS'),
      s('Health and Human Development', 'essay', 'HHD'),
      s('Physical Education', 'science', 'PE'),
      s('Software Development', 'other', 'SD'),
      s('Japanese', 'language'),
      s('French', 'language'),
      s('Chinese', 'language'),
    ],
  },
  hsc: {
    label: 'HSC',
    assessment: 'Assessment task',
    overall: 'ATAR',
    overallHint: 'e.g. 90.00',
    yearLevels: ['Year 10', 'Year 11', 'Year 12'],
    subjects: [
      s('English Advanced', 'essay'),
      s('English Standard', 'essay'),
      s('Mathematics Advanced', 'maths'),
      s('Mathematics Extension 1', 'maths'),
      s('Mathematics Extension 2', 'maths'),
      s('Mathematics Standard', 'maths'),
      s('Biology', 'science'),
      s('Chemistry', 'science'),
      s('Physics', 'science'),
      s('Economics', 'essay'),
      s('Business Studies', 'essay'),
      s('Legal Studies', 'essay'),
      s('Modern History', 'essay'),
      s('Ancient History', 'essay'),
      s('PDHPE', 'science'),
      s('Software Engineering', 'other'),
    ],
  },
  ib: {
    label: 'IB Diploma',
    assessment: 'Internal assessment',
    overall: 'IB points',
    overallHint: 'out of 45',
    yearLevels: ['DP Year 1', 'DP Year 2'],
    subjects: [
      s('English A: Language and Literature', 'essay'),
      s('English A: Literature', 'essay'),
      s('Mathematics: Analysis and Approaches', 'maths'),
      s('Mathematics: Applications and Interpretation', 'maths'),
      s('Biology', 'science'),
      s('Chemistry', 'science'),
      s('Physics', 'science'),
      s('Economics', 'essay'),
      s('Business Management', 'essay'),
      s('History', 'essay'),
      s('Psychology', 'science'),
      s('Computer Science', 'other'),
      s('Theory of Knowledge', 'essay'),
      s('Spanish B', 'language'),
      s('French B', 'language'),
    ],
  },
  'a-levels': {
    label: 'A-levels',
    assessment: 'Coursework',
    overall: 'Grades',
    overallHint: 'e.g. A*AA',
    yearLevels: ['Year 12', 'Year 13'],
    subjects: [
      s('Mathematics', 'maths'),
      s('Further Mathematics', 'maths'),
      s('Biology', 'science'),
      s('Chemistry', 'science'),
      s('Physics', 'science'),
      s('English Literature', 'essay'),
      s('History', 'essay'),
      s('Economics', 'essay'),
      s('Psychology', 'science'),
      s('Computer Science', 'other'),
      s('Geography', 'essay'),
      s('Business', 'essay'),
      s('French', 'language'),
      s('Spanish', 'language'),
    ],
  },
  ap: {
    label: 'AP',
    assessment: 'Test',
    overall: 'GPA',
    overallHint: 'e.g. 3.9',
    yearLevels: ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'],
    subjects: [
      s('AP Calculus AB', 'maths'),
      s('AP Calculus BC', 'maths'),
      s('AP Statistics', 'maths'),
      s('AP Biology', 'science'),
      s('AP Chemistry', 'science'),
      s('AP Physics 1', 'science'),
      s('AP Physics C', 'science'),
      s('AP English Language', 'essay'),
      s('AP English Literature', 'essay'),
      s('AP US History', 'essay'),
      s('AP World History', 'essay'),
      s('AP Psychology', 'science'),
      s('AP Computer Science A', 'other'),
      s('AP Macroeconomics', 'essay'),
      s('AP Microeconomics', 'essay'),
    ],
  },
  university: {
    label: 'University',
    assessment: 'Assignment',
    overall: 'GPA or WAM',
    overallHint: 'e.g. 6.5 or 80',
    yearLevels: ['First year', 'Second year', 'Third year', 'Fourth year', 'Postgraduate'],
    subjects: [],
  },
  other: {
    label: 'Other or self-study',
    assessment: 'Assessment',
    overall: null,
    overallHint: '',
    yearLevels: [],
    subjects: [],
  },
}

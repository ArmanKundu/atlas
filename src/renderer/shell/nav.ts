import {
  CalendarDays,
  FileText,
  GraduationCap,
  House,
  Layers,
  ListChecks,
  Library,
  MessageCircle,
  NotebookPen,
  Settings,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Extra words the command palette matches on. */
  keywords: string[]
}

export const NAV_TODAY: NavItem = {
  to: '/',
  label: 'Today',
  icon: House,
  keywords: ['home', 'dashboard', 'study next'],
}

/** The main places, shown at full strength in the sidebar. */
export const NAV_PRIMARY: NavItem[] = [
  {
    to: '/exam',
    label: 'Exam',
    icon: GraduationCap,
    keywords: ['past papers', 'vcaa', 'examiner report', 'sit', 'practice', 'find a question'],
  },
  {
    to: '/assistant',
    label: 'Assistant',
    icon: MessageCircle,
    keywords: ['chat', 'ai', 'ask', 'tutor', 'bot', 'helper'],
  },
  {
    to: '/library',
    label: 'Library',
    icon: Library,
    keywords: ['resources', 'import', 'files', 'pdf', 'papers'],
  },
  {
    to: '/shared',
    label: 'Shared',
    icon: Users,
    keywords: ['community', 'friends', 'share', 'remix', 'public library', 'group', 'studocu'],
  },
  {
    to: '/planner',
    label: 'Planner',
    icon: CalendarDays,
    keywords: ['calendar', 'week', 'schedule', 'to-do', 'compass'],
  },
]

/** Study tools, shown in a quieter second group. */
export const NAV_SECONDARY: NavItem[] = [
  {
    to: '/questions',
    label: 'Questions',
    icon: ListChecks,
    keywords: ['practice', 'past papers', 'mistakes', 'marking', 'question bank'],
  },
  { to: '/notes', label: 'Notes', icon: NotebookPen, keywords: ['write', 'markdown', 'summary'] },
  {
    to: '/flashcards',
    label: 'Flashcards',
    icon: Layers,
    keywords: ['cards', 'review', 'spaced repetition'],
  },
  {
    to: '/timer',
    label: 'Timer',
    icon: Timer,
    keywords: ['focus', 'pomodoro', 'stopwatch', 'stats'],
  },
]

/** Places reached from inside another page (Exam builder lives in Exam); still in the palette. */
export const NAV_NESTED: NavItem[] = [
  {
    to: '/exam-builder',
    label: 'Exam builder',
    icon: FileText,
    keywords: ['practice exam', 'paper', 'generate'],
  },
]

export const NAV_TOOLS: NavItem[] = [...NAV_PRIMARY, ...NAV_SECONDARY, ...NAV_NESTED]

export const NAV_SETTINGS: NavItem = {
  to: '/settings',
  label: 'Settings',
  icon: Settings,
  keywords: ['preferences', 'theme', 'about', 'profile', 'backup'],
}

export const NAV_ALL: NavItem[] = [NAV_TODAY, ...NAV_TOOLS, NAV_SETTINGS]

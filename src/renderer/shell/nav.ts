import {
  CalendarDays,
  FileText,
  Layers,
  Library,
  MessageCircle,
  NotebookPen,
  Settings,
  Sun,
  Timer,
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
  icon: Sun,
  keywords: ['home', 'dashboard', 'study next'],
}

export const NAV_TOOLS: NavItem[] = [
  {
    to: '/assistant',
    label: 'Assistant',
    icon: MessageCircle,
    keywords: ['chat', 'ai', 'ask', 'tutor', 'bot'],
  },
  {
    to: '/library',
    label: 'Library',
    icon: Library,
    keywords: ['resources', 'import', 'files', 'pdf'],
  },
  { to: '/notes', label: 'Notes', icon: NotebookPen, keywords: ['write', 'markdown', 'summary'] },
  {
    to: '/flashcards',
    label: 'Flashcards',
    icon: Layers,
    keywords: ['cards', 'review', 'spaced repetition'],
  },
  {
    to: '/planner',
    label: 'Planner',
    icon: CalendarDays,
    keywords: ['calendar', 'week', 'schedule', 'to-do'],
  },
  {
    to: '/timer',
    label: 'Timer',
    icon: Timer,
    keywords: ['focus', 'pomodoro', 'stopwatch', 'stats'],
  },
  {
    to: '/exam-builder',
    label: 'Exam builder',
    icon: FileText,
    keywords: ['practice exam', 'paper', 'generate'],
  },
]

export const NAV_SETTINGS: NavItem = {
  to: '/settings',
  label: 'Settings',
  icon: Settings,
  keywords: ['preferences', 'theme', 'about', 'profile', 'backup'],
}

export const NAV_ALL: NavItem[] = [NAV_TODAY, ...NAV_TOOLS, NAV_SETTINGS]

import { FileText, Library, Settings, Sun, Timer, type LucideIcon } from 'lucide-react'

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
    to: '/exam-builder',
    label: 'Exam builder',
    icon: FileText,
    keywords: ['practice exam', 'paper', 'generate'],
  },
  { to: '/timer', label: 'Timer', icon: Timer, keywords: ['focus', 'pomodoro', 'stopwatch'] },
  { to: '/library', label: 'Library', icon: Library, keywords: ['resources', 'packs', 'files'] },
]

export const NAV_SETTINGS: NavItem = {
  to: '/settings',
  label: 'Settings',
  icon: Settings,
  keywords: ['preferences', 'theme', 'about'],
}

export const NAV_ALL: NavItem[] = [NAV_TODAY, ...NAV_TOOLS, NAV_SETTINGS]

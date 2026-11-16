import {
  Award,
  CalendarRange,
  CheckCheck,
  CircleHelp,
  GraduationCap,
  Layers,
  ListOrdered,
  MessageCircleQuestion,
  NotebookPen,
  ScrollText,
  SearchCheck,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  'graduation-cap': GraduationCap,
  'list-ordered': ListOrdered,
  award: Award,
  'check-check': CheckCheck,
  'search-check': SearchCheck,
  'notebook-pen': NotebookPen,
  layers: Layers,
  'circle-help': CircleHelp,
  'scroll-text': ScrollText,
  'calendar-range': CalendarRange,
  'message-circle-question': MessageCircleQuestion,
}

export function agentIcon(name: string): LucideIcon {
  return ICONS[name] ?? GraduationCap
}

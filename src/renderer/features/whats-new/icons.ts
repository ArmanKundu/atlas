import {
  BookOpen,
  CalendarDays,
  Download,
  GraduationCap,
  KeyRound,
  Mail,
  Sparkles,
  ThumbsUp,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  'calendar-days': CalendarDays,
  download: Download,
  'graduation-cap': GraduationCap,
  'key-round': KeyRound,
  mail: Mail,
  sparkles: Sparkles,
  'thumbs-up': ThumbsUp,
  upload: Upload,
  users: Users,
}

export function changeIcon(name: string): LucideIcon {
  return ICONS[name] ?? Sparkles
}

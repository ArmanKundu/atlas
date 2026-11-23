import {
  BookOpen,
  CalendarDays,
  Clapperboard,
  Cpu,
  Download,
  GraduationCap,
  KeyRound,
  LifeBuoy,
  Mail,
  MessageCircle,
  Presentation,
  ScanLine,
  Sparkles,
  ThumbsUp,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  'calendar-days': CalendarDays,
  clapperboard: Clapperboard,
  cpu: Cpu,
  download: Download,
  'graduation-cap': GraduationCap,
  'key-round': KeyRound,
  'life-buoy': LifeBuoy,
  mail: Mail,
  'message-circle': MessageCircle,
  presentation: Presentation,
  'scan-line': ScanLine,
  sparkles: Sparkles,
  'thumbs-up': ThumbsUp,
  upload: Upload,
  users: Users,
}

export function changeIcon(name: string): LucideIcon {
  return ICONS[name] ?? Sparkles
}

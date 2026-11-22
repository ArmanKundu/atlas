import {
  Atom,
  BookOpen,
  Brain,
  Calculator,
  Dna,
  FlaskConical,
  Globe,
  Landmark,
  Music,
  PenTool,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { SpaceBanner, SpaceColor, SpaceIcon } from '@shared/community'

export const SPACE_ICON: Record<SpaceIcon, LucideIcon> = {
  'book-open': BookOpen,
  users: Users,
  'flask-conical': FlaskConical,
  calculator: Calculator,
  globe: Globe,
  'pen-tool': PenTool,
  brain: Brain,
  dna: Dna,
  atom: Atom,
  landmark: Landmark,
  music: Music,
  sparkles: Sparkles,
}

export function spaceIcon(name: string): LucideIcon {
  return SPACE_ICON[name as SpaceIcon] ?? BookOpen
}

/** Tile colours for space icons and avatars: [background, foreground]. */
export const SPACE_TINT: Record<SpaceColor, [string, string]> = {
  blue: ['#dbeafe', '#1d4ed8'],
  green: ['#dcfce7', '#15803d'],
  purple: ['#ede9fe', '#6d28d9'],
  orange: ['#ffedd5', '#c2410c'],
  pink: ['#fce7f3', '#be185d'],
  teal: ['#ccfbf1', '#0f766e'],
}

export function tint(name: string): [string, string] {
  return SPACE_TINT[name as SpaceColor] ?? SPACE_TINT.blue
}

/** Banner backgrounds: soft skies, like a clear morning over the desk. */
export const SPACE_BANNER: Record<SpaceBanner, { label: string; css: string }> = {
  sky: {
    label: 'Sky',
    css: 'radial-gradient(120% 90% at 20% 0%, #ffffff 0%, transparent 55%), linear-gradient(180deg, #8cc4f5 0%, #c7e2fb 60%, #eef6fe 100%)',
  },
  dusk: {
    label: 'Dusk',
    css: 'radial-gradient(90% 80% at 80% 10%, #ffd9ec 0%, transparent 60%), linear-gradient(180deg, #a59cf0 0%, #d6cbf7 60%, #f6f1fd 100%)',
  },
  meadow: {
    label: 'Meadow',
    css: 'radial-gradient(100% 80% at 30% 0%, #fdfde8 0%, transparent 60%), linear-gradient(180deg, #9fdcb1 0%, #cdeed6 60%, #f1faf3 100%)',
  },
  sunset: {
    label: 'Sunset',
    css: 'radial-gradient(90% 90% at 70% 0%, #fff3c4 0%, transparent 55%), linear-gradient(180deg, #f9a77e 0%, #fbd0b3 60%, #fff4ec 100%)',
  },
  ocean: {
    label: 'Ocean',
    css: 'radial-gradient(100% 80% at 20% 0%, #e0fbff 0%, transparent 55%), linear-gradient(180deg, #5bb8c9 0%, #a9dde6 60%, #edf9fb 100%)',
  },
  paper: {
    label: 'Paper',
    css: 'linear-gradient(180deg, #ecebe6 0%, #f4f3ef 60%, #fbfaf7 100%)',
  },
}

export function banner(name: string): string {
  return (SPACE_BANNER[name as SpaceBanner] ?? SPACE_BANNER.sky).css
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (
    ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() ||
    '?'
  )
}

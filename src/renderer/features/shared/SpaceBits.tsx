import { createElement } from 'react'
import { ROLE_LABEL, type Profile, type SpaceRole } from '@shared/community'
import { cn } from '@/lib/cn'
import { initials, spaceIcon, tint } from './spaceStyle'

/** A space's icon on its colour, rounded like an app icon. */
export function SpaceTile({
  icon,
  color,
  size = 40,
  className,
}: {
  icon: string
  color: string
  size?: number
  className?: string
}) {
  const [bg, fg] = tint(color)
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-[28%]', className)}
      style={{ width: size, height: size, background: bg, color: fg }}
    >
      {createElement(spaceIcon(icon), {
        style: { width: size * 0.5, height: size * 0.5 },
        strokeWidth: 2,
      })}
    </span>
  )
}

export function Avatar({
  profile,
  size = 28,
  className,
}: {
  profile: Pick<Profile, 'displayName' | 'avatarColor'>
  size?: number
  className?: string
}) {
  const [bg, fg] = tint(profile.avatarColor)
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        className,
      )}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }}
    >
      {initials(profile.displayName)}
    </span>
  )
}

export function RoleBadge({ role }: { role: SpaceRole }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full px-2 text-2xs font-medium',
        role === 'owner' && 'bg-accent text-accent-fg',
        role === 'admin' && 'bg-blue-soft text-blue',
        role === 'editor' && 'bg-success-soft text-success',
        role === 'viewer' && 'bg-sunken text-ink-2',
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  )
}

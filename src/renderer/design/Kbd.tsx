import { cn } from '@/lib/cn'

/** A keyboard shortcut hint, e.g. `⌘K`. */
export function Kbd({
  children,
  tone = 'default',
  className,
}: {
  children: string
  tone?: 'default' | 'inverse'
  className?: string
}) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm px-1 font-sans text-2xs font-medium',
        tone === 'default'
          ? 'bg-surface text-ink-3 ring-1 ring-line ring-inset'
          : 'bg-white/15 text-accent-fg',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

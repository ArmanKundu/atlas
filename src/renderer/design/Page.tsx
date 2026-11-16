import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Standard page frame: a scrolling column capped at the reading width (1100 px).
 * Settings-style pages pass `width="narrow"`; full-width views (the paper viewer, the planner)
 * pass `width="full"`.
 */
export function Page({
  children,
  width = 'reading',
  className,
}: {
  children: ReactNode
  width?: 'reading' | 'narrow' | 'full'
  className?: string
}) {
  return (
    <div className="h-full overflow-y-auto">
      <div
        className={cn(
          'mx-auto flex min-h-full flex-col px-8 pt-7 pb-12',
          width === 'reading' && 'max-w-[var(--atlas-reading-w)]',
          width === 'narrow' && 'max-w-[760px]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  )
}

/** Page title block (reference 4): quiet eyebrow, large title, actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-7 flex items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-ink-3">{eyebrow}</p> : null}
        <h1 className="text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {description ? <p className="mt-1.5 max-w-[60ch] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** A titled group of settings or content on a white surface. */
export function Section({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mb-8', className)}>
      <h2 className="text-[0.9375rem] leading-6 font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-0.5 mb-3 text-ink-2">{description}</p> : null}
      <div className={cn(!description && 'mt-3')}>{children}</div>
    </section>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg bg-surface ring-1 ring-line ring-inset', className)}>
      {children}
    </div>
  )
}

/** One row inside a `Card`: label and help text on the left, a control on the right. */
export function Row({
  label,
  hint,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-6 border-b border-line px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="font-medium text-ink">{label}</div>
        {hint ? <div className="mt-0.5 text-ink-2">{hint}</div> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  )
}

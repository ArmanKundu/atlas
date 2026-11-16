import type { ReactNode } from 'react'
import { RotateCw, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Button } from './Button'

/**
 * Designed empty state: a quiet panel with a small label, a heading and one clear action.
 * `art` is usually the mascot.
 */
export function EmptyState({
  eyebrow,
  title,
  children,
  action,
  art,
  className,
}: {
  eyebrow?: string
  title: string
  children?: ReactNode
  action?: ReactNode
  art?: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'flex flex-col items-center rounded-lg border border-line bg-paper px-8 py-12 text-center text-paper-ink',
        className,
      )}
    >
      {art ? <div className="mb-6">{art}</div> : null}
      {eyebrow ? <p className="eyebrow mb-3 text-paper-ink-2">{eyebrow}</p> : null}
      <h2 className="max-w-[26ch] text-[1.25rem] leading-7 font-semibold tracking-[-0.015em] text-balance">
        {title}
      </h2>
      {children ? (
        <p className="mt-2 max-w-[52ch] text-pretty text-paper-ink-2">{children}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  )
}

/** Inline error with a retry: says what happened and what to do next. */
export function ErrorState({
  title = 'This did not load',
  children,
  onRetry,
  className,
}: {
  title?: string
  children?: ReactNode
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg bg-danger-soft px-4 py-3 text-ink',
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {children ? <p className="mt-0.5 text-ink-2">{children}</p> : null}
      </div>
      {onRetry ? (
        <Button size="sm" onClick={onRetry} icon={<RotateCw className="size-3.5" aria-hidden />}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

/** Skeleton block for loading lists and cards. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse-soft rounded-md bg-active', className)} />
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-3/5 opacity-60" />
          </div>
        </div>
      ))}
    </div>
  )
}

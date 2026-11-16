import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

const control =
  'rounded-md bg-surface px-3 text-ui text-ink ring-1 ring-inset ring-line-strong outline-none ' +
  'placeholder:text-ink-3 transition-shadow duration-150 focus:ring-2 focus:ring-focus disabled:opacity-50'

/** Controls fill their container unless the caller sets a width class. */
const width = (className?: string): string => (/(^|\s)w-/.test(className ?? '') ? '' : 'w-full')

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(control, width(className), 'h-9', className)} {...rest} />
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(control, width(className), 'min-h-24 resize-y py-2 leading-5', className)}
      {...rest}
    />
  )
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(control, width(className), 'h-9 appearance-none pr-8', className)}
        {...rest}
      >
        {children}
      </select>
    )
  },
)

/** Label, control and optional hint or error, wired together for screen readers. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="font-medium text-ink">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="text-ink-3">{hint}</span>
      ) : null}
    </label>
  )
}

/** A small coloured dot for a subject. The only place subject colour appears in lists. */
export function SubjectDot({ colour, className }: { colour: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ background: `var(--atlas-subject-${colour}, var(--atlas-ink-3))` }}
    />
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'blue' | 'success' | 'warn' | 'danger'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-md px-1.5 text-2xs font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-active text-ink-2',
        tone === 'blue' && 'bg-blue-soft text-blue',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'warn' && 'bg-warn-soft text-warn',
        tone === 'danger' && 'bg-danger-soft text-danger',
        className,
      )}
    >
      {children}
    </span>
  )
}

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Tooltip } from './Tooltip'

/**
 * Floating pill toolbar (reference 1): a soft white pill that groups related actions, with thin
 * dividers between groups. Used by the viewer, the annotation layer, the notes editor and the
 * selection menu.
 */
export const PillBar = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { orientation?: 'horizontal' | 'vertical'; label: string }
>(function PillBar({ orientation = 'horizontal', label, className, children, ...rest }, ref) {
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      aria-orientation={orientation}
      className={cn(
        'inline-flex items-center gap-0.5 bg-surface p-1 shadow-pill select-none',
        orientation === 'horizontal' ? 'h-10 rounded-lg' : 'w-10 flex-col rounded-lg',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
})

export function PillDivider({
  orientation = 'vertical',
}: {
  orientation?: 'vertical' | 'horizontal'
}) {
  return (
    <span
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-line',
        orientation === 'vertical' ? 'mx-1 h-4 w-px' : 'my-1 h-px w-4',
      )}
    />
  )
}

export interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required when the button shows only an icon. */
  label?: string
  icon?: ReactNode
  active?: boolean
}

export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(function PillButton(
  { label, icon, active, className, children, type, ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={children ? undefined : label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md text-ui font-medium text-ink-2',
        'transition-colors duration-150 ease-out hover:bg-hover hover:text-ink active:bg-active',
        'disabled:pointer-events-none disabled:opacity-45',
        children ? 'px-2.5' : 'w-8',
        active &&
          'bg-blue-soft text-blue ring-1 ring-blue-line ring-inset hover:bg-blue-soft hover:text-blue',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
  return label && !children ? <Tooltip label={label}>{button}</Tooltip> : button
})

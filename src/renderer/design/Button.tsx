import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Tooltip } from './Tooltip'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const base =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap ' +
  'transition-colors duration-150 ease-out select-none ' +
  'disabled:pointer-events-none disabled:opacity-45'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary:
    'bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-sunken active:bg-active',
  ghost: 'text-ink-2 hover:bg-hover hover:text-ink active:bg-active',
  danger: 'bg-danger-soft text-danger hover:brightness-95',
}

const sizes: Record<Size, string> = {
  sm: 'h-7 px-3 text-ui',
  md: 'h-8 px-3.5 text-ui',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Icon shown before the label. */
  icon?: ReactNode
  /** Icon shown after the label, as on the dark "Reply" pill. */
  trailingIcon?: ReactNode
}

/** A pill button. `primary` is the dark ink pill; use one per cluster. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, trailingIcon, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {icon}
      {children}
      {trailingIcon}
    </button>
  )
})

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Names the button for screen readers and the tooltip. */
  label: string
  /** Keyboard shortcut shown in the tooltip. */
  shortcut?: string
  size?: Size
  active?: boolean
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

/** A square icon button with a tooltip. Always labelled. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, size = 'md', active, tooltipSide, className, children, type, ...rest },
  ref,
) {
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type={type ?? 'button'}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-md text-ink-2 select-none',
          'transition-colors duration-150 ease-out hover:bg-hover hover:text-ink active:bg-active',
          'disabled:pointer-events-none disabled:opacity-45',
          size === 'sm' ? 'size-7' : 'size-8',
          active && 'bg-active text-ink',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  )
})

import type { ReactNode } from 'react'
import { ToggleGroup } from 'radix-ui'
import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

/** A single-choice segmented control (e.g. System / Light / Dark). Arrow keys move the choice. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: readonly SegmentedOption<T>[]
  label: string
  className?: string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(next) => {
        // Radix sends '' when the active item is pressed again; a choice is always required here.
        if (next) onChange(next as T)
      }}
      className={cn('inline-flex h-8 items-center gap-0.5 rounded-md bg-active p-0.5', className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 font-medium text-ink-2 select-none',
            'transition-colors duration-150 ease-out hover:text-ink',
            'data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-pill',
          )}
        >
          {option.icon}
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

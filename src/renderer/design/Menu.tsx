import type { ReactNode } from 'react'
import { DropdownMenu } from 'radix-ui'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  /** Shows a tick: for on/off items such as "Lock annotations". */
  checked?: boolean
  disabled?: boolean
}

/** A small menu under a trigger, for actions that do not fit in a toolbar. */
export function Menu({
  trigger,
  items,
  align = 'end',
}: {
  trigger: ReactNode
  items: MenuItem[]
  align?: 'start' | 'center' | 'end'
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className="animate-fade z-50 min-w-52 rounded-lg bg-surface p-1 shadow-dialog ring-1 ring-line"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.label}
              disabled={item.disabled}
              onSelect={item.onSelect}
              className={cn(
                'flex h-8 cursor-default items-center gap-2.5 rounded-md px-2 text-ink outline-none select-none',
                'data-[highlighted]:bg-hover data-[disabled]:opacity-40',
              )}
            >
              <span className="flex size-[18px] items-center justify-center text-ink-2">
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.checked ? <Check className="size-4 text-blue" aria-hidden /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

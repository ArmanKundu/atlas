import type { ReactElement } from 'react'
import { Tooltip as RadixTooltip } from 'radix-ui'
import { Kbd } from './Kbd'

export const TooltipProvider = RadixTooltip.Provider

export interface TooltipProps {
  label: string
  shortcut?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  children: ReactElement
}

export function Tooltip({ label, shortcut, side = 'bottom', children }: TooltipProps) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="animate-fade z-50 flex items-center gap-2 rounded-md bg-accent px-2 py-1 text-2xs font-medium text-accent-fg shadow-pop select-none"
        >
          {label}
          {shortcut ? <Kbd tone="inverse">{shortcut}</Kbd> : null}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}

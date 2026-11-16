import type { ReactNode } from 'react'
import { Dialog as RadixDialog } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

/** A modal dialog with a title, optional description, body and footer actions. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 480,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  width?: number
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-fade fixed inset-0 z-40 bg-scrim" />
        <RadixDialog.Content
          aria-describedby={description ? undefined : undefined}
          style={{ width: `min(${width}px, calc(100vw - 2rem))` }}
          className={cn(
            'animate-rise fixed top-1/2 left-1/2 z-50 flex max-h-[86vh] -translate-x-1/2 -translate-y-1/2 flex-col',
            'rounded-xl bg-surface shadow-dialog outline-none',
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div>
              <RadixDialog.Title className="text-[0.9375rem] leading-6 font-semibold text-ink">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-0.5 text-ink-2">
                  {description}
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label="Close"
              className="-mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

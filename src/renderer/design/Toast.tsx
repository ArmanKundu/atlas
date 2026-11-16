import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { Toast as RadixToast } from 'radix-ui'
import { Check, Info, X } from 'lucide-react'

export interface ToastInput {
  title: string
  description?: string
  tone?: 'success' | 'info'
  /** Optional action, e.g. "Restart" on the update-ready toast. */
  action?: { label: string; onSelect: () => void }
  durationMs?: number
}

interface ToastItem extends ToastInput {
  id: number
}

const ToastContext = createContext<((input: ToastInput) => void) | null>(null)

/**
 * Toasts confirm things that worked. Errors are shown inline where they happened
 * (see `ErrorState`), never as a toast.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const toast = useCallback((input: ToastInput) => {
    setItems((current) => [...current.slice(-2), { ...input, id: Date.now() + Math.random() }])
  }, [])

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const value = useMemo(() => toast, [toast])

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="right" duration={4000}>
        {children}
        {items.map((item) => (
          <RadixToast.Root
            key={item.id}
            duration={item.durationMs}
            onOpenChange={(open) => {
              if (!open) remove(item.id)
            }}
            className="animate-rise flex items-start gap-3 rounded-lg bg-surface py-3 pr-2 pl-3.5 shadow-pop"
          >
            <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-ink-2">
              {item.tone === 'info' ? (
                <Info className="size-4" aria-hidden />
              ) : (
                <Check className="size-4 text-success" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <RadixToast.Title className="font-medium text-ink">{item.title}</RadixToast.Title>
              {item.description ? (
                <RadixToast.Description className="mt-0.5 text-ink-2">
                  {item.description}
                </RadixToast.Description>
              ) : null}
              {item.action ? (
                <RadixToast.Action
                  altText={item.action.label}
                  onClick={item.action.onSelect}
                  className="mt-2 inline-flex h-7 items-center rounded-full bg-accent px-3 font-medium text-accent-fg hover:bg-accent-hover"
                >
                  {item.action.label}
                </RadixToast.Action>
              ) : null}
            </div>
            <RadixToast.Close
              aria-label="Dismiss"
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
            >
              <X className="size-3.5" aria-hidden />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed right-4 bottom-4 z-50 flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): (input: ToastInput) => void {
  const toast = useContext(ToastContext)
  if (!toast) throw new Error('useToast must be used inside <ToastProvider>')
  return toast
}

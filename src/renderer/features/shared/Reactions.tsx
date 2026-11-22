import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * Thumbs up and down in one pill. Picking one pops a big thumb above the pill, then the side
 * settles into a soft green (or red) glow. Picking it again takes the reaction back.
 */
export function Reactions({
  ups,
  downs,
  mine,
  onReact,
  disabled,
}: {
  ups: number
  downs: number
  mine: number
  onReact: (value: -1 | 0 | 1) => void
  disabled?: boolean
}) {
  const [burst, setBurst] = useState<{ id: number; value: 1 | -1 } | null>(null)
  const press = (value: 1 | -1): void => {
    const next = mine === value ? 0 : value
    if (next !== 0) setBurst({ id: Date.now(), value })
    onReact(next)
  }
  return (
    <div className="relative">
      <AnimatePresence>
        {burst ? (
          <motion.span
            key={burst.id}
            aria-hidden
            className={cn(
              'pointer-events-none absolute -top-2 flex size-10 items-center justify-center rounded-full shadow-pop',
              burst.value === 1 ? 'left-1 bg-success text-white' : 'right-1 bg-danger text-white',
            )}
            initial={{ y: 10, scale: 0.4, opacity: 0, rotate: burst.value === 1 ? -20 : 20 }}
            animate={{ y: -34, scale: 1, opacity: 1, rotate: 0 }}
            exit={{ y: -46, scale: 0.8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 18 }}
            onAnimationComplete={() => window.setTimeout(() => setBurst(null), 260)}
          >
            {burst.value === 1 ? (
              <ThumbsUp className="size-5" fill="currentColor" />
            ) : (
              <ThumbsDown className="size-5" fill="currentColor" />
            )}
          </motion.span>
        ) : null}
      </AnimatePresence>
      <div className="flex h-8 items-center rounded-full bg-surface p-0.5 shadow-pill ring-1 ring-line">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={mine === 1}
          aria-label={`Helpful (${ups})`}
          onClick={() => press(1)}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-full px-2.5 text-2xs font-medium text-ink-2 transition-colors hover:text-ink',
            mine === 1 &&
              'bg-success-soft text-success shadow-[0_0_0_3px_var(--atlas-success-soft)] hover:text-success',
          )}
        >
          <motion.span animate={mine === 1 ? { scale: [1, 1.35, 1] } : { scale: 1 }}>
            <ThumbsUp
              className="size-3.5"
              fill={mine === 1 ? 'currentColor' : 'none'}
              aria-hidden
            />
          </motion.span>
          {ups}
        </button>
        <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
        <button
          type="button"
          disabled={disabled}
          aria-pressed={mine === -1}
          aria-label={`Not helpful (${downs})`}
          onClick={() => press(-1)}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-full px-2.5 text-2xs font-medium text-ink-2 transition-colors hover:text-ink',
            mine === -1 &&
              'bg-danger-soft text-danger shadow-[0_0_0_3px_var(--atlas-danger-soft)] hover:text-danger',
          )}
        >
          <motion.span animate={mine === -1 ? { scale: [1, 1.35, 1] } : { scale: 1 }}>
            <ThumbsDown
              className="size-3.5"
              fill={mine === -1 ? 'currentColor' : 'none'}
              aria-hidden
            />
          </motion.span>
          {downs}
        </button>
      </div>
    </div>
  )
}

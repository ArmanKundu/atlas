import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

export type CodeState = 'idle' | 'checking' | 'error' | 'success'

const CONFETTI = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#a855f7', '#14b8a6']

/**
 * A row of character boxes for a one-time code or a join code. Typing, pasting and backspace go
 * to one hidden input. When full it calls `onComplete`; the parent sets `state` to show checking,
 * a shake for a wrong code (then it clears) or a green "Verified" pill with a little confetti.
 */
export function CodeInput({
  length,
  kind = 'digits',
  state,
  onComplete,
  onChange,
  label,
  successLabel = 'Verified',
  autoFocus = true,
}: {
  length: number
  /** Digits only, or letters and digits (join codes). */
  kind?: 'digits' | 'code'
  state: CodeState
  onComplete: (code: string) => void
  onChange?: () => void
  label: string
  successLabel?: string
  autoFocus?: boolean
}) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  // A wrong code shakes, then clears for another go.
  useEffect(() => {
    if (state !== 'error') return
    const t = window.setTimeout(() => {
      setValue('')
      input.current?.focus()
    }, 900)
    return () => window.clearTimeout(t)
  }, [state])

  const clean = (raw: string): string =>
    (kind === 'digits'
      ? raw.replace(/\D/g, '')
      : raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
    ).slice(0, length)

  if (state === 'success') {
    return (
      <div className="relative flex h-14 items-center justify-center" role="status">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          className="flex h-11 items-center gap-2 rounded-full bg-success-soft px-5 font-semibold text-success shadow-pill"
        >
          <Check className="size-4" strokeWidth={3} aria-hidden />
          {successLabel}
        </motion.div>
        {CONFETTI.flatMap((color, i) =>
          [0, 1].map((j) => {
            const angle = ((i * 2 + j) / 12) * Math.PI * 2
            return (
              <motion.span
                key={`${i}-${j}`}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-1/2 size-1.5 rounded-[2px]"
                style={{ background: color }}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{
                  x: Math.cos(angle) * (70 + j * 30),
                  y: Math.sin(angle) * (34 + j * 14),
                  opacity: 0,
                  rotate: 200,
                }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            )
          }),
        )}
      </div>
    )
  }

  const error = state === 'error'
  const checking = state === 'checking'
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.div
        className="relative"
        animate={error ? { x: [0, -10, 10, -7, 7, -3, 0] } : { x: 0 }}
        transition={{ duration: 0.45 }}
        onClick={() => input.current?.focus()}
      >
        <input
          ref={input}
          value={value}
          aria-label={label}
          autoFocus={autoFocus}
          autoComplete="one-time-code"
          inputMode={kind === 'digits' ? 'numeric' : 'text'}
          spellCheck={false}
          disabled={checking}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const next = clean(e.target.value)
            setValue(next)
            onChange?.()
            if (next.length === length) onComplete(next)
          }}
          className="absolute inset-0 z-10 w-full cursor-text opacity-0"
        />
        <div className="flex gap-1.5" aria-hidden>
          {Array.from({ length }, (_, i) => {
            const char = value[i] ?? ''
            const current = focused && !checking && i === Math.min(value.length, length - 1)
            return (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.03, type: 'spring', stiffness: 500, damping: 30 }}
                className={cn(
                  'relative flex h-12 w-10 items-center justify-center rounded-lg bg-sunken font-mono text-[1.25rem] font-semibold text-ink ring-1 ring-line ring-inset transition-colors',
                  current && 'bg-surface ring-2 ring-focus',
                  error && 'bg-danger-soft text-danger ring-danger',
                  checking && 'opacity-60',
                  length > 6 && i === length / 2 && 'ml-2',
                )}
              >
                <AnimatePresence mode="popLayout">
                  {char ? (
                    <motion.span
                      key={char + i}
                      initial={{ y: 8, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={cn(error && 'line-through decoration-2')}
                    >
                      {char}
                    </motion.span>
                  ) : current && value.length < length ? (
                    <span className="animate-pulse-soft h-5 w-0.5 rounded-full bg-ink" />
                  ) : null}
                </AnimatePresence>
              </motion.span>
            )
          })}
        </div>
      </motion.div>
      <div className="flex h-5 items-center gap-1.5 text-2xs text-ink-3" aria-live="polite">
        {checking ? (
          <>
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Checking
          </>
        ) : error ? (
          <span className="text-danger">That code did not work</span>
        ) : null}
      </div>
    </div>
  )
}

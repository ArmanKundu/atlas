import { useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, KeyRound } from 'lucide-react'
import type { JoinResult } from '@shared/community'
import { Button } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { changed } from '@/lib/api'
import { call } from '@/lib/ipc'
import { CodeInput, type CodeState } from './CodeInput'
import { JOIN_CODE_LENGTH } from './shared-constants'
import { banner } from './spaceStyle'

/** Type a space's join code. Joins straight away, or asks the owner to approve. */
export function JoinDialog({
  open,
  onOpenChange,
  onJoined,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onJoined: (spaceId: string) => void
}) {
  const [state, setState] = useState<CodeState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<JoinResult | null>(null)
  const [attempt, setAttempt] = useState(0)

  const verify = async (code: string): Promise<void> => {
    setState('checking')
    setError(null)
    try {
      const r = await call('shared:joinByCode', { code })
      setResult(r)
      setState(r.status === 'requested' ? 'idle' : 'success')
      changed('shared')
    } catch (cause) {
      setState('error')
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const reset = (): void => {
    setState('idle')
    setError(null)
    setResult(null)
    setAttempt((n) => n + 1)
  }

  // Fresh form each time it opens (the parent opens it, so Radix sends no open event).
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) reset()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Join a space" width={480}>
      <div
        className="-mx-5 -mt-4 mb-5 flex h-28 items-center justify-center"
        style={{ background: banner('sky') }}
      >
        <motion.span
          initial={{ scale: 0.8, rotate: -8, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 380, damping: 20 }}
          className="flex size-14 items-center justify-center rounded-2xl bg-surface text-ink shadow-pop"
        >
          {result?.status === 'requested' ? (
            <Clock className="size-6" aria-hidden />
          ) : (
            <KeyRound className="size-6" aria-hidden />
          )}
        </motion.span>
      </div>

      {result?.status === 'requested' ? (
        <div className="flex flex-col items-center gap-2 pb-2 text-center">
          <p className="text-[1.0625rem] font-semibold text-ink">Request sent</p>
          <p className="max-w-[36ch] text-ink-2">
            The people who run <span className="font-medium text-ink">{result.name}</span> will see
            your request in their inbox. You will get a note in yours when they answer.
          </p>
          <Button className="mt-3" variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 pb-2 text-center">
          <p className="text-ink-2">
            {result
              ? result.status === 'already'
                ? `You are already in ${result.name}.`
                : `Welcome to ${result.name}.`
              : `Type the ${JOIN_CODE_LENGTH}-character code a friend gave you.`}
          </p>
          <div className="mt-3">
            <CodeInput
              key={attempt}
              length={JOIN_CODE_LENGTH}
              kind="code"
              state={state}
              label="Join code"
              successLabel="Joined"
              onChange={() => state === 'error' && setState('idle')}
              onComplete={(code) => void verify(code)}
            />
          </div>
          {state === 'error' && error ? <p className="text-2xs text-ink-3">{error}</p> : null}
          {result ? (
            <Button
              className="mt-2"
              variant="primary"
              onClick={() => {
                onJoined(result.spaceId)
                onOpenChange(false)
              }}
            >
              Open {result.name}
            </Button>
          ) : null}
        </div>
      )}
    </Dialog>
  )
}

import { useRef, useState } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/ipc'
import { listen, transcribe, type Listening } from './mic'

/**
 * Speak instead of typing: tap, talk, pause. Speech becomes text on this computer (Whisper);
 * nothing is recorded or sent anywhere.
 */
export function MicButton({
  onText,
  className,
}: {
  onText: (text: string) => void
  className?: string
}) {
  const [state, setState] = useState<'idle' | 'listening' | 'working'>('idle')
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const session = useRef<Listening | null>(null)

  const start = async (): Promise<void> => {
    setError(null)
    try {
      const listening = await listen({ autoStop: true, onLevel: setLevel })
      session.current = listening
      setState('listening')
      const pcm = await listening.done
      session.current = null
      setState('working')
      const text = await transcribe(pcm)
      if (text) onText(text)
      else setError("Didn't catch that. Try again a little closer to the mic.")
    } catch (e) {
      setError(
        /denied|NotAllowed/i.test(String(e))
          ? 'Atlas needs the microphone. Allow it in System Settings → Privacy & Security → Microphone.'
          : errorMessage(e),
      )
    } finally {
      setState('idle')
      setLevel(0)
    }
  }

  return (
    <button
      type="button"
      aria-label={state === 'listening' ? 'Stop listening' : 'Speak your question'}
      title={error ?? (state === 'working' ? 'Turning speech into text…' : 'Speak your question')}
      onClick={() =>
        state === 'listening' ? session.current?.stop() : state === 'idle' && void start()
      }
      className={cn(
        'relative flex size-8 shrink-0 items-center justify-center rounded-full ring-1 transition-colors',
        state === 'listening'
          ? 'bg-danger-soft text-danger ring-danger/40'
          : 'text-ink-2 ring-line hover:bg-hover hover:text-ink',
        error && state === 'idle' && 'text-danger',
        className,
      )}
    >
      {state === 'listening' ? (
        <>
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-danger/25"
            style={{ transform: `scale(${1 + level * 0.8})`, transition: 'transform 80ms linear' }}
          />
          <Square className="relative size-3 fill-current" aria-hidden />
        </>
      ) : state === 'working' ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Mic className="size-4" aria-hidden />
      )}
    </button>
  )
}

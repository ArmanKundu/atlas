import { useEffect } from 'react'
import { useMotionValue } from 'framer-motion'
import { Mascot } from '@/mascot/Mascot'
import type { MascotMood } from '@/mascot/options'
import { voiceLevel } from './audio'

/**
 * The tutor in the corner of a lesson: Atlas's mascot, whose mouth moves with the narration
 * (from the voice's loudness, or a gentle chatter when the voice is off).
 */
export function Tutor({
  talking,
  withVoice,
  mood = 'idle',
  note,
}: {
  talking: boolean
  withVoice: boolean
  mood?: MascotMood
  /** A short line in a speech bubble ("Ask me anything"). */
  note?: string | null
}) {
  const mouth = useMotionValue(0)

  useEffect(() => {
    if (!talking) {
      mouth.set(0)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (): void => {
      const s = (performance.now() - start) / 1000
      const level = withVoice
        ? voiceLevel()
        : Math.max(0, Math.sin(s * 13) * 0.5 + Math.sin(s * 5.3) * 0.3 + 0.2)
      mouth.set(mouth.get() * 0.4 + level * 0.6)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [talking, withVoice, mouth])

  return (
    <div className="pointer-events-none flex items-end gap-2">
      <div className="rounded-full bg-white/90 p-1 shadow-pop ring-1 ring-black/10">
        <Mascot size={64} mood={mood} interactive={false} mouth={mouth} label="Your tutor" />
      </div>
      {note ? (
        <p className="mb-6 max-w-[220px] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-2xs leading-4 text-[#1d1d1f] shadow-pop">
          {note}
        </p>
      ) : null}
    </div>
  )
}

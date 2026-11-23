import { call } from '@/lib/ipc'

/**
 * Spoken clips for whiteboard steps, shared by the chat card (which starts them while the
 * assistant is still writing) and the player (which plays them). Keyed by voice and text.
 */
const clips = new Map<string, Promise<Uint8Array | null>>()

export function speakCached(text: string, voice: string): Promise<Uint8Array | null> {
  const say = text.trim()
  if (!say) return Promise.resolve(null)
  const key = `${voice}|${say}`
  const hit = clips.get(key)
  if (hit) return hit
  const job = call('voice:speak', { text: say, voice, speed: 1 })
    .then(({ wav }) => (wav.byteLength ? wav : null))
    .catch(() => {
      clips.delete(key)
      return null
    })
  clips.set(key, job)
  // Keep the newest 120 clips.
  if (clips.size > 120) {
    const oldest = clips.keys().next().value
    if (oldest) clips.delete(oldest)
  }
  return job
}

/** True once the clip exists (or failed), so the card can count what is ready. */
export function isCached(text: string, voice: string): boolean {
  return clips.has(`${voice}|${text.trim()}`)
}

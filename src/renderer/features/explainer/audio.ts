import { speakCached } from '../whiteboard/voice-cache'

/** One audio context for every lesson player; recording taps into `tap`. */
let shared: { ctx: AudioContext; tap: MediaStreamAudioDestinationNode } | null = null
export function lessonAudio(): { ctx: AudioContext; tap: MediaStreamAudioDestinationNode } {
  if (!shared) {
    const ctx = new AudioContext()
    shared = { ctx, tap: ctx.createMediaStreamDestination() }
  }
  return shared
}

const buffers = new Map<string, Promise<AudioBuffer | null>>()
export function clip(text: string, voice: string): Promise<AudioBuffer | null> {
  const key = `${voice}|${text}`
  const hit = buffers.get(key)
  if (hit) return hit
  const job = speakCached(text, voice).then(async (wav) => {
    if (!wav) return null
    try {
      return await lessonAudio().ctx.decodeAudioData(wav.slice().buffer)
    } catch {
      return null
    }
  })
  buffers.set(key, job)
  return job
}

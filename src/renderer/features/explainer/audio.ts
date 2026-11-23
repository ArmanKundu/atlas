import { speakCached } from '../whiteboard/voice-cache'

/** One audio context for every lesson player; recording taps into `tap`. */
let shared: {
  ctx: AudioContext
  tap: MediaStreamAudioDestinationNode
  meter: AnalyserNode
} | null = null
export function lessonAudio(): {
  ctx: AudioContext
  tap: MediaStreamAudioDestinationNode
  /** How loud the voice is right now, for the tutor's mouth. */
  meter: AnalyserNode
} {
  if (!shared) {
    const ctx = new AudioContext()
    const meter = ctx.createAnalyser()
    meter.fftSize = 512
    meter.smoothingTimeConstant = 0.5
    shared = { ctx, tap: ctx.createMediaStreamDestination(), meter }
  }
  return shared
}

/** The voice's loudness now, 0 to 1. */
export function voiceLevel(): number {
  const { meter } = lessonAudio()
  const data = new Uint8Array(meter.fftSize)
  meter.getByteTimeDomainData(data)
  let sum = 0
  for (const v of data) sum += ((v - 128) / 128) ** 2
  return Math.min(1, Math.sqrt(sum / data.length) * 6)
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

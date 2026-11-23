import { call } from '@/lib/ipc'

const RATE = 16_000

export interface Listening {
  /** Stops listening now and returns what was heard. */
  stop: () => void
  /** Resolves with 16 kHz mono samples once listening stops. */
  done: Promise<Float32Array>
}

/**
 * Listens on the microphone. With `autoStop`, stops by itself after the student has spoken and
 * then paused for `silenceMs`, or after `maxMs`. `onLevel` gets the loudness (0–1) for a meter.
 */
export async function listen(options: {
  autoStop?: boolean
  silenceMs?: number
  maxMs?: number
  onLevel?: (level: number) => void
  onSpeech?: () => void
}): Promise<Listening> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
  const ctx = new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)
  const recorder = new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }

  let stopped = false
  // A timer, not requestAnimationFrame: it keeps running while the window is in the background.
  let timer = 0
  const stop = (): void => {
    if (stopped) return
    stopped = true
    window.clearInterval(timer)
    if (recorder.state !== 'inactive') recorder.stop()
  }

  const silenceMs = options.silenceMs ?? 1100
  const maxMs = options.maxMs ?? 60_000
  const began = performance.now()
  let spoke = false
  let quietSince = performance.now()
  const samples = new Float32Array(analyser.fftSize)
  const tick = (): void => {
    if (stopped) return
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (const s of samples) sum += s * s
    const rms = Math.sqrt(sum / samples.length)
    const level = Math.min(1, rms * 8)
    options.onLevel?.(level)
    const now = performance.now()
    if (rms > 0.02) {
      if (!spoke) options.onSpeech?.()
      spoke = true
      quietSince = now
    }
    if (options.autoStop && spoke && now - quietSince > silenceMs) return stop()
    if (now - began > maxMs) return stop()
    // Nobody spoke at all: give up after a while.
    if (options.autoStop && !spoke && now - began > 12_000) return stop()
  }

  const done = new Promise<Float32Array>((resolve, reject) => {
    recorder.onstop = () => {
      for (const t of stream.getTracks()) t.stop()
      void (async () => {
        try {
          await ctx.close()
          if (!spoke || chunks.length === 0) return resolve(new Float32Array())
          const blob = new Blob(chunks, { type: recorder.mimeType })
          const decoder = new OfflineAudioContext(1, 1, RATE)
          const audio = await decoder.decodeAudioData(await blob.arrayBuffer())
          // Down-mix and resample to 16 kHz mono for Whisper.
          const offline = new OfflineAudioContext(1, Math.ceil(audio.duration * RATE), RATE)
          const node = offline.createBufferSource()
          node.buffer = audio
          node.connect(offline.destination)
          node.start()
          const out = await offline.startRendering()
          resolve(out.getChannelData(0).slice())
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })()
    }
  })
  recorder.start(250)
  timer = window.setInterval(tick, 40)
  return { stop, done }
}

/** What was said, as text ('' for silence). Downloads the speech model the first time. */
export async function transcribe(pcm: Float32Array): Promise<string> {
  if (pcm.length < RATE / 4) return ''
  const copy = new Float32Array(new ArrayBuffer(pcm.byteLength))
  copy.set(pcm)
  const { text } = await call('hearing:transcribe', { pcm: copy })
  // Whisper marks silence and noise like "[BLANK_AUDIO]" or "(wind blowing)".
  return text
    .replace(/\[[^\]]*\]|\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

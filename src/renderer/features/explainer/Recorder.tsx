import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useParams } from 'react-router'
import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { parseLesson, speakingSeconds, type Lesson } from '@shared/lesson'
import { db } from '@/lib/api'
import { call, errorMessage } from '@/lib/ipc'
import { clip } from './audio'
import { Stage } from './Stage'

const W = 1280
const H = 720
const FPS = 30
const RATE = 48_000

const nextPaint = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

async function pickVideoCodec(): Promise<VideoEncoderConfig> {
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42001f']) {
    const config: VideoEncoderConfig = {
      codec,
      width: W,
      height: H,
      bitrate: 6_000_000,
      framerate: FPS,
      avc: { format: 'avc' },
    }
    if ((await VideoEncoder.isConfigSupported(config)).supported) return config
  }
  throw new Error('This computer cannot encode H.264 video.')
}

async function pickAudioCodec(): Promise<{ config: AudioEncoderConfig; muxer: 'aac' | 'opus' }> {
  const aac: AudioEncoderConfig = {
    codec: 'mp4a.40.2',
    sampleRate: RATE,
    numberOfChannels: 2,
    bitrate: 128_000,
  }
  if ((await AudioEncoder.isConfigSupported(aac)).supported) return { config: aac, muxer: 'aac' }
  return {
    config: { codec: 'opus', sampleRate: RATE, numberOfChannels: 2, bitrate: 128_000 },
    muxer: 'opus',
  }
}

/** The narration for the whole lesson as one track, each scene's clip at the scene's start. */
async function narration(buffers: (AudioBuffer | null)[], seconds: number[]): Promise<AudioBuffer> {
  const total = seconds.reduce((a, b) => a + b, 0) + 0.5
  const ctx = new OfflineAudioContext(2, Math.ceil(total * RATE), RATE)
  let at = 0
  buffers.forEach((buffer, i) => {
    if (buffer) {
      const node = ctx.createBufferSource()
      node.buffer = buffer
      node.connect(ctx.destination)
      node.start(at)
    }
    at += seconds[i] ?? 0
  })
  return ctx.startRendering()
}

/**
 * Runs in a hidden offscreen window: draws a lesson frame by frame, has Atlas copy each frame,
 * encodes the frames and the narration to MP4 and hands the file back. Nothing is recorded from
 * the screen.
 */
export function Recorder() {
  const { lessonId } = useParams()
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [seconds, setSeconds] = useState<number[]>([])
  const [at, setAt] = useState({ scene: 0, t: 0 })

  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      const row = lessonId ? await db.get('lessons', lessonId) : null
      const parsed = row ? parseLesson(JSON.stringify(row.lesson)) : null
      if (!parsed) throw new Error('That lesson could not be read.')
      const [voiceOn, voiceId, status] = await Promise.all([
        call('settings:get', { key: 'whiteboard.voice' }),
        call('settings:get', { key: 'whiteboard.voiceId' }),
        call('voice:status'),
      ])
      const speak = voiceOn !== false && status === 'ready'
      const voice = typeof voiceId === 'string' ? voiceId : 'af_heart'
      const buffers = await Promise.all(
        parsed.scenes.map((s) => (speak ? clip(s.say, voice) : Promise.resolve(null))),
      )
      const lengths = parsed.scenes.map((s, i) => {
        const b = buffers[i]
        return b ? b.duration + 0.6 : speakingSeconds(s.say)
      })
      if (!alive) return
      flushSync(() => {
        setLesson(parsed)
        setSeconds(lengths)
      })

      const target = new ArrayBufferTarget()
      const audio = speak ? await pickAudioCodec() : null
      const muxer = new Muxer({
        target,
        video: { codec: 'avc', width: W, height: H, frameRate: FPS },
        ...(audio ? { audio: { codec: audio.muxer, numberOfChannels: 2, sampleRate: RATE } } : {}),
        fastStart: 'in-memory',
        firstTimestampBehavior: 'offset',
      })
      let failure: Error | null = null
      const video = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => (failure = e instanceof Error ? e : new Error(String(e))),
      })
      video.configure(await pickVideoCodec())

      const frames = lengths.map((s) => Math.max(1, Math.ceil(s * FPS)))
      const total = frames.reduce((a, b) => a + b, 0)
      let n = 0
      for (let scene = 0; scene < frames.length; scene++) {
        for (let f = 0; f < (frames[scene] ?? 0); f++) {
          if (!alive) return
          if (failure) throw failure
          flushSync(() => setAt({ scene, t: f / FPS }))
          await nextPaint()
          const bgra = await call('explainer:captureFrame')
          const frame = new VideoFrame(bgra, {
            format: 'BGRA',
            codedWidth: W,
            codedHeight: H,
            timestamp: Math.round((n * 1_000_000) / FPS),
            duration: Math.round(1_000_000 / FPS),
          })
          video.encode(frame, { keyFrame: n % (FPS * 2) === 0 })
          frame.close()
          n++
          while (video.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 5))
          if (n % 15 === 0) void call('explainer:videoProgress', { done: n, total })
        }
      }
      await video.flush()
      if (failure) throw failure

      if (audio) {
        const track = await narration(buffers, lengths)
        const encoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => (failure = e instanceof Error ? e : new Error(String(e))),
        })
        encoder.configure(audio.config)
        const left = track.getChannelData(0)
        const right = track.numberOfChannels > 1 ? track.getChannelData(1) : left
        const step = 4096
        for (let start = 0; start < track.length; start += step) {
          const size = Math.min(step, track.length - start)
          const planes = new Float32Array(size * 2)
          planes.set(left.subarray(start, start + size), 0)
          planes.set(right.subarray(start, start + size), size)
          const data = new AudioData({
            format: 'f32-planar',
            sampleRate: RATE,
            numberOfFrames: size,
            numberOfChannels: 2,
            timestamp: Math.round((start * 1_000_000) / RATE),
            data: planes,
          })
          encoder.encode(data)
          data.close()
        }
        await encoder.flush()
        if (failure) throw failure
      }
      muxer.finalize()
      await call('explainer:videoProgress', { done: total, total })
      await call('explainer:videoReady', { bytes: new Uint8Array(target.buffer) })
    }
    run().catch((error: unknown) => {
      void call('explainer:videoFailed', { message: errorMessage(error).slice(0, 500) }).catch(
        () => undefined,
      )
    })
    return () => {
      alive = false
    }
  }, [lessonId])

  return (
    <div style={{ width: W, height: H, background: '#000', overflow: 'hidden' }}>
      {lesson ? (
        <Stage
          lesson={lesson}
          scene={at.scene}
          t={at.t}
          seconds={seconds}
          caption={lesson.scenes[at.scene]?.say ?? null}
        />
      ) : null}
    </div>
  )
}

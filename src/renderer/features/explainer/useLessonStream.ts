import { useCallback, useEffect, useRef, useState } from 'react'
import { parseLesson, parseLessonPartial, type Lesson } from '@shared/lesson'
import { call, errorMessage, subscribe } from '@/lib/ipc'

export interface LessonRequest {
  prompt: string
  subjectId: string | null
  subject: string | null
  level: string | null
  style: 'clear' | 'fun'
  exam: boolean
  files: string[]
  sourceIds: string[]
  questionIds: string[]
  followUp: { lesson: string; scene: number } | null
  /** Let the AI use 3D models and quick checks (off when the admin turned them off). */
  models3d?: boolean
  checks?: boolean
}

export type StreamState =
  | { status: 'idle' }
  | { status: 'writing'; lesson: Lesson | null; chars: number }
  | { status: 'done'; lesson: Lesson; text: string; provider: string | null }
  | { status: 'error'; message: string; lesson: Lesson | null }

/**
 * Asks the user's AI for a lesson and reads it as it streams: `lesson` holds the scenes that are
 * complete so far, so playback can start on the first one.
 */
export function useLessonStream(
  onDone?: (lesson: Lesson, text: string, provider: string | null) => void,
) {
  const [state, setState] = useState<StreamState>({ status: 'idle' })
  const current = useRef<string | null>(null)
  const text = useRef('')
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })

  useEffect(() => {
    const offDelta = subscribe('explainer:delta', ({ requestId, text: chunk }) => {
      if (requestId !== current.current) return
      text.current += chunk
      const lesson = parseLessonPartial(text.current)
      setState({ status: 'writing', lesson, chars: text.current.length })
    })
    const offDone = subscribe('explainer:done', ({ requestId, text: full, provider, error }) => {
      if (requestId !== current.current) return
      current.current = null
      const lesson = parseLesson(full) ?? parseLessonPartial(full)
      if (error) setState({ status: 'error', message: error, lesson })
      else if (!lesson)
        setState({
          status: 'error',
          message: "The AI didn't send back a lesson Atlas could play. Try asking again.",
          lesson: null,
        })
      else {
        setState({ status: 'done', lesson, text: full, provider })
        done.current?.(lesson, full, provider)
      }
    })
    return () => {
      offDelta()
      offDone()
    }
  }, [])

  const start = useCallback(async (request: LessonRequest) => {
    const requestId = `lesson-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    current.current = requestId
    text.current = ''
    setState({ status: 'writing', lesson: null, chars: 0 })
    try {
      await call('explainer:generate', { requestId, ...request })
    } catch (error) {
      current.current = null
      setState({ status: 'error', message: errorMessage(error), lesson: null })
    }
  }, [])

  const cancel = useCallback(() => {
    const requestId = current.current
    if (requestId) void call('explainer:cancel', { requestId }).catch(() => undefined)
  }, [])

  const reset = useCallback(() => {
    current.current = null
    setState({ status: 'idle' })
  }, [])

  return { state, start, cancel, reset }
}

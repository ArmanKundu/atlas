import { useEffect, useRef, useState } from 'react'
import { ArrowUp, X } from 'lucide-react'
import type { ChatMessage } from '@shared/models'
import { IconButton } from '@/design/Button'
import { Markdown } from '@/design/Markdown'
import { Buddy } from '@/mascot/Buddy'
import { changed, db, useLive } from '@/lib/api'
import { call, subscribe } from '@/lib/ipc'

const CONTEXT_MARK = '\n\n---\nContext from Atlas (the question and its report):\n'

/** The part of a message the student typed, without the context Atlas attached to it. */
function visible(text: string): string {
  const at = text.indexOf(CONTEXT_MARK)
  return at === -1 ? text : text.slice(0, at)
}

const QUICK_PROMPTS = [
  'Explain the key idea',
  'Where do students go wrong?',
  'Give a hint',
  'Mark my answer',
]

/**
 * A chat about one question, over the inspector. Every message carries the question's text,
 * solution and report notes as context, through the same AI router as the Assistant.
 */
export function AskDrawer({
  title,
  subjectId,
  context,
  initialPrompt,
  onClose,
}: {
  /** "Q3", shown as "on Q3". */
  title: string
  subjectId: string | null
  context: string
  /** A prompt to send straight away (from the selection toolbar). */
  initialPrompt?: string | null
  onClose: () => void
}) {
  const [chatId, setChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const sentInitial = useRef<string | null>(null)
  const status = useLive(['ai'], () => call('ai:config'))
  const connected = Boolean(status.data?.defaultProvider)
  const streaming = messages.some((m) => m.status === 'streaming')

  useEffect(
    () =>
      subscribe('ai:delta', ({ chatId: id, messageId, text }) => {
        if (id !== chatId) return
        setMessages((list) =>
          list.map((m) => (m.id === messageId ? { ...m, contentMd: m.contentMd + text } : m)),
        )
      }),
    [chatId],
  )
  useEffect(
    () =>
      subscribe('ai:finished', ({ chatId: id, message }) => {
        if (id !== chatId) return
        setMessages((list) => list.map((m) => (m.id === message.id ? message : m)))
        changed('chats')
      }),
    [chatId],
  )
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const send = async (text: string): Promise<void> => {
    const prompt = text.trim()
    if (!prompt || streaming) return
    let id = chatId
    if (!id) {
      const chat = await db.create('chats', {
        subjectId,
        agent: 'tutor',
        title: `${title}: ${prompt.slice(0, 60)}`,
      })
      id = chat.id
      setChatId(chat.id)
    }
    setDraft('')
    const { user, assistant } = await call('ai:send', {
      chatId: id,
      content: `${prompt}${CONTEXT_MARK}${context}`,
    })
    setMessages((list) => [...list, user, assistant])
  }

  useEffect(() => {
    if (initialPrompt && sentInitial.current !== initialPrompt && connected) {
      sentInitial.current = initialPrompt
      void send(initialPrompt)
    }
    // send is recreated each render; the guard keeps this to one send per prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, connected])

  return (
    <div
      role="dialog"
      aria-label={`Ask about ${title}`}
      className="absolute inset-y-0 right-0 z-30 flex w-[430px] flex-col border-l border-line bg-surface shadow-dialog"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <Buddy size={28} />
        <p className="min-w-0 flex-1 font-semibold text-ink">
          Atlas <span className="font-normal text-ink-3">on {title}</span>
        </p>
        <IconButton label="Close" onClick={onClose}>
          <X className="size-4" aria-hidden />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-ink-2">
              Ask anything about this question. Atlas sees the question, its solution and the
              examiner’s notes.
            </p>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={!connected}
                onClick={() => void send(p)}
                className="rounded-lg px-3 py-2 text-left text-ink ring-1 ring-line ring-inset hover:bg-hover disabled:opacity-50"
              >
                {p}
              </button>
            ))}
            {!connected ? (
              <p className="text-ink-3">Connect an AI in Settings to ask questions.</p>
            ) : null}
          </div>
        ) : (
          messages.map((m) =>
            m.role === 'user' ? (
              <p
                key={m.id}
                className="ml-8 rounded-lg bg-sunken px-3 py-2 whitespace-pre-wrap text-ink"
              >
                {visible(m.contentMd)}
              </p>
            ) : (
              <div key={m.id} className="text-ink">
                {m.status === 'error' ? (
                  <p className="text-danger">{m.error ?? 'Something went wrong.'}</p>
                ) : (
                  <Markdown>{m.contentMd || '…'}</Markdown>
                )}
              </div>
            ),
          )
        )}
        <div ref={bottom} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send(draft)
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(draft)
            }
          }}
          rows={2}
          placeholder={connected ? 'Ask about this question' : 'Connect an AI to ask'}
          disabled={!connected}
          aria-label="Ask about this question"
          className="min-h-10 flex-1 resize-none rounded-lg bg-sunken px-3 py-2 text-ink outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!draft.trim() || streaming || !connected}
          className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-fg disabled:opacity-40"
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </form>
    </div>
  )
}

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowUp, Copy, Layers, NotebookPen, Plus, Square, Trash2, Wand2 } from 'lucide-react'
import { AUTO_HELPER, pickHelper } from '@shared/helper-pick'
import type { AgentInfo, Chat, ChatMessage } from '@shared/models'
import { Button, IconButton } from '@/design/Button'
import { Badge } from '@/design/Form'
import { Markdown } from '@/design/Markdown'
import { ErrorState } from '@/design/States'
import { useToast } from '@/design/Toast'
import { changed, db, useAction, useLive } from '@/lib/api'
import { call, subscribe } from '@/lib/ipc'
import { Buddy } from '@/mascot/Buddy'
import { providerName } from '@/features/ai/names'
import { agentIcon } from './agents'
import { HelperPicker } from './HelperPicker'
import { ShareActionCard } from '@/features/shared/ShareActionCard'

const CHAT_BLOCKS = { 'atlas-share': (code: string) => <ShareActionCard code={code} /> }

function parseCards(text: string): { front: string; back: string }[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) throw new Error('no cards')
  const parsed: unknown = JSON.parse(text.slice(start, end + 1))
  if (!Array.isArray(parsed)) throw new Error('no cards')
  return parsed.flatMap((item) => {
    const card = item as { front?: unknown; back?: unknown }
    return typeof card.front === 'string' && typeof card.back === 'string'
      ? [{ front: card.front, back: card.back }]
      : []
  })
}

function MessageBubble({ message, subjectId }: { message: ChatMessage; subjectId: string | null }) {
  const toast = useToast()
  const saveNote = useAction(async () => {
    await db.create('notes', {
      subjectId,
      title:
        message.contentMd
          .replace(/[#*_`]/g, '')
          .trim()
          .split('\n')[0]
          ?.slice(0, 80) || 'Saved answer',
      bodyMd: message.contentMd,
    })
    toast({ title: 'Saved to notes' })
  })
  const makeCards = useAction(async () => {
    const result = await call('ai:complete', {
      task: 'flashcards',
      prompt: message.contentMd,
      subjectId,
    })
    const cards = parseCards(result.text)
    for (const card of cards)
      await db.create('flashcards', {
        subjectId,
        frontMd: card.front,
        backMd: card.back,
        origin: 'ai',
        due: Date.now(),
      })
    toast({ title: `Made ${cards.length} flashcards`, description: 'They are due for review now.' })
  })

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-lg rounded-br-sm bg-sunken px-3.5 py-2 whitespace-pre-wrap text-ink">
          {message.contentMd}
        </div>
      </div>
    )
  }
  const streaming = message.status === 'streaming'
  return (
    <div className="group flex flex-col gap-1.5">
      {message.contentMd ? (
        <Markdown blocks={streaming ? undefined : CHAT_BLOCKS}>{message.contentMd}</Markdown>
      ) : streaming ? (
        <p className="animate-pulse-soft text-ink-3">Thinking…</p>
      ) : null}
      {message.status === 'error' ? (
        <ErrorState title="The reply stopped">{message.error ?? 'Try again.'}</ErrorState>
      ) : null}
      {message.status === 'cancelled' ? <p className="text-ink-3">Stopped.</p> : null}
      {message.sources.length > 0 && !streaming ? (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {message.sources.map((source) => (
            <Link
              key={source.n}
              to={`/viewer/${source.sourceId}?page=${source.page}`}
              title={source.snippet}
              className="inline-flex h-6 max-w-[260px] items-center gap-1.5 rounded-md bg-hover px-2 text-2xs text-ink-2 hover:bg-active hover:text-ink"
            >
              <span className="font-mono">[{source.n}]</span>
              <span className="truncate">{source.title}</span>
              <span className="shrink-0 text-ink-3">p.{source.page}</span>
            </Link>
          ))}
        </div>
      ) : null}
      {message.status === 'done' ? (
        <div className="flex items-center gap-1 text-ink-3">
          {message.provider ? <Badge>Written by {providerName(message.provider)}</Badge> : null}
          <IconButton
            label="Copy"
            size="sm"
            onClick={() =>
              void navigator.clipboard
                .writeText(message.contentMd)
                .then(() => toast({ title: 'Copied' }))
            }
          >
            <Copy className="size-3.5" aria-hidden />
          </IconButton>
          <IconButton
            label="Save to notes"
            size="sm"
            disabled={saveNote.pending}
            onClick={() => void saveNote.run()}
          >
            <NotebookPen className="size-3.5" aria-hidden />
          </IconButton>
          <IconButton
            label={makeCards.pending ? 'Making flashcards…' : 'Make flashcards'}
            size="sm"
            disabled={makeCards.pending}
            onClick={() => void makeCards.run()}
          >
            <Layers className="size-3.5" aria-hidden />
          </IconButton>
          {makeCards.error || saveNote.error ? (
            <span role="alert" className="text-danger">
              {makeCards.error ?? saveNote.error}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * The assistant: a list of saved chats, specialist agents, and a streaming conversation grounded
 * in the student's own library. Used full-page and inside a subject's Ask tab.
 */
export function ChatView({ subjectId = null }: { subjectId?: string | null }) {
  const [params] = useSearchParams()
  // A chat started elsewhere (the Today page) opens straight away.
  const [activeId, setActiveId] = useState<string | null>(() => params.get('chat'))
  const [loaded, setLoaded] = useState<{ chatId: string | null; items: ChatMessage[] }>({
    chatId: null,
    items: [],
  })
  const [draft, setDraft] = useState('')
  const [agentId, setAgentId] = useState(AUTO_HELPER)
  const bottom = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  const agents = useLive([], () => call('ai:agents'))
  const subject = useLive(
    ['subjects'],
    () => (subjectId ? db.get('subjects', subjectId) : Promise.resolve(null)),
    [subjectId],
  )
  // Helpers grouped by purpose. Inside a subject, the ones made for that kind of subject come
  // first and helpers for other kinds of subject are left out.
  const agentGroups = useMemo(() => {
    const kind = subject.data?.kind
    const groups = new Map<string, AgentInfo[]>()
    for (const item of agents.data ?? []) {
      const made = item.kinds && kind ? item.kinds.includes(kind) : false
      if (subjectId && item.kinds && !made) continue
      const group = made ? `For ${subject.data?.name ?? 'this subject'}` : item.group
      groups.set(group, [...(groups.get(group) ?? []), item])
    }
    return [...groups]
      .map(([group, items]) => ({ group, items }))
      .sort((a, b) => Number(b.group.startsWith('For ')) - Number(a.group.startsWith('For ')))
  }, [agents.data, subject.data, subjectId])
  const chats = useLive(
    ['chats'],
    () =>
      db.list('chats', {
        where: subjectId ? { subjectId } : undefined,
        orderBy: 'updatedAt',
        desc: true,
      }),
    [subjectId],
  )
  const config = useLive(['ai'], () => call('ai:config'))
  const active = useMemo(
    () => chats.data?.find((c) => c.id === activeId) ?? null,
    [chats.data, activeId],
  )
  const agent: AgentInfo | undefined = agents.data?.find((a) => a.id === (active?.agent ?? agentId))
  // A few helpers to start from: the subject's own first, then the everyday ones.
  const suggested = useMemo(() => {
    const everyday = ['tutor', 'solver', 'examiner', 'notes', 'cards', 'exam-maker']
    const own = agentGroups.filter((g) => g.group.startsWith('For ')).flatMap((g) => g.items)
    const rest = everyday
      .map((id) => agents.data?.find((a) => a.id === id))
      .filter((a): a is AgentInfo => !!a && !own.includes(a))
    return [...own, ...rest].slice(0, 6)
  }, [agentGroups, agents.data])
  const helperCount = agentGroups.reduce((n, g) => n + g.items.length, 0)
  const messages = useMemo(
    () => (loaded.chatId === activeId ? loaded.items : []),
    [loaded, activeId],
  )
  const setMessages = useCallback(
    (update: (current: ChatMessage[]) => ChatMessage[], chatId: string | null = activeId) =>
      setLoaded((current) => ({
        chatId,
        items: update(current.chatId === chatId ? current.items : []),
      })),
    [activeId],
  )
  const streaming = messages.some((m) => m.status === 'streaming')

  useEffect(() => {
    if (!activeId) return
    let cancelled = false
    void call('ai:messages', { chatId: activeId }).then((rows) => {
      if (!cancelled) setLoaded({ chatId: activeId, items: rows })
    })
    return () => {
      cancelled = true
    }
  }, [activeId])

  useEffect(
    () =>
      subscribe('ai:delta', ({ chatId, messageId, text }) => {
        if (chatId !== activeId) return
        setMessages((current) =>
          current.map((m) => (m.id === messageId ? { ...m, contentMd: m.contentMd + text } : m)),
        )
      }),
    [activeId, setMessages],
  )
  useEffect(
    () =>
      subscribe('ai:finished', ({ chatId, message }) => {
        changed('chats')
        if (chatId !== activeId) return
        setMessages((current) => current.map((m) => (m.id === message.id ? message : m)))
      }),
    [activeId, setMessages],
  )
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const send = useAction(async () => {
    const content = draft.trim()
    if (!content || streaming) return
    let chatId = activeId
    if (!chatId) {
      const helper =
        agentId === AUTO_HELPER
          ? pickHelper(
              content,
              agentGroups.flatMap((g) => g.items.map((a) => a.id)),
              subject.data?.kind,
            )
          : agentId
      const chat: Chat = await db.create('chats', { subjectId, agent: helper })
      chatId = chat.id
      setActiveId(chat.id)
    }
    setDraft('')
    const { user, assistant } = await call('ai:send', { chatId, content })
    setMessages((current) => [
      ...current.filter((m) => m.id !== user.id && m.id !== assistant.id),
      user,
      assistant,
    ])
    changed('chats')
  })

  const newChat = useCallback((agentChoice?: string) => {
    setActiveId(null)
    if (agentChoice) setAgentId(agentChoice)
    requestAnimationFrame(() => input.current?.focus())
  }, [])

  const noAi = config.data?.defaultProvider === null

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-line">
        <div className="p-3">
          <Button
            className="w-full"
            icon={<Plus className="size-3.5" aria-hidden />}
            onClick={() => newChat()}
          >
            New chat
          </Button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {(chats.data ?? []).length === 0 ? (
            <li className="px-2 py-2 text-ink-3">
              Your chats are saved here so you can read back through them.
            </li>
          ) : null}
          {chats.data?.map((chat) => (
            <li key={chat.id} className="group relative">
              <button
                type="button"
                onClick={() => setActiveId(chat.id)}
                aria-current={chat.id === activeId}
                className="block w-full rounded-md px-2 py-1.5 pr-8 text-left text-ink-2 hover:bg-hover aria-[current=true]:bg-hover aria-[current=true]:text-ink"
              >
                <span className="block truncate font-medium">{chat.title}</span>
                <span className="block truncate text-2xs text-ink-3">
                  {agents.data?.find((a) => a.id === chat.agent)?.name ?? 'Tutor'} ·{' '}
                  {new Date(chat.updatedAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete chat ${chat.title}`}
                onClick={() => {
                  void db.remove('chats', chat.id)
                  if (chat.id === activeId) setActiveId(null)
                }}
                className="absolute top-1.5 right-1 hidden size-6 items-center justify-center rounded-md text-ink-3 group-hover:flex hover:bg-active hover:text-ink focus-visible:flex"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[760px] flex-col gap-5 px-6 py-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center pt-6 text-center">
                <Buddy size={72} mood={streaming ? 'thinking' : 'idle'} />
                <h2 className="mt-4 text-[1.375rem] leading-8 font-semibold tracking-[-0.02em]">
                  What are we working on?
                </h2>
                <p className="mt-1.5 max-w-[48ch] text-ink-2">
                  Pick a helper. Answers use your own AI plan and are grounded in the resources you
                  imported.
                </p>
                {noAi ? (
                  <div className="mt-5 flex items-center gap-3 rounded-lg bg-warn-soft px-4 py-3 text-left text-ink">
                    <span>No AI is connected yet, so the assistant cannot answer.</span>
                    <Link
                      to="/settings?tab=ai"
                      className="shrink-0 font-medium underline underline-offset-2"
                    >
                      Connect AI
                    </Link>
                  </div>
                ) : null}
                <div className="mt-6 w-full text-left">
                  <button
                    type="button"
                    onClick={() => newChat(AUTO_HELPER)}
                    aria-pressed={agentId === AUTO_HELPER}
                    className="flex w-full items-center gap-3 rounded-xl p-3.5 text-left ring-1 ring-line ring-inset hover:bg-sunken aria-pressed:bg-blue-soft aria-pressed:ring-blue-line"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
                      <Wand2 className="size-4" aria-hidden />
                    </span>
                    <span className="flex-1">
                      <span className="block font-semibold text-ink">Auto</span>
                      <span className="block text-2xs text-ink-3">
                        Just ask. Atlas picks the right helper: marking, flashcards, exams, plans
                        and more.
                      </span>
                    </span>
                  </button>
                  <h3 className="mt-5 mb-2 text-2xs font-medium text-ink-3">Or pick one</h3>
                  <div className="grid grid-cols-2 gap-2 min-[1150px]:grid-cols-3">
                    {suggested.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => newChat(item.id)}
                        aria-pressed={item.id === agentId}
                        className="flex items-start gap-2.5 rounded-lg p-3 text-left ring-1 ring-line ring-inset hover:bg-sunken aria-pressed:bg-blue-soft aria-pressed:ring-blue-line"
                      >
                        {createElement(agentIcon(item.icon), {
                          className: 'mt-0.5 size-4 shrink-0 text-ink-2',
                          'aria-hidden': true,
                        })}
                        <span>
                          <span className="block font-medium text-ink">{item.name}</span>
                          <span className="block text-2xs leading-4 text-ink-3">
                            {item.description}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-center text-2xs text-ink-3">
                    All {helperCount} helpers are in the helper menu under the message box.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble key={message.id} message={message} subjectId={subjectId} />
              ))
            )}
            <div ref={bottom} />
          </div>
        </div>

        <div className="mx-auto w-full max-w-[760px] px-6 pb-5">
          {send.error ? (
            <p role="alert" className="mb-2 text-danger">
              {send.error}
            </p>
          ) : null}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void send.run()
            }}
            className="rounded-xl bg-surface p-2 shadow-pop"
          >
            <textarea
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send.run()
                }
              }}
              rows={Math.min(8, Math.max(1, draft.split('\n').length))}
              placeholder={agent?.placeholder ?? 'Ask anything'}
              aria-label="Message"
              className="block w-full resize-none bg-transparent px-2 py-1.5 text-[0.875rem] leading-6 text-ink outline-none placeholder:text-ink-3"
            />
            <div className="flex items-center gap-2 pt-1">
              <HelperPicker
                value={active?.agent ?? agentId}
                groups={agentGroups}
                disabled={Boolean(active)}
                onChange={setAgentId}
              />
              <span className="min-w-0 flex-1 truncate text-2xs text-ink-3">
                {config.data?.defaultProvider
                  ? `Using ${providerName(config.data.defaultProvider)}`
                  : 'No AI connected'}
              </span>
              {streaming ? (
                <button
                  type="button"
                  aria-label="Stop"
                  onClick={() => activeId && void call('ai:cancel', { chatId: activeId })}
                  className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-fg hover:bg-accent-hover"
                >
                  <Square className="size-3.5 fill-current" aria-hidden />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Send"
                  disabled={!draft.trim() || send.pending}
                  className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-40"
                >
                  <ArrowUp className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}

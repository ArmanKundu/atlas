import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, AtSign, Check, Mail, X } from 'lucide-react'
import {
  SPACE_COLORS,
  USERNAME_PATTERN,
  type CommunityStatus,
  type SpaceColor,
} from '@shared/community'
import { Button } from '@/design/Button'
import { Field, Input } from '@/design/Form'
import { changed, useAction, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { CodeInput, type CodeState } from './CodeInput'
import { Avatar } from './SpaceBits'
import { tint } from './spaceStyle'
import { OTP_LENGTH } from './shared-constants'

function suggestUsername(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
}

/**
 * Sign in to the shared library with a code sent by email, then pick a name and @username so
 * friends can find you. Used in onboarding, on the Shared page and in Settings.
 */
export function EmailSignIn({ status, onDone }: { status: CommunityStatus; onDone?: () => void }) {
  if (status.signedIn && !status.profile) return <ProfileSetup status={status} onDone={onDone} />
  if (status.signedIn && status.profile) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-success-soft px-4 py-3">
        <Avatar profile={status.profile} size={34} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{status.profile.displayName}</p>
          <p className="truncate text-2xs text-ink-2">
            @{status.profile.username} · {status.email}
          </p>
        </div>
        <Check className="size-4 text-success" aria-hidden />
      </div>
    )
  }
  return <EmailCode />
}

function EmailCode() {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [state, setState] = useState<CodeState>('idle')
  const [error, setError] = useState<string | null>(null)

  const send = useAction(async (address: string) => {
    await call('shared:sendCode', { email: address })
    setSentTo(address)
    setState('idle')
  })

  const verify = async (code: string): Promise<void> => {
    if (!sentTo) return
    setState('checking')
    setError(null)
    try {
      await call('shared:verifyCode', { email: sentTo, code })
      setState('success')
      window.setTimeout(() => changed('shared'), 900)
    } catch (cause) {
      setState('error')
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  return (
    <AnimatePresence mode="wait" initial={false}>
      {!sentTo ? (
        <motion.form
          key="email"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) void send.run(email.trim().toLowerCase())
          }}
        >
          <Field
            label="Email"
            error={send.error}
            hint="Atlas emails you a code. No password to remember."
          >
            <div className="flex gap-2">
              <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md bg-surface px-2.5 ring-1 ring-line-strong ring-inset focus-within:ring-2 focus-within:ring-focus">
                <Mail className="size-4 text-ink-3" aria-hidden />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
                />
              </label>
              <Button
                type="submit"
                variant="primary"
                className="h-9"
                disabled={!valid || send.pending}
                trailingIcon={<ArrowRight className="size-3.5" aria-hidden />}
              >
                {send.pending ? 'Sending…' : 'Send code'}
              </Button>
            </div>
          </Field>
        </motion.form>
      ) : (
        <motion.div
          key="code"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="flex flex-col items-center gap-2 py-1 text-center"
        >
          <p className="text-ink-2">
            Enter the {OTP_LENGTH}-digit code sent to{' '}
            <span className="font-medium text-ink">{sentTo}</span>
          </p>
          <div className="mt-2">
            <CodeInput
              length={OTP_LENGTH}
              state={state}
              label={`${OTP_LENGTH}-digit code from the email`}
              onChange={() => state === 'error' && setState('idle')}
              onComplete={(code) => void verify(code)}
            />
          </div>
          {state === 'error' && error ? <p className="text-2xs text-ink-3">{error}</p> : null}
          {state !== 'success' ? (
            <div className="flex items-center gap-1 text-2xs">
              <Button
                size="sm"
                variant="ghost"
                disabled={send.pending}
                onClick={() => void send.run(sentTo)}
              >
                {send.pending ? 'Sending…' : 'Send a new code'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSentTo(null)}>
                Use another email
              </Button>
            </div>
          ) : null}
          {send.error ? <p className="text-2xs text-danger">{send.error}</p> : null}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ProfileSetup({ status, onDone }: { status: CommunityStatus; onDone?: () => void }) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [touched, setTouched] = useState(false)
  const [color, setColor] = useState<SpaceColor>('blue')
  const handle = touched ? username : suggestUsername(name)
  const valid = USERNAME_PATTERN.test(handle)
  const free = useLive(
    [],
    () =>
      valid
        ? call('shared:usernameFree', { username: handle })
        : Promise.resolve<boolean | null>(null),
    [handle, valid],
  )
  const save = useAction(async () => {
    await call('shared:saveProfile', {
      displayName: name.trim(),
      username: handle,
      avatarColor: color,
    })
    changed('shared')
    onDone?.()
  })
  const ok = name.trim().length > 0 && valid && free.data === true

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) void save.run()
      }}
    >
      <p className="text-ink-2">
        Signed in as <span className="font-medium text-ink">{status.email}</span>. How should
        friends find you?
      </p>
      <div className="flex items-start gap-4">
        <Avatar profile={{ displayName: name || '?', avatarColor: color }} size={52} />
        <div className="grid flex-1 grid-cols-2 gap-3">
          <Field label="Your name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Alex Chen"
              autoFocus
            />
          </Field>
          <Field
            label="Username"
            error={
              handle && !valid
                ? '3 to 24 letters, numbers or _'
                : free.data === false
                  ? 'That one is taken'
                  : null
            }
            hint={free.data === true ? 'Available' : 'Friends can search for this'}
          >
            <label className="flex h-8 items-center gap-1.5 rounded-md bg-surface px-2.5 ring-1 ring-line-strong ring-inset focus-within:ring-2 focus-within:ring-focus">
              <AtSign className="size-3.5 text-ink-3" aria-hidden />
              <input
                value={handle}
                onChange={(e) => {
                  setTouched(true)
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                }}
                maxLength={24}
                placeholder="alex_chen"
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
              />
              {free.data === true ? (
                <Check className="size-3.5 text-success" aria-hidden />
              ) : free.data === false ? (
                <X className="size-3.5 text-danger" aria-hidden />
              ) : null}
            </label>
          </Field>
        </div>
      </div>
      <div>
        <p className="mb-2 font-medium text-ink">Colour</p>
        <div className="flex gap-2">
          {SPACE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn(
                'size-7 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-surface',
                color === c && 'ring-ink',
              )}
              style={{ background: tint(c)[1] }}
            />
          ))}
        </div>
      </div>
      {save.error ? <p className="text-danger">{save.error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!ok || save.pending}>
          {save.pending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </form>
  )
}

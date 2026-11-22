import { useState } from 'react'
import type { CommunityStatus } from '@shared/community'
import { Button } from '@/design/Button'
import { Field, Input } from '@/design/Form'
import { Segmented } from '@/design/Segmented'
import { ErrorState } from '@/design/States'
import { changed, useAction } from '@/lib/api'
import { useAppState } from '@/lib/app-state'
import { call } from '@/lib/ipc'
import { MascotTile } from '@/mascot/Mascot'

function Panel({
  title,
  intro,
  children,
}: {
  title: string
  intro: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto mt-16 w-[400px] max-w-[calc(100%-2rem)]">
      <div className="mb-6 flex flex-col items-center text-center">
        <MascotTile size={52} />
        <h1 className="mt-4 text-[1.375rem] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        <p className="mt-1.5 text-ink-2">{intro}</p>
      </div>
      <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">{children}</div>
    </div>
  )
}

/** Sign in or create an account for the shared library. Only used for the library. */
export function SharedSignIn() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const submit = useAction(async () => {
    await call(mode === 'signIn' ? 'shared:signIn' : 'shared:signUp', { email, password })
    changed('shared')
  })
  return (
    <Panel
      title="Shared library"
      intro="Notes, files and flashcards your friends share, ready to remix. This is the one part of Atlas that goes online, and only once you sign in."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit.run()
        }}
      >
        <Segmented
          label="Account"
          value={mode}
          onChange={(m) => {
            setMode(m)
            submit.clear()
          }}
          options={[
            { value: 'signIn', label: 'Sign in' },
            { value: 'signUp', label: 'Create account' },
          ]}
        />
        <Field label="Email">
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field
          label="Password"
          hint={
            mode === 'signUp' ? 'At least 6 characters. Only for the shared library.' : undefined
          }
        >
          <Input
            type="password"
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'signUp' ? 6 : 1}
          />
        </Field>
        {submit.error ? <ErrorState title="Not signed in">{submit.error}</ErrorState> : null}
        <Button type="submit" variant="primary" disabled={submit.pending}>
          {submit.pending ? 'One moment…' : mode === 'signIn' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
    </Panel>
  )
}

/** After signing in: the invite code that lets someone into this group's library. */
export function SharedJoin({ status }: { status: CommunityStatus }) {
  const { meta } = useAppState()
  const [code, setCode] = useState('')
  const [name, setName] = useState(meta?.name ?? '')
  const join = useAction(async () => {
    await call('shared:join', { code, name })
    changed('shared')
  })
  const signOut = useAction(async () => {
    await call('shared:signOut')
    changed('shared')
  })
  return (
    <Panel
      title="Enter the library code"
      intro="Ask whoever invited you for the code. It keeps the library to your group."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void join.run()
        }}
      >
        <Field label="Library code">
          <Input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
        </Field>
        <Field label="Your name" hint="Shown on what you share.">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
        </Field>
        {join.error ? <ErrorState title="Not joined">{join.error}</ErrorState> : null}
        <Button type="submit" variant="primary" disabled={join.pending}>
          {join.pending ? 'Joining…' : 'Join'}
        </Button>
        <p className="text-center text-2xs text-ink-3">
          Signed in as {status.email}.{' '}
          <button type="button" className="underline" onClick={() => void signOut.run()}>
            Sign out
          </button>
        </p>
      </form>
    </Panel>
  )
}

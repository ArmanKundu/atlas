import { useState } from 'react'
import { ArrowRight, Lock, Plus } from 'lucide-react'
import { APP_TAGLINE } from '@shared/constants'
import type { ProfileSummary } from '@shared/models'
import { Button } from '@/design/Button'
import { Field, Input } from '@/design/Form'
import { useAction } from '@/lib/api'
import { useAppState } from '@/lib/app-state'
import { call } from '@/lib/ipc'
import { Mascot } from '@/mascot/Mascot'

/**
 * Shown while no profile is open: create the first profile, or pick one and unlock it.
 * Editorial register: warm paper, serif heading.
 */
export function ProfileGate() {
  const { profiles, refreshSession } = useAppState()
  const [creating, setCreating] = useState(profiles.length === 0)
  const [selected, setSelected] = useState<ProfileSummary | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  const create = useAction(async () => {
    await call('profile:create', { name: name.trim(), password: password || undefined })
    await refreshSession()
  })
  const unlock = useAction(async (profile: ProfileSummary, secret?: string) => {
    await call('profile:unlock', { id: profile.id, password: secret })
    await refreshSession()
  })

  return (
    <div className="app-drag flex h-full items-center justify-center bg-paper p-8 text-paper-ink">
      <div className="app-no-drag flex w-full max-w-[420px] flex-col items-center text-center">
        <Mascot
          size={104}
          mood={create.error || unlock.error ? 'concerned' : 'idle'}
          label="The Atlas mascot"
        />
        <p className="eyebrow mt-6 text-paper-ink-2">Atlas</p>
        <h1 className="mt-2 font-serif text-[2rem] leading-[1.12] font-medium tracking-[-0.01em] text-balance">
          {creating
            ? profiles.length === 0
              ? APP_TAGLINE
              : 'New profile'
            : selected
              ? `Welcome back, ${selected.name}`
              : 'Who is studying?'}
        </h1>

        {creating ? (
          <form
            className="mt-7 flex w-full flex-col gap-4 text-left"
            onSubmit={(event) => {
              event.preventDefault()
              if (name.trim()) void create.run()
            }}
          >
            <Field label="Your name">
              <Input
                autoFocus
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder="First name is fine"
              />
            </Field>
            <Field
              label="Password (optional)"
              hint="Asked each time Atlas opens. Leave empty to skip. It cannot be recovered if forgotten."
            >
              <Input
                type="password"
                value={password}
                maxLength={200}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            {create.error ? (
              <p role="alert" className="text-danger">
                {create.error}
              </p>
            ) : null}
            <div className="flex items-center justify-between">
              {profiles.length > 0 ? (
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="submit"
                variant="primary"
                disabled={!name.trim() || create.pending}
                trailingIcon={<ArrowRight className="size-3.5" aria-hidden />}
              >
                Create profile
              </Button>
            </div>
          </form>
        ) : selected ? (
          <form
            className="mt-7 flex w-full flex-col gap-4 text-left"
            onSubmit={(event) => {
              event.preventDefault()
              void unlock.run(selected, password)
            }}
          >
            <Field label="Password" error={unlock.error}>
              <Input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={() => {
                  setSelected(null)
                  setPassword('')
                  unlock.clear()
                }}
              >
                Back
              </Button>
              <Button type="submit" variant="primary" disabled={unlock.pending}>
                Unlock
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-7 flex w-full flex-col gap-2">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() =>
                  profile.hasPassword ? setSelected(profile) : void unlock.run(profile)
                }
                className="flex h-12 items-center justify-between rounded-lg bg-surface px-4 text-left font-medium text-ink shadow-pill hover:bg-sunken"
              >
                {profile.name}
                {profile.hasPassword ? (
                  <Lock className="size-3.5 text-ink-3" aria-label="Password protected" />
                ) : (
                  <ArrowRight className="size-3.5 text-ink-3" aria-hidden />
                )}
              </button>
            ))}
            {unlock.error ? (
              <p role="alert" className="text-danger">
                {unlock.error}
              </p>
            ) : null}
            <Button
              variant="ghost"
              className="mt-2 self-center"
              icon={<Plus className="size-3.5" aria-hidden />}
              onClick={() => setCreating(true)}
            >
              New profile
            </Button>
          </div>
        )}

        <p className="mt-8 text-2xs text-paper-ink-2">
          Everything stays on this computer. No account, no server.
        </p>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import type { UpdateStatus } from '@shared/update'
import { Button, IconButton } from '@/design/Button'
import { changed } from '@/lib/api'
import { useSetting } from '@/lib/settings'
import { call, subscribe } from '@/lib/ipc'

/**
 * A slim bar across the top of the main area when a newer Atlas is published on GitHub.
 * "Update now" first copies everything to Documents/Atlas Backups, then downloads, checks and
 * installs the new version and restarts. "Later" hides it until the next version.
 */
export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useSetting<string | null>('update.dismissed', null)

  useEffect(() => {
    void call('update:status')
      .then(setStatus)
      .catch(() => undefined)
    return subscribe('update:changed', (next) => {
      setStatus(next)
      changed('update')
    })
  }, [])

  if (!status) return null
  const version = 'version' in status ? status.version : null
  if (status.state === 'idle' || status.state === 'checking' || !version) return null
  if ((status.state === 'available' || status.state === 'error') && dismissed === version)
    return null

  const notesLink = (url: string) => (
    <button
      type="button"
      onClick={() => void call('shell:openExternal', { url })}
      className="text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink"
    >
      What’s new
    </button>
  )

  let message: React.ReactNode
  let actions: React.ReactNode = null
  if (status.state === 'available') {
    message = (
      <>
        <span className="font-medium text-ink">Atlas {version} is ready.</span>
        {notesLink(status.url)}
      </>
    )
    actions = (
      <>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(version)}>
          Later
        </Button>
        {status.canInstall ? (
          <Button
            size="sm"
            variant="primary"
            onClick={() => void call('update:install').catch(() => undefined)}
          >
            Update now
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            onClick={() => void call('shell:openExternal', { url: status.url })}
          >
            Download
          </Button>
        )}
      </>
    )
  } else if (status.state === 'backingUp') {
    message = <span className="text-ink">Saving a copy of your data before updating…</span>
  } else if (status.state === 'downloading') {
    message = (
      <span className="flex items-center gap-3 text-ink">
        Downloading Atlas {version}
        <span
          role="progressbar"
          aria-valuenow={status.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Download progress"
          className="h-1.5 w-40 overflow-hidden rounded-full bg-sunken"
        >
          <span
            className="block h-full rounded-full bg-accent transition-[width] duration-200"
            style={{ width: `${status.percent}%` }}
          />
        </span>
        <span className="tabular-nums text-ink-3">{status.percent}%</span>
      </span>
    )
  } else if (status.state === 'installing') {
    message = (
      <span className="text-ink">Installing Atlas {version}. Atlas will reopen in a moment.</span>
    )
  } else {
    message = (
      <span className="text-ink">
        <span className="font-medium">Update didn’t finish.</span>{' '}
        <span className="text-ink-2">{status.message} Your data is untouched.</span>
      </span>
    )
    actions = (
      <>
        <IconButton label="Dismiss" onClick={() => setDismissed(version)}>
          <X className="size-4" aria-hidden />
        </IconButton>
        <Button size="sm" onClick={() => void call('update:check').catch(() => undefined)}>
          Try again
        </Button>
      </>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-blue-soft px-4 text-ui"
    >
      <Sparkles className="size-4 shrink-0 text-blue" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-3 truncate">{message}</div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
    </div>
  )
}

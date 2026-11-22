import { useState } from 'react'
import { Check, Copy, ExternalLink, KeyRound, RefreshCw, Terminal } from 'lucide-react'
import type { ProviderId, ProviderStatus } from '@shared/models'
import { Button } from '@/design/Button'
import { Badge, Input, Select } from '@/design/Form'
import { Skeleton } from '@/design/States'
import { changed, useAction, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { BuiltInModel } from './BuiltInModel'

const GROUPS: { kind: ProviderStatus['kind']; title: string; hint: string }[] = [
  {
    kind: 'subscription',
    title: 'Use a plan you already pay for',
    hint: 'Signs in through the provider’s own app. Atlas never sees your password or tokens.',
  },
  {
    kind: 'api-key',
    title: 'Use your own API key',
    hint: 'The key is stored in this computer’s keychain and used only from here.',
  },
  {
    kind: 'local',
    title: 'Run a model on this computer',
    hint: 'Fully offline. Needs a reasonably fast laptop.',
  },
]

function ProviderCard({
  status,
  isDefault,
  onChanged,
}: {
  status: ProviderStatus
  isDefault: boolean
  onChanged: () => void
}) {
  const [key, setKey] = useState('')
  const [copied, setCopied] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const models = useLive(
    ['ai'],
    () =>
      status.ready && status.kind !== 'subscription'
        ? call('ai:models', { provider: status.id })
        : Promise.resolve([]),
    [status.ready, status.id],
  )

  const saveKey = useAction(async () => {
    await call('ai:setKey', { provider: status.id, key })
    setKey('')
    onChanged()
  })
  const removeKey = useAction(async () => {
    await call('ai:clearKey', { provider: status.id })
    setTestResult(null)
    onChanged()
  })
  const test = useAction(async () => {
    setTestResult(null)
    setTestResult(await call('ai:test', { provider: status.id }))
  })
  const makeDefault = useAction(async () => {
    await call('ai:setConfig', { defaultProvider: status.id })
    onChanged()
  })
  const setModel = async (provider: ProviderId, model: string): Promise<void> => {
    const config = await call('ai:config')
    await call('ai:setConfig', { models: { ...config.models, [provider]: model } })
    onChanged()
  }

  return (
    <div
      className={cn(
        'rounded-lg bg-surface p-4 ring-1 ring-inset',
        isDefault ? 'ring-2 ring-blue' : 'ring-line',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-ink">{status.name}</p>
            {status.ready ? (
              <Badge tone="success">Ready</Badge>
            ) : (
              <Badge>
                {status.kind === 'api-key'
                  ? 'No key'
                  : status.installed
                    ? 'Not ready'
                    : 'Not installed'}
              </Badge>
            )}
            {isDefault ? <Badge tone="blue">In use</Badge> : null}
          </div>
          <p className="mt-0.5 text-ink-2">{status.description}.</p>
          <p className="mt-1 text-ink-3">{status.detail}.</p>
        </div>
        <button
          type="button"
          onClick={() => void call('shell:openExternal', { url: status.termsUrl })}
          className="flex shrink-0 items-center gap-1 rounded-sm text-2xs text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          Terms <ExternalLink className="size-3" aria-hidden />
        </button>
      </div>

      {status.kind === 'api-key' && !status.ready ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (key.trim().length >= 8) void saveKey.run()
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste your API key"
            aria-label={`${status.name}`}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            disabled={key.trim().length < 8 || saveKey.pending}
            icon={<KeyRound className="size-3.5" aria-hidden />}
          >
            Save key
          </Button>
        </form>
      ) : null}

      {!status.installed && status.installHint ? (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-sunken px-3 py-2">
          <code className="min-w-0 flex-1 truncate font-mono text-2xs text-ink-2">
            {status.installHint}
          </code>
          <Button
            size="sm"
            variant="ghost"
            icon={
              copied ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )
            }
            onClick={() => {
              void navigator.clipboard.writeText(status.installHint ?? '')
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {status.kind === 'subscription' && status.installed ? (
          <Button
            size="sm"
            icon={<Terminal className="size-3.5" aria-hidden />}
            onClick={() => void call('ai:login', { provider: status.id })}
          >
            Sign in
          </Button>
        ) : null}
        {status.ready ? (
          <>
            <Button size="sm" disabled={test.pending} onClick={() => void test.run()}>
              {test.pending ? 'Testing…' : 'Test'}
            </Button>
            {isDefault ? null : (
              <Button
                size="sm"
                variant="primary"
                disabled={makeDefault.pending}
                onClick={() => void makeDefault.run()}
              >
                Use this
              </Button>
            )}
          </>
        ) : null}
        {status.kind === 'api-key' && status.ready ? (
          <Button size="sm" variant="ghost" onClick={() => void removeKey.run()}>
            Remove key
          </Button>
        ) : null}
        {!status.ready && status.kind !== 'api-key' ? (
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw className="size-3.5" aria-hidden />}
            onClick={onChanged}
          >
            Check again
          </Button>
        ) : null}
        {status.ready && (models.data?.length ?? 0) > 0 ? (
          <Select
            aria-label={`Model for ${status.name}`}
            className="h-7 w-auto max-w-[240px] text-2xs"
            value={status.model ?? ''}
            onChange={(e) => void setModel(status.id, e.target.value)}
          >
            <option value="">Default model</option>
            {models.data?.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {saveKey.error || removeKey.error || makeDefault.error ? (
        <p role="alert" className="mt-2 text-danger">
          {saveKey.error ?? removeKey.error ?? makeDefault.error}
        </p>
      ) : null}
      {testResult ? (
        <p role="status" className={cn('mt-2', testResult.ok ? 'text-success' : 'text-danger')}>
          {testResult.message}
        </p>
      ) : null}
    </div>
  )
}

/** Connect AI: provider cards with live status, keys, sign-in, model choice and a test button. */
export function AiProviders() {
  const status = useLive(['ai'], () => call('ai:status'))
  const config = useLive(['ai'], () => call('ai:config'))
  const refresh = (): void => changed('ai')

  if (!status.data || !config.data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    )
  }
  const current = config.data.defaultProvider

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-2">
        AI in Atlas runs on your own plan or key. Nothing goes through a server of ours, and every
        feature that does not need AI works without it.
      </p>
      <BuiltInModel config={config.data} />
      {GROUPS.map((group) => (
        <section key={group.kind}>
          <h3 className="font-semibold text-ink">{group.title}</h3>
          <p className="mt-0.5 mb-3 text-ink-3">{group.hint}</p>
          <div className="grid grid-cols-1 gap-3 min-[1180px]:grid-cols-2">
            {status.data
              ?.filter((s) => s.kind === group.kind && s.id !== 'atlas-local')
              .map((s) => (
                <ProviderCard
                  key={s.id}
                  status={s}
                  isDefault={current === s.id}
                  onChanged={refresh}
                />
              ))}
          </div>
        </section>
      ))}
      <section className="flex items-center justify-between gap-4 rounded-lg bg-sunken px-4 py-3">
        <div>
          <p className="font-semibold text-ink">No AI</p>
          <p className="text-ink-2">
            Use Atlas as an organiser only. You can connect a provider any time.
          </p>
        </div>
        {current === null ? (
          <Badge>In use</Badge>
        ) : (
          <Button
            size="sm"
            onClick={() => void call('ai:setConfig', { defaultProvider: null }).then(refresh)}
          >
            Turn AI off
          </Button>
        )}
      </section>
    </div>
  )
}

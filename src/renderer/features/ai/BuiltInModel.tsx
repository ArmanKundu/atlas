import { useEffect } from 'react'
import { Check, Cpu, Download, Trash2, X } from 'lucide-react'
import type { AiConfig } from '@shared/models'
import { formatBytes } from '@shared/community'
import { Button } from '@/design/Button'
import { Badge } from '@/design/Form'
import { changed, useAction, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call, subscribe } from '@/lib/ipc'

/**
 * Atlas built-in: download a small open model once, then chat, make notes, flashcards and exams
 * with no account, no limits and no internet. Weaker than Claude, but free and private.
 */
export function BuiltInModel({ config }: { config: AiConfig }) {
  const models = useLive(['ai', 'localai'], () => call('localai:list'))
  const inUse = config.defaultProvider === 'atlas-local'
  const chosen = config.models['atlas-local'] ?? null

  useEffect(
    () =>
      subscribe('models:progress', (p) => {
        if (!p.id.startsWith('llm:')) return
        if (p.state === 'downloading') void models.reload()
        else changed('ai', 'localai')
      }),
    [models],
  )

  const act = useAction(async (work: () => Promise<unknown>) => {
    await work()
    changed('ai', 'localai')
  })
  const use = (id: string): Promise<unknown> =>
    call('ai:setConfig', {
      defaultProvider: 'atlas-local',
      models: { ...config.models, 'atlas-local': id },
    })

  return (
    <section className="rounded-xl p-4 ring-1 ring-line">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg">
          <Cpu className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-ink">Atlas built-in</h3>
            {inUse ? <Badge>In use</Badge> : null}
          </div>
          <p className="text-ink-2">
            A small open model that runs inside Atlas. Free, unlimited and offline once downloaded.
            It can read your notes and resources and make notes, flashcards and exams, just less
            sharply than Claude.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {(models.data ?? []).map((m) => {
          const pct = m.downloading?.total
            ? Math.round((m.downloading.loaded / m.downloading.total) * 100)
            : null
          const active = inUse && (chosen ?? (m.installed ? m.id : null)) === m.id
          return (
            <div
              key={m.id}
              className={cn(
                'relative flex items-center gap-3 overflow-hidden rounded-lg bg-sunken px-3 py-2.5',
                active && 'ring-2 ring-blue-line',
              )}
            >
              {pct !== null ? (
                <span
                  className="absolute inset-y-0 left-0 bg-blue-soft transition-[width]"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
              ) : null}
              <div className="relative min-w-0 flex-1">
                <p className="font-medium text-ink">
                  {m.name} <span className="font-normal text-ink-3">· {formatBytes(m.size)}</span>
                </p>
                <p className="truncate text-2xs text-ink-3">
                  {pct !== null ? `Downloading… ${pct}%` : m.detail}
                </p>
              </div>
              <div className="relative flex items-center gap-1">
                {m.downloading ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<X className="size-3.5" aria-hidden />}
                    onClick={() => void act.run(() => call('localai:cancel', { id: m.id }))}
                  >
                    Cancel
                  </Button>
                ) : m.installed ? (
                  <>
                    {active ? (
                      <span className="flex items-center gap-1 px-2 text-2xs font-medium text-success">
                        <Check className="size-3.5" aria-hidden /> Using
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => void act.run(() => use(m.id))}
                      >
                        Use
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete the ${m.name} model`}
                      icon={<Trash2 className="size-3.5" aria-hidden />}
                      onClick={() => void act.run(() => call('localai:remove', { id: m.id }))}
                    />
                  </>
                ) : (
                  <Button
                    size="sm"
                    icon={<Download className="size-3.5" aria-hidden />}
                    onClick={() =>
                      void act.run(async () => {
                        const start = call('localai:download', { id: m.id })
                        await models.reload()
                        await start
                        await use(m.id)
                      })
                    }
                  >
                    Download
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {act.error ? <p className="mt-2 text-2xs text-danger">{act.error}</p> : null}
    </section>
  )
}

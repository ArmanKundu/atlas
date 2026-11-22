import { createElement, useState } from 'react'
import { Popover } from 'radix-ui'
import { Check, ChevronDown, Search, Wand2 } from 'lucide-react'
import type { AgentInfo } from '@shared/models'
import { AUTO_HELPER } from '@shared/helper-pick'
import { cn } from '@/lib/cn'
import { agentIcon } from './agents'

export interface HelperGroup {
  group: string
  items: AgentInfo[]
}

/**
 * Chooses the assistant's helper. Auto sits on top and picks for you; the rest are grouped by
 * purpose with a search box, so thirty helpers stay easy to scan.
 */
export function HelperPicker({
  value,
  groups,
  onChange,
  disabled,
  picked,
}: {
  value: string
  groups: HelperGroup[]
  onChange: (id: string) => void
  disabled?: boolean
  /** In Auto mode, the helper Auto chose for this chat. */
  picked?: AgentInfo
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const all = groups.flatMap((g) => g.items)
  const current = all.find((a) => a.id === value)
  const needle = q.trim().toLowerCase()
  const shown = groups
    .map((g) => ({
      group: g.group,
      items: g.items.filter(
        (a) => !needle || `${a.name} ${a.description} ${g.group}`.toLowerCase().includes(needle),
      ),
    }))
    .filter((g) => g.items.length > 0)

  const choose = (id: string): void => {
    onChange(id)
    setOpen(false)
    setQ('')
  }

  const label =
    value === AUTO_HELPER ? (picked ? `Auto · ${picked.name}` : 'Auto') : (current?.name ?? 'Tutor')
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label="Helper"
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-md bg-hover px-2 text-2xs font-medium text-ink-2 hover:text-ink',
            disabled && 'opacity-70',
          )}
        >
          {value === AUTO_HELPER ? (
            <Wand2 className="size-3.5" aria-hidden />
          ) : current ? (
            createElement(agentIcon(current.icon), { className: 'size-3.5', 'aria-hidden': true })
          ) : null}
          <span className="max-w-[180px] truncate">{label}</span>
          {disabled ? null : <ChevronDown className="size-3 text-ink-3" aria-hidden />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          className="animate-fade z-50 flex max-h-[min(520px,70vh)] w-[340px] flex-col overflow-hidden rounded-xl bg-surface shadow-dialog ring-1 ring-line"
        >
          <label className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search className="size-3.5 text-ink-3" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a helper"
              className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {!needle ? (
              <Row
                selected={value === AUTO_HELPER}
                onClick={() => choose(AUTO_HELPER)}
                icon={<Wand2 className="size-4" aria-hidden />}
                name="Auto"
                description="Picks the right helper from what you ask"
                accent
              />
            ) : null}
            {shown.map((g) => (
              <div key={g.group} className="mt-1.5">
                <p className="px-2 pt-1 pb-1 text-[0.6875rem] font-medium tracking-wide text-ink-3 uppercase">
                  {g.group}
                </p>
                {g.items.map((a) => (
                  <Row
                    key={a.id}
                    selected={a.id === value}
                    onClick={() => choose(a.id)}
                    icon={createElement(agentIcon(a.icon), {
                      className: 'size-4',
                      'aria-hidden': true,
                    })}
                    name={a.name}
                    description={a.description}
                  />
                ))}
              </div>
            ))}
            {shown.length === 0 ? (
              <p className="px-3 py-6 text-center text-2xs text-ink-3">No helper matches.</p>
            ) : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function Row({
  selected,
  onClick,
  icon,
  name,
  description,
  accent,
}: {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  name: string
  description: string
  accent?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover aria-pressed:bg-blue-soft"
    >
      <span
        className={cn(
          'mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-ink-2',
          accent ? 'bg-accent text-accent-fg' : 'bg-sunken',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-ink">{name}</span>
        <span className="block truncate text-2xs text-ink-3">{description}</span>
      </span>
      {selected ? <Check className="mt-1 size-3.5 text-blue" aria-hidden /> : null}
    </button>
  )
}

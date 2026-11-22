import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Popover } from 'radix-ui'
import { ChevronDown, Globe, Lock } from 'lucide-react'
import {
  SPACE_BANNERS,
  SPACE_COLORS,
  SPACE_ICONS,
  type Space,
  type SpaceBanner,
  type SpaceColor,
  type SpaceIcon,
  type SpaceInput,
} from '@shared/community'
import { Button } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Field, Input, Textarea } from '@/design/Form'
import { Segmented } from '@/design/Segmented'
import { ErrorState } from '@/design/States'
import { useToast } from '@/design/Toast'
import { changed, useAction } from '@/lib/api'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { SpaceTile } from './SpaceBits'
import { SPACE_BANNER, SPACE_ICON, banner, tint } from './spaceStyle'

type Visibility = 'private' | 'public'

const PRIVATE = { value: 'private' as const, label: 'Private', Icon: Lock }
const PUBLIC = { value: 'public' as const, label: 'Public', Icon: Globe }

/** The Private / Public pill: a popover with a two-way switch rises above it. */
function PrivacyPill({
  value,
  onChange,
}: {
  value: Visibility
  onChange: (value: Visibility) => void
}) {
  const [open, setOpen] = useState(false)
  const options = [PRIVATE, PUBLIC]
  const current = value === 'public' ? PUBLIC : PRIVATE
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Who can join: ${current.label}`}
          className="flex h-9 items-center gap-2 rounded-full bg-surface px-3.5 font-medium text-ink shadow-pill ring-1 ring-line hover:bg-sunken"
        >
          <current.Icon className="size-4" aria-hidden />
          {current.label}
          <ChevronDown
            className={cn('size-3.5 text-ink-3 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </Popover.Trigger>
      <AnimatePresence>
        {open ? (
          <Popover.Portal forceMount>
            <Popover.Content side="top" sideOffset={10} forceMount asChild>
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 520, damping: 32 }}
                className="z-[60] flex flex-col items-center"
              >
                <div
                  role="radiogroup"
                  aria-label="Who can join"
                  className="flex gap-1 rounded-full bg-surface p-1 shadow-pop ring-1 ring-line"
                >
                  {options.map(({ value: v, label, Icon }) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={value === v}
                      onClick={() => {
                        onChange(v)
                        setOpen(false)
                      }}
                      className={cn(
                        'relative flex h-8 items-center gap-1.5 rounded-full px-3 text-ink-3',
                        value === v && 'font-semibold text-ink',
                      )}
                    >
                      {value === v ? (
                        <motion.span
                          layoutId="privacy-pill"
                          className="absolute inset-0 rounded-full bg-sunken"
                        />
                      ) : null}
                      <Icon className="relative size-4" aria-hidden />
                      <span className="relative">{label}</span>
                    </button>
                  ))}
                </div>
                <span aria-hidden className="h-2.5 w-0.5 rounded-full bg-line-strong" />
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        ) : null}
      </AnimatePresence>
    </Popover.Root>
  )
}

const BLANK: Required<SpaceInput> = {
  name: '',
  description: '',
  icon: 'book-open',
  color: 'blue',
  banner: 'sky',
  visibility: 'private',
  requireApproval: true,
  defaultRole: 'viewer',
}

function fromSpace(space: Space): Required<SpaceInput> {
  return {
    name: space.name,
    description: space.description,
    icon: space.icon as SpaceIcon,
    color: space.color as SpaceColor,
    banner: space.banner as SpaceBanner,
    visibility: space.visibility,
    requireApproval: space.requireApproval,
    defaultRole: space.defaultRole,
  }
}

/** Make a space, or change one you own or run. */
export function SpaceDialog({
  open,
  onOpenChange,
  space,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing this space; omit to make a new one. */
  space?: Space | null
  onCreated?: (space: Space) => void
}) {
  const toast = useToast()
  const [form, setForm] = useState<Required<SpaceInput>>(() => (space ? fromSpace(space) : BLANK))
  const set = <K extends keyof SpaceInput>(key: K, value: Required<SpaceInput>[K]): void =>
    setForm((f) => ({ ...f, [key]: value }))

  // Fresh form each time it opens (the parent opens it, so Radix sends no open event).
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setForm(space ? fromSpace(space) : BLANK)
  }

  const save = useAction(async () => {
    if (space) {
      await call('shared:updateSpace', { id: space.id, ...form })
      toast({ title: 'Space saved', tone: 'success' })
    } else {
      const made = await call('shared:createSpace', form)
      toast({
        title: `${made.name} is ready`,
        description: 'Invite people, or share the join code.',
        tone: 'success',
      })
      onCreated?.(made)
    }
    changed('shared')
    onOpenChange(false)
  })

  const [, fg] = tint(form.color)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) save.clear()
        onOpenChange(next)
      }}
      title={space ? 'Space settings' : 'Create a space'}
      description={space ? undefined : 'A small community for a class, a subject or a study group.'}
      width={560}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!form.name.trim() || save.pending}
            onClick={() => void save.run()}
          >
            {save.pending ? 'Saving…' : space ? 'Save' : 'Create space'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="overflow-hidden rounded-xl ring-1 ring-line">
          <div className="h-20" style={{ background: banner(form.banner) }} />
          <div className="flex items-end gap-3 bg-surface px-4 pb-3">
            <SpaceTile
              icon={form.icon}
              color={form.color}
              size={52}
              className="-mt-7 shadow-pill ring-4 ring-surface"
            />
            <div className="min-w-0 pb-0.5">
              <p className="truncate font-semibold text-ink">{form.name || 'Your space'}</p>
              <p className="truncate text-2xs text-ink-3">
                {form.visibility === 'public' ? 'Anyone with the code joins' : 'Private'} ·{' '}
                {form.description || 'No description yet'}
              </p>
            </div>
          </div>
        </div>

        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            maxLength={60}
            placeholder="Methods study group"
            autoFocus
          />
        </Field>
        <Field label="Description" hint="Optional">
          <Textarea
            rows={2}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            maxLength={500}
            placeholder="What it is for and who it is for"
          />
        </Field>

        <div>
          <p className="mb-2 font-medium text-ink">Icon</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
            {SPACE_ICONS.map((name) => {
              const Icon = SPACE_ICON[name]
              const on = form.icon === name
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={name.replace('-', ' ')}
                  onClick={() => set('icon', name)}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-lg text-ink-2 ring-1 ring-line ring-inset hover:bg-hover',
                    on && 'ring-2 ring-ink',
                  )}
                  style={on ? { color: fg } : undefined}
                >
                  <Icon className="size-4" aria-hidden />
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-2 font-medium text-ink">Colour</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Colour">
              {SPACE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={form.color === c}
                  aria-label={c}
                  onClick={() => set('color', c)}
                  className={cn(
                    'size-7 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-surface',
                    form.color === c && 'ring-ink',
                  )}
                  style={{ background: tint(c)[1] }}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 font-medium text-ink">Banner</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Banner">
              {SPACE_BANNERS.map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={form.banner === b}
                  aria-label={SPACE_BANNER[b].label}
                  onClick={() => set('banner', b)}
                  className={cn(
                    'h-7 w-9 rounded-md ring-1 ring-line ring-offset-2 ring-offset-surface',
                    form.banner === b && 'ring-2 ring-ink',
                  )}
                  style={{ background: SPACE_BANNER[b].css }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-xl bg-sunken p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="font-medium text-ink">Who can join</p>
              <p className="text-2xs text-ink-3">
                {form.visibility === 'private'
                  ? 'People you invite, or who enter the code and are approved.'
                  : 'Anyone with the join code gets straight in.'}
              </p>
            </div>
            <PrivacyPill value={form.visibility} onChange={(v) => set('visibility', v)} />
          </div>
          {form.visibility === 'private' ? (
            <label className="flex items-center gap-3">
              <span className="flex-1">
                <span className="block font-medium text-ink">Approve people who use the code</span>
                <span className="block text-2xs text-ink-3">
                  You get a request in your inbox and choose approve or decline.
                </span>
              </span>
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-accent)]"
                checked={form.requireApproval}
                onChange={(e) => set('requireApproval', e.target.checked)}
              />
            </label>
          ) : null}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="font-medium text-ink">New people start as</p>
              <p className="text-2xs text-ink-3">
                {form.defaultRole === 'viewer'
                  ? 'Viewers browse, react and save copies.'
                  : 'Editors can also share their own things.'}
              </p>
            </div>
            <Segmented
              label="New people start as"
              value={form.defaultRole}
              onChange={(v) => set('defaultRole', v)}
              options={[
                { value: 'viewer', label: 'Viewer' },
                { value: 'editor', label: 'Editor' },
              ]}
            />
          </div>
        </div>
        {save.error ? <ErrorState title="Not saved">{save.error}</ErrorState> : null}
      </div>
    </Dialog>
  )
}

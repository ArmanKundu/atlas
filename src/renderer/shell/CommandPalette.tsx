import { useMemo, useState } from 'react'
import { Command as Cmdk } from 'cmdk'
import { Dialog } from 'radix-ui'
import { Search } from 'lucide-react'
import { Kbd } from '@/design/Kbd'
import { groupCommands, useCommands, type Command } from './commands'

/**
 * Command palette (⌘K / Ctrl K). Phase 1 lists navigation and appearance commands; search across
 * questions, pages, notes, cards and topics plugs into the same list once the database exists.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const commands = useCommands()
  const groups = useMemo(() => groupCommands(commands), [commands])
  const [query, setQuery] = useState('')

  const close = (): void => {
    onOpenChange(false)
    setQuery('')
  }

  const run = (command: Command): void => {
    close()
    command.run()
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true)
        else close()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-40 bg-scrim" />
        <Dialog.Content
          aria-describedby={undefined}
          className="animate-rise fixed top-[16vh] left-1/2 z-50 w-[min(600px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl bg-surface shadow-dialog outline-none"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Cmdk label="Command palette" loop>
            <div className="flex h-12 items-center gap-2.5 border-b border-line px-4">
              <Search className="size-4 shrink-0 text-ink-3" aria-hidden />
              <Cmdk.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search or run a command"
                className="h-full min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink outline-none placeholder:text-ink-3"
              />
              <Kbd>esc</Kbd>
            </div>
            <Cmdk.List className="max-h-[min(380px,50vh)] scroll-py-2 overflow-y-auto p-2">
              <Cmdk.Empty className="px-3 py-8 text-center text-ink-2">
                Nothing matches “{query}”. Try a shorter search.
              </Cmdk.Empty>
              {groups.map(({ group, commands: items }) => (
                <Cmdk.Group
                  key={group}
                  heading={group}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-3"
                >
                  {items.map((command) => (
                    <Cmdk.Item
                      key={command.id}
                      value={`${command.title} ${command.id}`}
                      keywords={command.keywords}
                      onSelect={() => run(command)}
                      className="flex h-9 items-center gap-2.5 rounded-md px-2 text-ink-2 select-none data-[selected=true]:bg-hover data-[selected=true]:text-ink"
                    >
                      {command.icon ? (
                        <command.icon className="size-4 shrink-0" aria-hidden />
                      ) : (
                        <span className="size-4 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{command.title}</span>
                      {command.shortcut ? <Kbd>{command.shortcut}</Kbd> : null}
                    </Cmdk.Item>
                  ))}
                </Cmdk.Group>
              ))}
            </Cmdk.List>
            <div className="flex h-9 items-center gap-4 border-t border-line px-4 text-2xs text-ink-3 select-none">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> to move
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd> to run
              </span>
            </div>
          </Cmdk>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

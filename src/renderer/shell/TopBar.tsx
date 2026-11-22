import { Fragment } from 'react'
import { Link, useMatches } from 'react-router'
import { ChevronRight, Gift, PanelLeft, Search, Sparkles, Timer } from 'lucide-react'
import { IconButton } from '@/design/Button'
import { Kbd } from '@/design/Kbd'
import { Tooltip } from '@/design/Tooltip'
import { providerName } from '@/features/ai/names'
import { formatClock, useTimer } from '@/features/timer/TimerProvider'
import { useLive } from '@/lib/api'
import { useAppState, useSubjects } from '@/lib/app-state'
import { cn } from '@/lib/cn'
import { call, platform } from '@/lib/ipc'
import { isMac, modKey } from '@/lib/keys'
import { MascotTile } from '@/mascot/Mascot'
import type { MascotAccessory, MascotColour } from '@/mascot/options'

interface Crumb {
  label: string
  to: string
}

function hasCrumb(handle: unknown): handle is { crumb: string } {
  return (
    typeof handle === 'object' &&
    handle !== null &&
    typeof (handle as { crumb?: unknown }).crumb === 'string'
  )
}

function useCrumbs(): Crumb[] {
  const subjects = useSubjects()
  return useMatches().flatMap((match) => {
    if (!hasCrumb(match.handle)) return []
    // A subject page is named after the subject, not after the kind of page.
    const subject = subjects.find((s) => s.id === match.params['subjectId'])
    return [{ label: subject?.name ?? match.handle.crumb, to: match.pathname }]
  })
}

/**
 * Top bar: sidebar toggle and the page name on the left; on the right the AI status, search,
 * the timer, a shortcut to the assistant and the profile.
 */
export function TopBar({
  sidebarCollapsed,
  onToggleSidebar,
  onOpenPalette,
  onOpenWhatsNew,
}: {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  onOpenPalette: () => void
  onOpenWhatsNew: () => void
}) {
  const crumbs = useCrumbs()
  const timer = useTimer()
  const { meta } = useAppState()
  const config = useLive(['ai'], () => call('ai:config'))
  const provider = config.data?.defaultProvider ?? null
  const clock = formatClock(
    timer.mode === 'focus' && timer.active
      ? Math.max(0, timer.target - timer.elapsed)
      : timer.elapsed,
  )
  // Windows draws its window buttons over the right end of the bar.
  const reserveRight = platform() === 'win32'

  return (
    <header
      className={cn(
        'app-drag flex h-[var(--atlas-topbar-h)] shrink-0 items-center gap-1.5 border-b border-line bg-surface pr-3',
        sidebarCollapsed && isMac() ? 'pl-8' : 'pl-2',
        reserveRight && 'pr-[148px]',
      )}
    >
      <IconButton
        label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        shortcut={modKey('\\')}
        onClick={onToggleSidebar}
        className="app-no-drag"
      >
        <PanelLeft className="size-4" aria-hidden />
      </IconButton>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1 pl-1">
        <ol className="flex items-center gap-1 text-ink-3 select-none">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1
            return (
              <Fragment key={crumb.to}>
                {index > 0 ? (
                  <li aria-hidden>
                    <ChevronRight className="size-3.5" />
                  </li>
                ) : null}
                <li className="min-w-0">
                  {last ? (
                    <span
                      aria-current="page"
                      className="block truncate text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink"
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      to={crumb.to}
                      className="app-no-drag block truncate rounded-sm hover:text-ink"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              </Fragment>
            )
          })}
        </ol>
      </nav>

      <IconButton label="What’s new" onClick={onOpenWhatsNew} className="app-no-drag">
        <Gift className="size-4" aria-hidden />
      </IconButton>

      <Tooltip
        label={provider ? 'AI is connected. Open AI settings' : 'No AI connected. Open AI settings'}
      >
        <Link
          to="/settings?tab=ai"
          className="app-no-drag flex h-8 items-center gap-1.5 rounded-md px-2 text-ink-2 select-none hover:bg-hover hover:text-ink"
        >
          <span
            aria-hidden
            className={cn('size-1.5 rounded-full', provider ? 'bg-success' : 'bg-line-strong')}
          />
          {provider ? providerName(provider) : 'No AI'}
        </Link>
      </Tooltip>

      <button
        type="button"
        onClick={onOpenPalette}
        className="app-no-drag flex h-8 items-center gap-2 rounded-md px-2 text-ink-2 select-none hover:bg-hover hover:text-ink"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="max-[1100px]:hidden">Search</span>
        <Kbd>{modKey('K')}</Kbd>
      </button>

      <Tooltip label={timer.active ? 'Open the timer' : 'Start a focus session'}>
        <Link
          to="/timer"
          aria-label={
            timer.running
              ? `Timer running, ${clock}`
              : timer.active
                ? `Timer paused, ${clock}`
                : 'Timer, not running'
          }
          className={cn(
            'app-no-drag flex h-8 items-center gap-1.5 rounded-md px-2 font-medium tabular-nums select-none',
            timer.running ? 'bg-accent text-accent-fg' : 'text-ink-2 hover:bg-hover hover:text-ink',
          )}
        >
          <Timer className="size-4" aria-hidden />
          {clock}
        </Link>
      </Tooltip>

      <Link
        to="/assistant"
        className="app-no-drag ml-1 flex h-8 items-center gap-1.5 rounded-md bg-surface px-2.5 font-medium text-ink ring-1 ring-line-strong ring-inset select-none hover:bg-sunken"
      >
        <Sparkles className="size-4" aria-hidden />
        Ask
      </Link>

      <Tooltip label="Profile and settings">
        <Link
          to="/settings"
          aria-label="Profile and settings"
          className="app-no-drag ml-1 rounded-md"
        >
          <MascotTile
            size={28}
            colour={(meta?.avatarColour ?? 'ink') as MascotColour}
            accessory={(meta?.avatarAccessory ?? 'none') as MascotAccessory}
          />
        </Link>
      </Tooltip>
    </header>
  )
}

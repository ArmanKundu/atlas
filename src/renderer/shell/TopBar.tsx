import { Fragment } from 'react'
import { Link, useMatches } from 'react-router'
import { ChevronRight, PanelLeft, Search, Timer } from 'lucide-react'
import { IconButton } from '@/design/Button'
import { Kbd } from '@/design/Kbd'
import { Tooltip } from '@/design/Tooltip'
import { cn } from '@/lib/cn'
import { isMac, modKey } from '@/lib/keys'
import { platform } from '@/lib/ipc'

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
  return useMatches().flatMap((match) =>
    hasCrumb(match.handle) ? [{ label: match.handle.crumb, to: match.pathname }] : [],
  )
}

/** Top bar: sidebar toggle, breadcrumbs, the command palette trigger and the timer pill. */
export function TopBar({
  sidebarCollapsed,
  onToggleSidebar,
  onOpenPalette,
}: {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  onOpenPalette: () => void
}) {
  const crumbs = useCrumbs()
  // Windows draws its window buttons over the right end of the bar.
  const reserveRight = platform() === 'win32'

  return (
    <header
      className={cn(
        'app-drag flex h-[var(--atlas-topbar-h)] shrink-0 items-center gap-2 pr-3',
        sidebarCollapsed && isMac() ? 'pl-7' : 'pl-1',
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

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1 text-ink-2 select-none">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1
            return (
              <Fragment key={crumb.to}>
                {index > 0 ? (
                  <li aria-hidden className="text-ink-3">
                    <ChevronRight className="size-3.5" />
                  </li>
                ) : null}
                <li className="min-w-0">
                  {last ? (
                    <span aria-current="page" className="block truncate font-medium text-ink">
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

      <button
        type="button"
        onClick={onOpenPalette}
        className="app-no-drag flex h-8 w-[240px] items-center gap-2 rounded-full bg-hover px-3 text-ink-3 select-none hover:bg-active hover:text-ink-2 max-[1100px]:w-[180px]"
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">Search or run a command</span>
        <Kbd>{modKey('K')}</Kbd>
      </button>

      <Tooltip label="Open the timer">
        <Link
          to="/timer"
          aria-label="Timer, not running"
          className="app-no-drag flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 font-medium text-ink-2 tabular-nums shadow-pill select-none hover:text-ink"
        >
          <Timer className="size-3.5" aria-hidden />
          0:00
        </Link>
      </Tooltip>
    </header>
  )
}

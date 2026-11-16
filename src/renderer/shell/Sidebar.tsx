import { NavLink } from 'react-router'
import { Plus, Search } from 'lucide-react'
import type { Subject } from '@shared/models'
import { SubjectDot } from '@/design/Form'
import { Kbd } from '@/design/Kbd'
import { Tooltip } from '@/design/Tooltip'
import { useAppState, useSubjects } from '@/lib/app-state'
import { cn } from '@/lib/cn'
import { isMac, modKey } from '@/lib/keys'
import { MascotTile } from '@/mascot/Mascot'
import type { MascotAccessory, MascotColour } from '@/mascot/options'
import { NAV_SETTINGS, NAV_TODAY, NAV_TOOLS, type NavItem } from './nav'

const linkClass =
  (collapsed: boolean) =>
  ({ isActive }: { isActive: boolean }): string =>
    cn(
      'flex h-8 items-center gap-2.5 rounded-md text-ink-2 select-none',
      'transition-colors duration-150 ease-out hover:bg-hover hover:text-ink',
      collapsed ? 'w-8 justify-center' : 'px-2',
      isActive && 'bg-active font-medium text-ink hover:bg-active',
    )

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const link = (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      aria-label={collapsed ? item.label : undefined}
      className={linkClass(collapsed)}
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </NavLink>
  )
  return collapsed ? (
    <Tooltip label={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}

function SubjectLink({ subject, collapsed }: { subject: Subject; collapsed: boolean }) {
  const link = (
    <NavLink
      to={`/subjects/${subject.id}`}
      aria-label={collapsed ? subject.name : undefined}
      className={linkClass(collapsed)}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <SubjectDot colour={subject.colour} className="size-2.5" />
      </span>
      {collapsed ? null : <span className="truncate">{subject.name}</span>}
    </NavLink>
  )
  return collapsed ? (
    <Tooltip label={subject.name} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}

function SectionLabel({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 pt-4 pb-1">
      <p className="text-2xs font-medium text-ink-3 select-none">{children}</p>
      {action}
    </div>
  )
}

/** Left sidebar (reference 4): profile, search, Today, subjects, tools, Settings. */
export function Sidebar({
  collapsed,
  onOpenPalette,
}: {
  collapsed: boolean
  onOpenPalette: () => void
}) {
  const mac = isMac()
  const { meta } = useAppState()
  const subjects = useSubjects()

  return (
    <nav
      aria-label="Main"
      className={cn(
        'flex h-full shrink-0 flex-col bg-canvas transition-[width] duration-200 ease-out',
        collapsed ? 'w-[var(--atlas-sidebar-rail-w)]' : 'w-[var(--atlas-sidebar-w)]',
      )}
    >
      {/* Header row doubles as the window drag area. macOS keeps its traffic lights here. */}
      <div
        className={cn(
          'app-drag flex h-[var(--atlas-topbar-h)] shrink-0 items-center gap-2',
          collapsed ? 'justify-center' : mac ? 'pr-3 pl-[84px]' : 'px-3',
        )}
      >
        {collapsed && mac ? null : (
          <>
            <MascotTile
              size={24}
              colour={(meta?.avatarColour ?? 'ink') as MascotColour}
              accessory={(meta?.avatarAccessory ?? 'none') as MascotAccessory}
            />
            {collapsed ? null : (
              <span className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink select-none">
                {meta?.name ?? 'Atlas'}
              </span>
            )}
          </>
        )}
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto pb-3',
          collapsed ? 'items-center px-0' : 'px-3',
        )}
      >
        {collapsed ? (
          <Tooltip label="Search" shortcut={modKey('K')} side="right">
            <button
              type="button"
              aria-label="Search"
              onClick={onOpenPalette}
              className="mb-1 flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-hover hover:text-ink"
            >
              <Search className="size-4" aria-hidden />
            </button>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={onOpenPalette}
            className="mb-2 flex h-8 w-full shrink-0 items-center gap-2.5 rounded-md bg-hover px-2 text-ink-3 select-none hover:bg-active hover:text-ink-2"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 text-left">Search</span>
            <Kbd>{modKey('K')}</Kbd>
          </button>
        )}

        <SidebarLink item={NAV_TODAY} collapsed={collapsed} />

        {collapsed ? (
          <span role="separator" className="my-2 h-px w-5 shrink-0 bg-line" />
        ) : (
          <SectionLabel
            action={
              <NavLink
                to="/settings?tab=subjects"
                aria-label="Add a subject"
                className="flex size-5 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
              >
                <Plus className="size-3.5" aria-hidden />
              </NavLink>
            }
          >
            Subjects
          </SectionLabel>
        )}
        <div className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>
          {subjects.map((subject) => (
            <SubjectLink key={subject.id} subject={subject} collapsed={collapsed} />
          ))}
          {subjects.length === 0 && !collapsed ? (
            <p className="px-2 pb-1 text-ink-3 select-none">No subjects yet</p>
          ) : null}
        </div>

        {collapsed ? (
          <span role="separator" className="my-2 h-px w-5 shrink-0 bg-line" />
        ) : (
          <SectionLabel>Tools</SectionLabel>
        )}
        <div className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>
          {NAV_TOOLS.map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} />
          ))}
        </div>

        <div className="mt-auto pt-3">
          <SidebarLink item={NAV_SETTINGS} collapsed={collapsed} />
        </div>
      </div>
    </nav>
  )
}

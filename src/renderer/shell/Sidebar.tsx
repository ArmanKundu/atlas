import type { ReactElement, ReactNode } from 'react'
import { NavLink } from 'react-router'
import { Plus, Search } from 'lucide-react'
import type { Subject } from '@shared/models'
import { SYSTEM_PRESETS } from '@shared/presets'
import { SubjectDot } from '@/design/Form'
import { Kbd } from '@/design/Kbd'
import { Tooltip } from '@/design/Tooltip'
import { useLive } from '@/lib/api'
import { useAppState, useSubjects } from '@/lib/app-state'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { isMac, modKey } from '@/lib/keys'
import { useNow } from '@/lib/now'
import { Mascot, MascotTile } from '@/mascot/Mascot'
import type { MascotAccessory, MascotColour } from '@/mascot/options'
import { NAV_PRIMARY, NAV_SECONDARY, NAV_SETTINGS, NAV_TODAY, type NavItem } from './nav'

const DAY = 86_400_000

const linkClass =
  (collapsed: boolean, quiet = false) =>
  ({ isActive }: { isActive: boolean }): string =>
    cn(
      'flex h-8 items-center gap-2.5 rounded-md select-none',
      'transition-colors duration-150 ease-out hover:bg-hover hover:text-ink',
      quiet ? 'text-ink-3' : 'text-ink-2',
      collapsed ? 'w-8 justify-center' : 'px-2',
      isActive && 'bg-active font-medium text-ink hover:bg-active',
    )

/** In the icon rail every item gets a tooltip with its name. */
function Wrap({
  label,
  collapsed,
  children,
}: {
  label: string
  collapsed: boolean
  children: ReactElement
}) {
  return collapsed ? (
    <Tooltip label={label} side="right">
      {children}
    </Tooltip>
  ) : (
    children
  )
}

function SidebarLink({
  item,
  collapsed,
  quiet,
  badge,
}: {
  item: NavItem
  collapsed: boolean
  quiet?: boolean
  badge?: ReactNode
}) {
  return (
    <Wrap label={item.label} collapsed={collapsed}>
      <NavLink
        to={item.to}
        end={item.to === '/'}
        aria-label={collapsed ? item.label : undefined}
        className={linkClass(collapsed, quiet)}
      >
        <item.icon className="size-4 shrink-0" aria-hidden />
        {collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {collapsed ? null : badge}
      </NavLink>
    </Wrap>
  )
}

function SubjectLink({ subject, collapsed }: { subject: Subject; collapsed: boolean }) {
  return (
    <Wrap label={subject.name} collapsed={collapsed}>
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
    </Wrap>
  )
}

function Divider({ collapsed }: { collapsed: boolean }) {
  return (
    <span
      role="separator"
      className={cn('my-2.5 block h-px shrink-0 bg-line', collapsed ? 'w-5' : 'mx-2')}
    />
  )
}

/**
 * Left sidebar: the app and study system, search, the main places, subjects, a quieter group of
 * study tools, and at the bottom the study buddy with the countdown to the next exam.
 */
export function Sidebar({
  collapsed,
  onOpenPalette,
}: {
  collapsed: boolean
  onOpenPalette: () => void
}) {
  const mac = isMac()
  const now = useNow()
  const { meta } = useAppState()
  const subjects = useSubjects()
  const stats = useLive(['stats', 'flashcards', 'mistakes'], () => call('stats:summary'))

  const colour = (meta?.avatarColour ?? 'ink') as MascotColour
  const accessory = (meta?.avatarAccessory ?? 'none') as MascotAccessory
  const subtitle = [
    meta && meta.studySystem !== 'other' ? SYSTEM_PRESETS[meta.studySystem].label : null,
    meta?.yearLevel,
  ]
    .filter(Boolean)
    .join(' · ')
  const nextExam = subjects
    .flatMap((subject) =>
      subject.examDates
        .filter((exam) => exam.date >= now - DAY)
        .map((exam) => ({ ...exam, subject: subject.name })),
    )
    .sort((a, b) => a.date - b.date)[0]
  const due = stats.data?.dueCards ?? 0
  const mistakes = stats.data?.openMistakes ?? 0

  return (
    <nav
      aria-label="Main"
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line bg-canvas transition-[width] duration-200 ease-out',
        collapsed ? 'w-[var(--atlas-sidebar-rail-w)] items-center' : 'w-[var(--atlas-sidebar-w)]',
      )}
    >
      {/* macOS keeps its window buttons in this strip; it also drags the window. */}
      {mac ? <div className="app-drag h-9 w-full shrink-0" /> : null}

      <div
        className={cn(
          'app-drag flex shrink-0 items-center gap-2.5',
          collapsed ? 'h-12 justify-center' : 'px-3.5 pb-2',
          !mac && !collapsed && 'pt-3.5',
        )}
      >
        <MascotTile size={collapsed ? 28 : 34} colour={colour} accessory={accessory} />
        {collapsed ? null : (
          <div className="min-w-0 select-none">
            <p className="truncate text-[0.9375rem] leading-5 font-semibold tracking-[-0.01em] text-ink">
              Atlas
            </p>
            <p className="truncate text-2xs text-ink-3">{subtitle || 'Study workspace'}</p>
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-y-auto pb-2',
          collapsed ? 'items-center' : 'px-2.5',
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
            className="mt-1 mb-2.5 flex h-8 w-full shrink-0 items-center gap-2 rounded-md bg-surface px-2 text-ink-3 ring-1 ring-line ring-inset select-none hover:text-ink-2 hover:ring-line-strong"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="flex-1 text-left">Search</span>
            <Kbd>{modKey('K')}</Kbd>
          </button>
        )}

        <div className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>
          <SidebarLink item={NAV_TODAY} collapsed={collapsed} />
          {NAV_PRIMARY.map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} />
          ))}
        </div>

        <Divider collapsed={collapsed} />
        {collapsed ? null : (
          <div className="flex items-center justify-between px-2 pb-1">
            <p className="text-2xs font-medium text-ink-3 select-none">Subjects</p>
            <NavLink
              to="/settings?tab=subjects"
              aria-label="Add a subject"
              className="flex size-5 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
            >
              <Plus className="size-3.5" aria-hidden />
            </NavLink>
          </div>
        )}
        <div className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>
          {subjects.map((subject) => (
            <SubjectLink key={subject.id} subject={subject} collapsed={collapsed} />
          ))}
          {subjects.length === 0 && !collapsed ? (
            <p className="px-2 pb-1 text-ink-3 select-none">No subjects yet</p>
          ) : null}
        </div>

        <Divider collapsed={collapsed} />
        <div className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>
          {NAV_SECONDARY.map((item) => (
            <SidebarLink
              key={item.to}
              item={item}
              collapsed={collapsed}
              quiet
              badge={
                item.to === '/flashcards' && due > 0 ? (
                  <span className="rounded-full bg-active px-1.5 text-2xs font-medium text-ink-2 tabular-nums">
                    {due}
                    <span className="sr-only"> due</span>
                  </span>
                ) : item.to === '/questions' && mistakes > 0 ? (
                  <span className="rounded-full bg-active px-1.5 text-2xs font-medium text-ink-2 tabular-nums">
                    {mistakes}
                    <span className="sr-only"> open mistakes</span>
                  </span>
                ) : undefined
              }
            />
          ))}
        </div>
      </div>

      <div
        className={cn(
          'w-full shrink-0 border-t border-line py-2',
          collapsed ? 'flex flex-col items-center' : 'px-2.5',
        )}
      >
        {collapsed ? null : (
          <div className="px-2 pt-1 pb-2 select-none">
            <div className="flex items-center gap-2.5">
              <Mascot size={34} colour={colour} accessory={accessory} interactive={false} />
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{meta?.name ?? 'You'}</p>
                <p className="truncate text-2xs text-ink-3">Your study buddy is here</p>
              </div>
            </div>
            <p className="mt-2 truncate text-2xs text-ink-3">
              {nextExam ? (
                <>
                  <span className="font-semibold text-ink">
                    {Math.max(0, Math.ceil((nextExam.date - now) / DAY))} days
                  </span>{' '}
                  to go ·{' '}
                  {new Date(nextExam.date).toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  · {nextExam.subject}
                </>
              ) : (
                'No exam dates yet'
              )}
            </p>
          </div>
        )}
        <SidebarLink item={NAV_SETTINGS} collapsed={collapsed} quiet />
      </div>
    </nav>
  )
}

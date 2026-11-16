import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { Monitor, Moon, Palette, PanelLeft, Sun } from 'lucide-react'
import type { Theme } from '@shared/ipc'
import { processImportQueue } from '@/features/library/ingest'
import { changed } from '@/lib/api'
import { useAppState } from '@/lib/app-state'
import { subscribe } from '@/lib/ipc'
import { isModOnly, modKey } from '@/lib/keys'
import { CommandPalette } from './CommandPalette'
import { useRegisterCommands, type Command } from './commands'
import { NAV_ALL } from './nav'
import { RouteBoundary } from './RouteBoundary'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const THEME_COMMANDS: { theme: Theme; title: string; icon: Command['icon'] }[] = [
  { theme: 'system', title: 'Theme: match system', icon: Monitor },
  { theme: 'light', title: 'Theme: light', icon: Sun },
  { theme: 'dark', title: 'Theme: dark', icon: Moon },
]

/** The frame around every screen: sidebar, top bar, the routed view and the command palette. */
export function AppShell() {
  const { prefs, setPrefs } = useAppState()
  const navigate = useNavigate()
  const location = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)

  const collapsed = prefs.sidebarCollapsed
  const toggleSidebar = useCallback(() => {
    void setPrefs({ sidebarCollapsed: !collapsed }).catch(() => undefined)
  }, [collapsed, setPrefs])
  const openPalette = useCallback(() => setPaletteOpen(true), [])

  const commands = useMemo<Command[]>(
    () => [
      ...NAV_ALL.map((item, index) => ({
        id: `go:${item.to}`,
        title: `Go to ${item.label}`,
        group: 'Go to',
        icon: item.icon,
        keywords: item.keywords,
        shortcut: item.to === '/settings' ? modKey(',') : index === 0 ? modKey('1') : undefined,
        run: () => void navigate(item.to),
      })),
      {
        id: 'view:toggle-sidebar',
        title: collapsed ? 'Show sidebar' : 'Hide sidebar',
        group: 'View',
        icon: PanelLeft,
        keywords: ['collapse', 'expand', 'navigation'],
        shortcut: modKey('\\'),
        run: toggleSidebar,
      },
      ...THEME_COMMANDS.map(({ theme, title, icon }) => ({
        id: `theme:${theme}`,
        title,
        group: 'Appearance',
        icon,
        keywords: ['appearance', 'dark mode', 'light mode', 'colour'],
        run: () => void setPrefs({ theme }).catch(() => undefined),
      })),
      {
        id: 'go:/design',
        title: 'Open the design system',
        group: 'Appearance',
        icon: Palette,
        keywords: ['tokens', 'components', 'mascot', 'styleguide'],
        run: () => void navigate('/design'),
      },
    ],
    [navigate, collapsed, toggleSidebar, setPrefs],
  )
  useRegisterCommands('shell', commands)

  // Make imported PDFs searchable: on launch, and whenever the library changes.
  useEffect(() => {
    void processImportQueue()
    return subscribe('library:changed', () => {
      changed('sources')
      void processImportQueue()
    })
  }, [])

  // The school calendar syncs in the background; refresh anything showing events.
  useEffect(() => subscribe('calendar:changed', () => changed('calendarEvents', 'calendar')), [])

  // Global shortcuts. One listener for the whole shell.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!isModOnly(event)) return
      const key = event.key.toLowerCase()
      if (key === 'k') setPaletteOpen((open) => !open)
      else if (key === '\\') toggleSidebar()
      else if (key === ',') void navigate('/settings')
      else if (key === '1') void navigate('/')
      else if (key === 'j') void navigate('/assistant')
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, toggleSidebar])

  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} onOpenPalette={openPalette} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggleSidebar}
          onOpenPalette={openPalette}
        />
        <main className="min-h-0 flex-1 overflow-hidden bg-surface">
          <RouteBoundary key={location.pathname} name={location.pathname}>
            <Outlet />
          </RouteBoundary>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

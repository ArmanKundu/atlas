import { useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import type { Theme } from '@shared/ipc'
import { APP_TAGLINE } from '@shared/constants'
import { Kbd } from '@/design/Kbd'
import { Card, Page, PageHeader, Row, Section } from '@/design/Page'
import { Segmented, type SegmentedOption } from '@/design/Segmented'
import { ErrorState } from '@/design/States'
import { useAppState } from '@/lib/app-state'
import { errorMessage } from '@/lib/ipc'
import { globalShortcuts } from '@/lib/keys'
import { MascotTile } from '@/mascot/Mascot'

const THEME_OPTIONS: readonly SegmentedOption<Theme>[] = [
  { value: 'system', label: 'System', icon: <Monitor className="size-3.5" aria-hidden /> },
  { value: 'light', label: 'Light', icon: <Sun className="size-3.5" aria-hidden /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="size-3.5" aria-hidden /> },
]

/**
 * Settings. Appearance, shortcuts and About work now; profile, subjects, AI, storage, backups,
 * updates and school portal sections are added by the phases that build them.
 */
export function Settings() {
  const { info, prefs, setPrefs } = useAppState()
  const [error, setError] = useState<string | null>(null)

  const change = (patch: Parameters<typeof setPrefs>[0]): void => {
    setError(null)
    setPrefs(patch).catch((cause: unknown) => setError(errorMessage(cause)))
  }

  return (
    <Page width="narrow">
      <PageHeader title="Settings" />

      {error ? (
        <ErrorState title="That setting was not saved" className="mb-6">
          {error}
        </ErrorState>
      ) : null}

      <Section title="Appearance">
        <Card>
          <Row label="Theme" hint="System follows your computer's light or dark setting.">
            <Segmented
              label="Theme"
              value={prefs.theme}
              onChange={(theme) => change({ theme })}
              options={THEME_OPTIONS}
            />
          </Row>
          <Row label="Sidebar" hint="Collapse the sidebar to an icon rail.">
            <Segmented
              label="Sidebar"
              value={prefs.sidebarCollapsed ? 'rail' : 'full'}
              onChange={(value) => change({ sidebarCollapsed: value === 'rail' })}
              options={[
                { value: 'full', label: 'Full' },
                { value: 'rail', label: 'Icons only' },
              ]}
            />
          </Row>
        </Card>
      </Section>

      <Section title="Keyboard shortcuts">
        <Card>
          {globalShortcuts().map((shortcut) => (
            <Row key={shortcut.keys} label={shortcut.description}>
              <Kbd>{shortcut.keys}</Kbd>
            </Row>
          ))}
        </Card>
      </Section>

      <Section title="About">
        <Card>
          <div className="flex items-center gap-4 border-b border-line px-4 py-4">
            <MascotTile size={56} />
            <div className="min-w-0">
              <p className="text-[0.9375rem] font-semibold text-ink">
                {info.name} {info.version}
              </p>
              <p className="mt-0.5 text-ink-2">{APP_TAGLINE}.</p>
            </div>
          </div>
          <Row
            label="Privacy"
            hint="No account, no server, no tracking. Your subjects, files and results stay on this laptop."
          />
          <Row label="Licence" hint="Open source under the MIT licence." />
          <Row label="Build">
            <span className="font-mono text-2xs text-ink-3">
              {info.platform}-{info.arch} · Electron {info.electron} · Chromium {info.chrome}
            </span>
          </Row>
        </Card>
      </Section>
    </Page>
  )
}

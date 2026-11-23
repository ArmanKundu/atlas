import { GroupSubjectPicker } from '@/features/subjects/GroupSubjectPicker'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Monitor, Moon, Sun } from 'lucide-react'
import type { Theme } from '@shared/ipc'
import { APP_TAGLINE } from '@shared/constants'
import { STUDY_SYSTEMS, type StudySystem } from '@shared/models'
import { SYSTEM_PRESETS } from '@shared/presets'
import { Button } from '@/design/Button'
import { Field, Input, Select } from '@/design/Form'
import { Kbd } from '@/design/Kbd'
import { Card, Row, Section } from '@/design/Page'
import { Segmented, type SegmentedOption } from '@/design/Segmented'
import { ErrorState } from '@/design/States'
import { useToast } from '@/design/Toast'
import { AiProviders } from '@/features/ai/AiProviders'
import { EmailSignIn } from '@/features/shared/EmailSignIn'
import { useSharedStatus } from '@/features/shared/useSharedStatus'
import { changed, useAction, useLive } from '@/lib/api'
import { useAppState } from '@/lib/app-state'
import { cn } from '@/lib/cn'
import { call } from '@/lib/ipc'
import { globalShortcuts } from '@/lib/keys'
import { Mascot, MascotTile } from '@/mascot/Mascot'
import {
  MASCOT_ACCESSORIES,
  MASCOT_COLOURS,
  MASCOT_COLOUR_IDS,
  type MascotAccessory,
  type MascotColour,
} from '@/mascot/options'

const TABS = ['profile', 'subjects', 'ai', 'calendar', 'backups', 'appearance', 'about'] as const
type Tab = (typeof TABS)[number]
const TAB_LABELS: Record<Tab, string> = {
  profile: 'Profile',
  subjects: 'Subjects',
  ai: 'AI',
  calendar: 'School calendar',
  backups: 'Backups and export',
  appearance: 'Appearance',
  about: 'About',
}

const THEME_OPTIONS: readonly SegmentedOption<Theme>[] = [
  { value: 'system', label: 'System', icon: <Monitor className="size-3.5" aria-hidden /> },
  { value: 'light', label: 'Light', icon: <Sun className="size-3.5" aria-hidden /> },
  { value: 'dark', label: 'Dark', icon: <Moon className="size-3.5" aria-hidden /> },
]

function ProfileTab() {
  const { meta, updateMeta, profiles } = useAppState()
  const save = useAction(updateMeta)
  if (!meta) return null
  const goals = meta.studyGoals
  return (
    <>
      <Section title="You">
        <Card className="grid grid-cols-2 gap-4 p-4">
          <Field label="Name">
            <Input
              defaultValue={meta.name}
              maxLength={80}
              onBlur={(e) =>
                e.target.value.trim() && void save.run({ name: e.target.value.trim() })
              }
            />
          </Field>
          <Field label="Study system">
            <Select
              value={meta.studySystem}
              onChange={(e) => void save.run({ studySystem: e.target.value as StudySystem })}
            >
              {STUDY_SYSTEMS.map((id) => (
                <option key={id} value={id}>
                  {SYSTEM_PRESETS[id].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Year level">
            <Input
              defaultValue={meta.yearLevel ?? ''}
              onBlur={(e) => void save.run({ yearLevel: e.target.value.trim() || null })}
            />
          </Field>
          <Field label="Exam year">
            <Input
              type="number"
              defaultValue={meta.examYear ?? ''}
              onBlur={(e) =>
                void save.run({ examYear: e.target.value ? Number(e.target.value) : null })
              }
            />
          </Field>
          <Field label="Study goal per day" hint="Minutes">
            <Input
              type="number"
              min={0}
              max={960}
              step={15}
              defaultValue={goals.dailyMinutes}
              onBlur={(e) =>
                void save.run({
                  studyGoals: {
                    ...goals,
                    dailyMinutes: Math.max(0, Math.min(960, Number(e.target.value) || 0)),
                  },
                })
              }
            />
          </Field>
          <Field label="Focus session length" hint="Minutes">
            <Input
              type="number"
              min={5}
              max={180}
              step={5}
              defaultValue={goals.focusMinutes}
              onBlur={(e) =>
                void save.run({
                  studyGoals: {
                    ...goals,
                    focusMinutes: Math.max(5, Math.min(180, Number(e.target.value) || 25)),
                  },
                })
              }
            />
          </Field>
        </Card>
        {save.error ? (
          <ErrorState title="That was not saved" className="mt-3">
            {save.error}
          </ErrorState>
        ) : null}
      </Section>

      <Section title="Mascot">
        <Card className="flex items-center gap-8 p-5">
          <div className="flex size-28 shrink-0 items-center justify-center rounded-lg bg-canvas">
            <Mascot
              size={88}
              colour={meta.avatarColour as MascotColour}
              accessory={meta.avatarAccessory as MascotAccessory}
              label="Your mascot"
            />
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              {MASCOT_COLOUR_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-label={MASCOT_COLOURS[id].label}
                  aria-pressed={meta.avatarColour === id}
                  onClick={() => void save.run({ avatarColour: id })}
                  className="size-7 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-surface aria-pressed:ring-ink"
                  style={{ background: MASCOT_COLOURS[id].body }}
                />
              ))}
            </div>
            <Segmented
              label="Accessory"
              value={meta.avatarAccessory as MascotAccessory}
              onChange={(value) => void save.run({ avatarAccessory: value })}
              options={MASCOT_ACCESSORIES.map(({ id, label }) => ({ value: id, label }))}
            />
          </div>
        </Card>
      </Section>

      <Section
        title="Profiles"
        description="Each person on this computer has their own profile, data and AI connection."
      >
        <Card>
          <Row
            label={`${profiles.length} profile${profiles.length === 1 ? '' : 's'} on this computer`}
            hint="Switching closes this profile and returns to the profile picker."
          >
            <Button onClick={() => void call('profile:lock')}>Switch profile</Button>
          </Row>
        </Card>
      </Section>

      <SharedAccountSection />
    </>
  )
}

function SharedAccountSection() {
  const status = useSharedStatus()
  const signOut = useAction(async () => {
    await call('shared:signOut')
    changed('shared')
  })
  if (!status.data?.configured) return null
  return (
    <Section
      title="Shared library"
      description="Your account for spaces with friends. Only what you share goes online."
    >
      <Card>
        <div className="px-4 py-4">
          <EmailSignIn status={status.data} />
        </div>
        {status.data.signedIn ? (
          <Row label="Sign out" hint="Your spaces stay; sign in again with the same email.">
            <Button onClick={() => void signOut.run()} disabled={signOut.pending}>
              Sign out
            </Button>
          </Row>
        ) : null}
      </Card>
    </Section>
  )
}

function SubjectsTab() {
  return (
    <Section
      title="Subjects"
      description="Your group's six subjects, each with Units 1 to 4. Tick the ones you take. Open a subject from the sidebar to set its topics and exam dates."
    >
      <GroupSubjectPicker />
    </Section>
  )
}

function BackupsTab() {
  const toast = useToast()
  const { refreshSession } = useAppState()
  const backups = useLive(['backups'], () => call('backup:list'))
  const create = useAction(async () => {
    await call('backup:create')
    backups.reload()
    toast({ title: 'Backup made' })
  })
  const restore = useAction(async (file: string) => {
    await call('backup:restore', { file })
    await refreshSession()
    backups.reload()
    toast({ title: 'Backup restored', description: 'A copy of the previous state was kept.' })
  })
  const exportAll = useAction(async () => {
    const result = await call('profile:exportAll')
    if (result) toast({ title: 'Export saved', description: result.path })
  })
  return (
    <>
      <Section
        title="Backups"
        description="Atlas backs up this profile once a day (14 kept), and before every update and restore."
      >
        <Card>
          <Row label="Back up now" hint="Makes an extra copy of the database right now.">
            <Button disabled={create.pending} onClick={() => void create.run()}>
              Back up now
            </Button>
          </Row>
          {backups.data?.map((backup) => (
            <Row
              key={backup.file}
              label={new Date(backup.createdAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              hint={`${backup.reason.replace(/-/g, ' ')} · ${(backup.size / 1024).toFixed(0)} KB`}
            >
              <Button
                size="sm"
                disabled={restore.pending}
                onClick={() => void restore.run(backup.file)}
              >
                Restore
              </Button>
            </Row>
          ))}
        </Card>
        {create.error || restore.error ? (
          <ErrorState title="That did not work" className="mt-3">
            {create.error ?? restore.error}
          </ErrorState>
        ) : null}
      </Section>
      <Section
        title="Export everything"
        description="Saves the database and every imported file into a folder you choose. API keys are never included."
      >
        <Card>
          <Row
            label="Export this profile"
            hint="Use it to move to another computer or to keep your own copy."
          >
            <Button disabled={exportAll.pending} onClick={() => void exportAll.run()}>
              {exportAll.pending ? 'Exporting…' : 'Export…'}
            </Button>
          </Row>
        </Card>
        {exportAll.error ? (
          <ErrorState title="The export did not finish" className="mt-3">
            {exportAll.error}
          </ErrorState>
        ) : null}
      </Section>
    </>
  )
}

function CalendarTab() {
  const toast = useToast()
  const [url, setUrl] = useState('')
  const status = useLive(['calendar'], () => call('calendar:status'))
  const after = (): void => {
    status.reload()
    changed('calendarEvents')
  }
  const connect = useAction(async () => {
    const result = await call('calendar:connect', { url })
    setUrl('')
    after()
    toast({
      title: 'Calendar connected',
      description: `${result.events} events added to your Planner.`,
    })
  })
  const sync = useAction(async () => {
    const result = await call('calendar:sync')
    after()
    if (!result.error) toast({ title: 'Calendar synced', description: `${result.events} events.` })
  })
  const disconnect = useAction(async () => {
    await call('calendar:disconnect')
    after()
  })
  const connected = status.data?.connected ?? false

  return (
    <>
      <Section
        title="School calendar"
        description="Shows your timetable, assessments and events in the Planner and on Today. Atlas only reads the calendar; it never changes anything in your school portal."
      >
        <Card className="p-4">
          <p className="font-semibold">Compass</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink-2">
            <li>
              Open Compass in your browser and go to{' '}
              <span className="font-medium text-ink">Calendar</span>.
            </li>
            <li>
              Click the sync button at the top right of the calendar (it may be under the cog) and
              choose <span className="font-medium text-ink">Sync my schedule</span>.
            </li>
            <li>
              Copy the link it shows. It starts with{' '}
              <span className="font-mono text-2xs">https://</span> or{' '}
              <span className="font-mono text-2xs">webcal://</span>.
            </li>
            <li>Paste it below.</li>
          </ol>
          <p className="mt-3 text-ink-3">
            Canvas, Google Classroom, SEQTA, Schoolbox and Outlook also have a calendar subscription
            (iCal) link, and any of them work here.
          </p>
        </Card>
      </Section>

      <Section title={connected ? 'Connected' : 'Connect'}>
        <Card>
          {connected ? (
            <>
              <Row
                label={`${status.data?.events ?? 0} events from your school calendar`}
                hint={
                  status.data?.lastSyncedAt
                    ? `Last synced ${new Date(status.data.lastSyncedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}. Syncs every hour while Atlas is open.`
                    : 'Not synced yet.'
                }
              >
                <Button disabled={sync.pending} onClick={() => void sync.run()}>
                  {sync.pending ? 'Syncing…' : 'Sync now'}
                </Button>
              </Row>
              <Row
                label="Disconnect"
                hint="Removes the saved link and the events it added. Events you made yourself stay."
              >
                <Button
                  variant="danger"
                  disabled={disconnect.pending}
                  onClick={() => void disconnect.run()}
                >
                  Disconnect
                </Button>
              </Row>
            </>
          ) : (
            <form
              className="flex gap-2 p-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (url.trim()) void connect.run()
              }}
            >
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste your calendar link"
                aria-label="Calendar link"
                type="password"
                autoComplete="off"
              />
              <Button type="submit" variant="primary" disabled={!url.trim() || connect.pending}>
                {connect.pending ? 'Connecting…' : 'Connect'}
              </Button>
            </form>
          )}
        </Card>
        <p className="mt-2 text-2xs text-ink-3">
          The link is private, so it is kept in this computer’s keychain, not in the database or in
          exports.
        </p>
        {connect.error || sync.error || disconnect.error || status.data?.error ? (
          <ErrorState title="The calendar did not sync" className="mt-3">
            {connect.error ?? sync.error ?? disconnect.error ?? status.data?.error}
          </ErrorState>
        ) : null}
      </Section>
    </>
  )
}

function AppearanceTab() {
  const { prefs, setPrefs } = useAppState()
  const [error, setError] = useState<string | null>(null)
  const change = (patch: Parameters<typeof setPrefs>[0]): void => {
    setError(null)
    setPrefs(patch).catch(() => setError('That setting was not saved. Try again.'))
  }
  return (
    <>
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
        {error ? (
          <ErrorState title="Not saved" className="mt-3">
            {error}
          </ErrorState>
        ) : null}
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
    </>
  )
}

function UpdatesRow() {
  const { info } = useAppState()
  const status = useLive(['update'], () => call('update:status'))
  const check = useAction(async () => {
    await call('update:check')
    changed('update')
  })
  const s = status.data
  const hint = !info.isPackaged
    ? 'Updates install in the packaged app. This is a development build.'
    : !s || s.state === 'idle'
      ? s?.checkedAt
        ? `You have the latest version. Checked ${new Date(s.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
        : 'Atlas checks GitHub for new versions every few hours. Before installing, it saves a full copy of your data to Documents/Atlas Backups.'
      : s.state === 'available'
        ? `Atlas ${s.version} is available. Use the bar at the top to update.`
        : s.state === 'error'
          ? s.message
          : 'Updating…'
  return (
    <Row label="Updates" hint={hint}>
      <Button
        size="sm"
        onClick={() => void check.run()}
        disabled={check.pending || s?.state === 'checking'}
      >
        {s?.state === 'checking' || check.pending ? 'Checking…' : 'Check now'}
      </Button>
    </Row>
  )
}

function AboutTab() {
  const { info } = useAppState()
  return (
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
          hint="No tracking. Your subjects, files and results stay on this laptop. AI requests go only to the provider you connected; update checks go to GitHub; the shared library is used only when you sign in to it."
        />
        <UpdatesRow />
        <Row label="Licence" hint="Open source under the MIT licence." />
        <Row label="Build">
          <span className="font-mono text-2xs text-ink-3">
            {info.platform}-{info.arch} · Electron {info.electron} · Chromium {info.chrome}
          </span>
        </Row>
      </Card>
    </Section>
  )
}

/** Settings: profile, subjects, AI, backups, appearance and about. */
export function Settings() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t === params.get('tab')) ?? 'profile'
  return (
    <div className="flex h-full min-h-0">
      <nav
        aria-label="Settings sections"
        className="w-[200px] shrink-0 border-r border-line p-3 pt-7"
      >
        <h1 className="px-2 pb-3 text-[1.25rem] font-semibold tracking-[-0.02em]">Settings</h1>
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            aria-current={item === tab ? 'page' : undefined}
            onClick={() => setParams({ tab: item }, { replace: true })}
            className={cn(
              'block h-8 w-full rounded-md px-2 text-left text-ink-2 hover:bg-hover',
              item === tab && 'bg-hover font-medium text-ink',
            )}
          >
            {TAB_LABELS[item]}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            'mx-auto px-8 pt-7 pb-12',
            tab === 'ai' ? 'max-w-[980px]' : 'max-w-[760px]',
          )}
        >
          {tab === 'profile' ? <ProfileTab /> : null}
          {tab === 'subjects' ? <SubjectsTab /> : null}
          {tab === 'ai' ? (
            <Section title="AI providers">
              <AiProviders />
            </Section>
          ) : null}
          {tab === 'calendar' ? <CalendarTab /> : null}
          {tab === 'backups' ? <BackupsTab /> : null}
          {tab === 'appearance' ? <AppearanceTab /> : null}
          {tab === 'about' ? <AboutTab /> : null}
        </div>
      </div>
    </div>
  )
}

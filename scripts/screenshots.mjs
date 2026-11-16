// Drives the built app through setup and its main screens, saving screenshots for visual review
// and the README. Usage: npm run build && node scripts/screenshots.mjs [output-folder]
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

const outDir = resolve(process.argv[2] ?? 'docs/screenshots')
await mkdir(outDir, { recursive: true })
const userData = await mkdtemp(join(tmpdir(), 'atlas-shots-'))
const fixtures = resolve('tests/fixtures')

const app = await electron.launch({
  args: ['.'],
  colorScheme: null,
  env: { ...process.env, ATLAS_USER_DATA: userData, ELECTRON_RENDERER_URL: '' },
})
const errors = []

try {
  const page = await app.firstWindow()
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.waitForLoadState('domcontentloaded')
  const shot = async (name) => {
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(outDir, `${name}.png`) })
    console.warn(`saved ${name}.png`)
  }
  const go = async (hash) => {
    await page.evaluate((h) => (window.location.hash = h), hash)
    await page.waitForTimeout(500)
  }

  // Light theme first, whatever the computer is set to; the last shots switch to dark.
  await page.getByLabel('Your name').waitFor()
  await page.evaluate(() => window.atlas.invoke('prefs:set', { theme: 'light' }))
  await page.getByLabel('Your name').fill('Sam')
  await shot('01-welcome')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await page.getByRole('button', { name: 'Get started' }).click()
  await page.getByLabel('Study system').selectOption('vce')
  await shot('02-onboarding-about')
  await page.getByRole('button', { name: 'Next' }).click()
  for (const name of ['Chemistry', 'Mathematical Methods', 'English'])
    await page.getByRole('button', { name, exact: true }).click()
  await shot('03-onboarding-subjects')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByText('Use a plan you already pay for').waitFor()
  await shot('04-onboarding-ai')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Blue' }).click()
  await shot('05-onboarding-mascot')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Open Atlas' }).click()
  await page.getByRole('navigation', { name: 'Main' }).waitFor()
  await shot('06-today')

  await page.evaluate(
    (paths) => window.atlas.invoke('library:importPaths', { subjectId: null, paths }),
    [fixtures],
  )
  await go('#/library')
  await page
    .getByText('Reading…')
    .waitFor({ state: 'detached', timeout: 20000 })
    .catch(() => undefined)
  await shot('07-library')
  await page.getByRole('link', { name: /sample practice exam/i }).click()
  await page.waitForTimeout(1500)
  await page.getByRole('textbox', { name: 'Find in document' }).fill('mitochondria')
  await shot('08-viewer')
  await go('#/assistant')
  await shot('09-assistant')
  await go('#/notes')
  await page.getByRole('button', { name: 'New note' }).first().click()
  await page
    .getByLabel('Note text')
    .fill(
      '# Enzymes\n\nRate: $v = \\frac{V_{max}[S]}{K_m + [S]}$\n\n- **Competitive** inhibitors bind the active site',
    )
  await shot('10-notes')
  await go('#/flashcards')
  await shot('11-flashcards')
  await go('#/planner')
  await shot('12-planner')
  await go('#/timer')
  await shot('13-timer')
  await go('#/exam-builder')
  await shot('14-exam-builder')
  await go('#/settings?tab=ai')
  await shot('15-settings-ai')
  await go('#/settings?tab=backups')
  await shot('16-settings-backups')
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Chemistry' })
    .click()
  await shot('17-subject')
  await page.evaluate(() => window.atlas.invoke('prefs:set', { theme: 'dark' }))
  await go('#/')
  await shot('18-today-dark')
  await go('#/assistant')
  await shot('19-assistant-dark')
} finally {
  if (errors.length) console.warn(`console errors:\n${[...new Set(errors)].join('\n')}`)
  await app.close()
  await rm(userData, { recursive: true, force: true })
}

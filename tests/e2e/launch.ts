import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export interface Launched {
  app: ElectronApplication
  page: Page
  /** Console errors and uncaught page errors seen so far. Should stay empty. */
  errors: string[]
  userData: string
  close(): Promise<void>
}

export async function makeUserData(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'atlas-e2e-'))
}

/** Launches the built app (`npm run build` first) against a throwaway data folder. */
export async function launchAtlas(
  userData?: string,
  extraEnv: Record<string, string> = {},
): Promise<Launched> {
  const dir = userData ?? (await makeUserData())
  const app = await electron.launch({
    args: ['.'],
    // Do not emulate a colour scheme: the app's own theme handling is under test.
    colorScheme: null,
    env: { ...process.env, ATLAS_USER_DATA: dir, ELECTRON_RENDERER_URL: '', ...extraEnv },
  })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')

  return {
    app,
    page,
    errors,
    userData: dir,
    async close() {
      await app.close()
      if (!userData) await rm(dir, { recursive: true, force: true })
    },
  }
}

/** Creates the first profile and clicks through first-run setup with AI left off. */
export async function completeSetup(page: Page, name = 'Sam'): Promise<void> {
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Create profile' }).click()
  await finishOnboarding(page)
  // The shell (and its keyboard shortcuts) is ready once the sidebar is on screen.
  await page.getByRole('navigation', { name: 'Main' }).waitFor()
}

/** From the welcome screen, clicks Next through every step (however many there are) to Open Atlas. */
export async function finishOnboarding(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Get started' }).click()
  const open = page.getByRole('button', { name: 'Open Atlas' })
  for (let step = 0; step < 20 && !(await open.isVisible()); step++) {
    await page.getByRole('button', { name: 'Next' }).click()
  }
  await open.click()
}

/** Launches and gets straight to the app with a fresh profile. */
export async function launchReady(extraEnv: Record<string, string> = {}): Promise<Launched> {
  const atlas = await launchAtlas(undefined, extraEnv)
  await completeSetup(atlas.page)
  return atlas
}

export const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

// Captures screenshots of the built app for visual review and the README.
// Usage: npm run build && node scripts/screenshots.mjs [output-folder]
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

const outDir = resolve(process.argv[2] ?? 'docs/screenshots')
await mkdir(outDir, { recursive: true })
const userData = await mkdtemp(join(tmpdir(), 'atlas-shots-'))
const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

const app = await electron.launch({
  args: ['.'],
  colorScheme: null,
  env: { ...process.env, ATLAS_USER_DATA: userData, ELECTRON_RENDERER_URL: '' },
})

try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByRole('heading', { level: 1 }).waitFor()
  await page.evaluate(() => document.fonts.ready)

  const shot = async (name) => {
    await page.waitForTimeout(350)
    await page.screenshot({ path: join(outDir, `${name}.png`) })
    console.warn(`saved ${name}.png`)
  }
  // Scrolls the routed view (the wheel only reaches it when the pointer is over the content).
  const scroll = async (dy) => {
    await page.mouse.move(820, 520)
    await page.mouse.wheel(0, dy)
  }
  const go = async (hash) => {
    await page.evaluate((h) => {
      window.location.hash = h
    }, hash)
    await page.getByRole('heading', { level: 1 }).waitFor()
  }

  await shot('today-light')
  await go('#/settings')
  await shot('settings-light')
  await go('#/design')
  await shot('design-light')
  await scroll(760)
  await shot('design-light-2')
  await scroll(760)
  await shot('design-light-3')
  await go('#/library')
  await page.getByRole('button', { name: 'Hide sidebar' }).click()
  await shot('library-rail-light')
  await page.getByRole('button', { name: 'Show sidebar' }).click()
  await go('#/')
  await page.keyboard.press(`${mod}+k`)
  await page.keyboard.type('the')
  await shot('palette-light')
  await page.keyboard.press('Escape')

  await page.evaluate(() => window.atlas.invoke('prefs:set', { theme: 'dark' }))
  await shot('today-dark')
  await go('#/design')
  await shot('design-dark')
  await scroll(760)
  await shot('design-dark-2')
  await scroll(760)
  await shot('design-dark-3')
  await go('#/settings')
  await shot('settings-dark')
} finally {
  await app.close()
  await rm(userData, { recursive: true, force: true })
}

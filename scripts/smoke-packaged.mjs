// Launches a packaged build (not the dev build) and checks it reaches the app.
// Usage: node scripts/smoke-packaged.mjs <path to the Atlas executable>
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

const executablePath = resolve(process.argv[2] ?? 'release/mac/Atlas.app/Contents/MacOS/Atlas')
const userData = await mkdtemp(join(tmpdir(), 'atlas-packaged-'))
const app = await electron.launch({
  executablePath,
  colorScheme: null,
  env: { ...process.env, ATLAS_USER_DATA: userData },
})
const errors = []
try {
  const page = await app.firstWindow()
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.getByLabel('Your name').fill('Packaged')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await page.getByRole('button', { name: 'Get started' }).click()
  // Click through setup (optional steps have Skip) until Atlas can be opened.
  for (let i = 0; i < 12; i++) {
    if (await page.getByRole('button', { name: 'Open Atlas' }).isVisible()) break
    const skip = page.getByRole('button', { name: 'Skip' })
    if (await skip.isVisible()) await skip.click()
    else await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForTimeout(300)
  }
  await page.getByRole('button', { name: 'Open Atlas' }).click()
  await page.getByRole('navigation', { name: 'Main' }).waitFor()
  const info = await page.evaluate(async () => {
    const call = async (c, p) => (await window.atlas.invoke(c, p)).data
    await call('library:importPaths', { subjectId: null, paths: [] }).catch(() => undefined)
    return {
      app: await call('app:info'),
      ai: (await call('ai:status')).map((s) => `${s.id}:${s.ready}`),
      stats: (await call('stats:summary')).counts,
    }
  })
  // Dictation loads Whisper through transformers.js, which needs sharp's native files to be
  // unpacked from the asar archive. A missing one broke the mic in an earlier build.
  const speech = await app.evaluate(({ app: electronApp }) => {
    try {
      const { createRequire } = process.getBuiltinModule('node:module')
      const load = createRequire(`${electronApp.getAppPath()}/package.json`)
      load('sharp')
      load('onnxruntime-node')
      return 'ok'
    } catch (error) {
      return String(error).slice(0, 300)
    }
  })
  if (speech !== 'ok') errors.push(`dictation runtime: ${speech}`)
  console.warn(
    JSON.stringify(
      {
        url: page.url(),
        packaged: info.app.isPackaged,
        version: info.app.version,
        arch: info.app.arch,
        ai: info.ai,
        stats: info.stats,
        speech,
        errors,
      },
      null,
      1,
    ),
  )
} finally {
  await app.close()
  await rm(userData, { recursive: true, force: true })
}

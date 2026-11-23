// Renders a lesson JSON file to MP4 with the built app (npm run build first), using a
// throwaway data folder. The voice model is borrowed from your own Atlas data if present.
//   node scripts/render-lesson.mjs lesson.json out.mp4
import { mkdtempSync, readFileSync, symlinkSync, existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('usage: render-lesson.mjs lesson.json out.mp4')
const lesson = JSON.parse(readFileSync(input, 'utf8'))
const dir = mkdtempSync(join(process.env.RENDER_TMP ?? tmpdir(), 'atlas-render-'))
const models = join(homedir(), 'Library/Application Support/Atlas/models')
if (existsSync(models)) symlinkSync(models, join(dir, 'models'))

const t0 = Date.now()
const log = (m) => console.warn(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`)
const app = await electron.launch({
  args: ['.'],
  env: {
    ...process.env,
    ATLAS_USER_DATA: dir,
    ATLAS_TEST_VIDEO_OUT: resolve(output),
    ELECTRON_RENDERER_URL: '',
  },
})
// Collect what the hidden recording window says, to report problems.
await app.evaluate(({ app: electronApp }) => {
  globalThis.__recorderLog = []
  electronApp.on('browser-window-created', (_e, win) => {
    win.webContents.on('console-message', (...args) => {
      const detail = args[0]
      const text = typeof detail === 'object' && detail ? detail.message : args[2]
      globalThis.__recorderLog.push(String(text).slice(0, 300))
    })
    win.webContents.on('did-fail-load', (_ev, code, desc, url) =>
      globalThis.__recorderLog.push(`load failed ${code} ${desc} ${url}`),
    )
    win.webContents.on('did-finish-load', () =>
      globalThis.__recorderLog.push(`loaded ${win.webContents.getURL()}`),
    )
  })
})
const page = await app.firstWindow()
page.on('pageerror', (e) => log(`page error: ${e.message}`))
await page.waitForLoadState('domcontentloaded')

const call = (channel, payload) =>
  page.evaluate(
    async ([c, p]) => {
      const r = await window.atlas.invoke(c, p)
      if (!r.ok) throw new Error(`${c}: ${r.error.message}`)
      return r.data
    },
    [channel, payload],
  )

const profile = await call('profile:create', { name: 'Render' })
await call('profile:unlock', { id: profile.id })
// Skip first-run setup, or every window shows it instead of the recorder.
await call('profile:updateMeta', { onboardingDone: true })
log(`voice ${await call('voice:prepare')}`)
const row = await call('db:create', {
  entity: 'lessons',
  values: { title: lesson.title, prompt: lesson.title, lesson },
})
await page.evaluate(() => {
  window.__progress = { done: 0, total: 0 }
  window.atlas.on('explainer:exportProgress', (p) => (window.__progress = p))
})
const job = call('explainer:exportVideo', { lessonId: row.id, title: lesson.title })
let finished = false
job.finally(() => (finished = true)).catch(() => undefined)
while (!finished) {
  await new Promise((r) => setTimeout(r, 15_000))
  if (finished) break
  const notes = await app.evaluate(() => globalThis.__recorderLog.splice(0))
  for (const n of notes) log(`recorder: ${n}`)
  const p = await page.evaluate(() => window.__progress)
  log(`frames ${p.done}/${p.total}`)
}
log(`saved ${JSON.stringify(await job)}`)
await app.close()

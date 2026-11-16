// Live check of one AI provider through the built app. Uses a little of your own plan.
// Usage: npm run build && node scripts/ai-smoke.mjs [provider-id]
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const provider = process.argv[2] ?? 'claude-code'
const userData = await mkdtemp(join(tmpdir(), 'atlas-ai-'))
const app = await electron.launch({
  args: ['.'],
  colorScheme: null,
  env: { ...process.env, ATLAS_USER_DATA: userData, ELECTRON_RENDERER_URL: '' },
})
try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByLabel('Your name').waitFor()
  const result = await page.evaluate(async (id) => {
    const call = async (channel, payload) => {
      const r = await window.atlas.invoke(channel, payload)
      if (!r.ok) throw new Error(`${channel}: ${r.error.message}`)
      return r.data
    }
    await call('profile:create', { name: 'Smoke' })
    const status = (await call('ai:status')).find((s) => s.id === id)
    const test = await call('ai:test', { provider: id })
    await call('ai:setConfig', { defaultProvider: id })
    const chat = await call('db:create', { entity: 'chats', values: { agent: 'tutor' } })
    let deltas = 0
    window.atlas.on('ai:delta', () => deltas++)
    const finished = new Promise((resolve) =>
      window.atlas.on('ai:finished', (p) => resolve(p.message)),
    )
    const started = Date.now()
    await call('ai:send', {
      chatId: chat.id,
      content: 'In one sentence, what is an enzyme? Include the inline maths $E_a$.',
    })
    const message = await finished
    return {
      status: status?.detail,
      test,
      deltas,
      seconds: (Date.now() - started) / 1000,
      reply: {
        status: message.status,
        provider: message.provider,
        error: message.error,
        text: message.contentMd.slice(0, 300),
      },
    }
  }, provider)
  console.warn(JSON.stringify(result, null, 2))
} finally {
  await app.close()
  await rm(userData, { recursive: true, force: true })
}

import { test } from '@playwright/test'
import { completeSetup, launchAtlas } from './launch'

test('screenshots', async () => {
  test.setTimeout(240_000)
  const atlas = await launchAtlas()
  const { page } = atlas
  await completeSetup(page)
  await page.evaluate(() => { location.hash = '#/design' })
  await page.getByText('Graphing sin, cos and tan').first().scrollIntoViewIfNeeded()
  await page.getByText('Graphing sin, cos and tan').first().click()
  await page.waitForTimeout(9000)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-armankundu-Downloads-Atlas/49ff161d-4379-43f7-aa65-fe53b6e09f6f/scratchpad/board-mid.png' })
  await page.waitForTimeout(25000)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-armankundu-Downloads-Atlas/49ff161d-4379-43f7-aa65-fe53b6e09f6f/scratchpad/board-end.png' })
  await page.evaluate(() => { location.hash = '#/assistant' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-armankundu-Downloads-Atlas/49ff161d-4379-43f7-aa65-fe53b6e09f6f/scratchpad/assistant.png' })
  await page.getByRole('button', { name: 'Helper' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-armankundu-Downloads-Atlas/49ff161d-4379-43f7-aa65-fe53b6e09f6f/scratchpad/helpers.png' })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Help and feedback' }).click()
  await page.getByRole('menuitem', { name: 'Report a bug' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-armankundu-Downloads-Atlas/49ff161d-4379-43f7-aa65-fe53b6e09f6f/scratchpad/bug.png' })
  console.log('errors', JSON.stringify(atlas.errors))
  await atlas.close()
})

import { rm } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { launchAtlas, makeUserData, mod } from './launch'

test('starts on Today with a locked-down renderer and no console errors', async () => {
  const atlas = await launchAtlas()
  try {
    const { page } = atlas
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Good|Still up/)
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page).toHaveURL(/^atlas:\/\/app\//)

    const surface = await page.evaluate(() => ({
      bridge: Object.keys(window.atlas).sort(),
      hasRequire: typeof (globalThis as Record<string, unknown>)['require'],
      hasProcess: typeof (globalThis as Record<string, unknown>)['process'],
    }))
    expect(surface).toEqual({
      bridge: ['invoke', 'on', 'platform'],
      hasRequire: 'undefined',
      hasProcess: 'undefined',
    })

    const unknown = await page.evaluate(() =>
      (window.atlas.invoke as (channel: string) => Promise<unknown>)('fs:readFile'),
    )
    expect(unknown).toMatchObject({ ok: false, error: { code: 'forbidden' } })

    expect(atlas.errors).toEqual([])
  } finally {
    await atlas.close()
  }
})

test('the content security policy blocks outside requests', async () => {
  const atlas = await launchAtlas()
  try {
    const outcome = await atlas.page.evaluate(() =>
      fetch('https://example.com/').then(
        () => 'allowed',
        () => 'blocked',
      ),
    )
    expect(outcome).toBe('blocked')
  } finally {
    await atlas.close()
  }
})

test('command palette opens with the shortcut and runs a command', async () => {
  const atlas = await launchAtlas()
  try {
    const { page } = atlas
    await page.keyboard.press(`${mod}+k`)
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()

    await page.keyboard.type('sett')
    await expect(palette.getByRole('option', { name: /Go to Settings/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.keyboard.press('Enter')
    await expect(palette).toBeHidden()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')

    await page.keyboard.press(`${mod}+k`)
    await page.keyboard.type('zzzz')
    await expect(palette.getByText('Nothing matches')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
    expect(atlas.errors).toEqual([])
  } finally {
    await atlas.close()
  }
})

test('sidebar navigation, collapse and breadcrumbs work', async () => {
  const atlas = await launchAtlas()
  try {
    const { page } = atlas
    const nav = page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('link', { name: 'Library' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Library')
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Library')

    await page.getByRole('button', { name: 'Hide sidebar' }).click()
    await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible()
    await expect(nav.getByText('Subjects', { exact: true })).toBeHidden()
    await nav.getByRole('link', { name: 'Timer' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Timer')

    await page.keyboard.press(`${mod}+\\`)
    await expect(nav.getByText('Subjects', { exact: true })).toBeVisible()
    expect(atlas.errors).toEqual([])
  } finally {
    await atlas.close()
  }
})

test('theme choice applies at once and survives a restart', async () => {
  const userData = await makeUserData()
  try {
    const first = await launchAtlas(userData)
    await first.page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Settings' })
      .click()
    await first.page.getByRole('radio', { name: 'Dark' }).click()
    await expect(first.page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect
      .poll(() => first.page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches))
      .toBe(true)
    expect(first.errors).toEqual([])
    await first.close()

    const second = await launchAtlas(userData)
    await expect(second.page.locator('html')).toHaveAttribute('data-theme', 'dark')
    // The main process applies the saved theme before the window exists, so the page is dark
    // from its first paint, not only after the UI has loaded.
    expect(
      await second.page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches),
    ).toBe(true)
    const canvas = await second.page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(canvas).toBe('rgb(22, 22, 22)')
    expect(second.errors).toEqual([])
    await second.close()
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})

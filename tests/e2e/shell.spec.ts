import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  completeSetup,
  finishOnboarding,
  launchAtlas,
  launchReady,
  makeUserData,
  mod,
} from './launch'

const fixtures = resolve('tests/fixtures')

test('first run: create a profile, set up with no AI, and land on Today', async () => {
  const atlas = await launchAtlas()
  try {
    const { page } = atlas
    await expect(page).toHaveURL(/^atlas:\/\/app\//)
    await page.getByLabel('Your name').fill('Sam')
    await page.getByRole('button', { name: 'Create profile' }).click()
    await page.getByRole('button', { name: 'Get started' }).click()
    await page.getByLabel('Study system').selectOption('vce')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Chemistry', exact: true }).click()
    await page.getByRole('button', { name: 'Biology', exact: true }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Use your own API key')).toBeVisible()
    await page.getByRole('button', { name: 'Skip' }).click()
    // The shared library sign-in is optional.
    await expect(page.getByText('Shared library').first()).toBeVisible()
    await page.getByRole('button', { name: 'Skip' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Open Atlas' }).click()

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/(Good|Still up).*Sam/)
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link', { name: 'Chemistry' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Biology' })).toBeVisible()

    // With no AI connected the assistant explains what it needs instead of failing.
    await nav.getByRole('link', { name: 'Assistant' }).click()
    await expect(page.getByText('No AI is connected yet')).toBeVisible()
    expect(atlas.errors).toEqual([])
  } finally {
    await atlas.close()
  }
})

test('the renderer is locked down', async () => {
  const atlas = await launchAtlas()
  try {
    const { page } = atlas
    await page.getByLabel('Your name').waitFor()
    const surface = await page.evaluate(() => ({
      bridge: Object.keys(window.atlas).sort(),
      hasRequire: typeof (globalThis as Record<string, unknown>)['require'],
      hasProcess: typeof (globalThis as Record<string, unknown>)['process'],
    }))
    expect(surface).toEqual({
      bridge: ['invoke', 'on', 'pathForFile', 'platform'],
      hasRequire: 'undefined',
      hasProcess: 'undefined',
    })

    const invoke = (channel: string, payload?: unknown): Promise<unknown> =>
      page.evaluate(
        ([c, p]) =>
          (window.atlas.invoke as (c: string, p?: unknown) => Promise<unknown>)(c as string, p),
        [channel, payload] as const,
      )
    expect(await invoke('fs:readFile')).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(await invoke('not a channel')).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    // No profile is open yet, so data channels refuse politely.
    expect(await invoke('db:list', { entity: 'notes' })).toMatchObject({
      ok: false,
      error: { code: 'unavailable' },
    })
    expect(await invoke('db:list', { entity: 'sqlite_master' })).toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
    })

    const outcome = await page.evaluate(() =>
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

test('update bar appears for a newer release and Later hides it until the next one', async () => {
  const atlas = await launchReady({ ATLAS_FAKE_UPDATE: '99.0.0' })
  try {
    const { page } = atlas
    const bar = page.getByRole('status').filter({ hasText: 'Atlas 99.0.0 is ready.' })
    await expect(bar).toBeVisible()
    await expect(bar.getByRole('button', { name: 'Download' })).toBeVisible()
    await bar.getByRole('button', { name: 'Later' }).click()
    await expect(bar).toBeHidden()
    await page.reload()
    await page.getByRole('navigation', { name: 'Main' }).waitFor()
    await expect(page.getByText('Atlas 99.0.0 is ready.')).toBeHidden()
    expect(atlas.errors).toEqual([])
  } finally {
    await atlas.close()
  }
})

test('command palette opens with the shortcut and runs a command', async () => {
  const atlas = await launchReady()
  try {
    const { page } = atlas
    await page.keyboard.press(`${mod}+k`)
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeVisible()
    await page.keyboard.type('planner')
    await expect(palette.getByRole('option', { name: /Go to Planner/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await page.keyboard.press('Enter')
    await expect(palette).toBeHidden()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/\d{4}/)

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

test('import a PDF and a text file, then find text inside them', async () => {
  const atlas = await launchReady()
  try {
    const { page } = atlas
    await page.evaluate(
      (paths) => window.atlas.invoke('library:importPaths', { subjectId: null, paths }),
      [fixtures],
    )
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Library' })
      .click()
    const exam = page.getByRole('link', { name: 'sample practice exam 2024' })
    await expect(exam).toBeVisible()
    await expect(page.getByRole('link', { name: 'sample class notes' })).toBeVisible()
    await expect(page.getByText('Reading…')).toHaveCount(0, { timeout: 20_000 })
    await expect(page.getByText('2 pages')).toBeVisible()

    // Importing the same files again adds nothing.
    await page.evaluate(
      (paths) => window.atlas.invoke('library:importPaths', { subjectId: null, paths }),
      [fixtures],
    )
    await expect(page.getByRole('link', { name: /sample/ })).toHaveCount(2)

    await exam.click()
    await page.getByRole('textbox', { name: 'Find in document' }).fill('mitochondria')
    await expect(page.getByText('1/1')).toBeVisible()
    await expect(page.locator('mark')).toHaveText('mitochondria')
    await expect(page.locator('canvas').first()).toBeVisible()

    const hits = await page.evaluate(() =>
      window.atlas.invoke('search:query', { query: 'competitive inhibit' }),
    )
    expect(hits).toMatchObject({
      ok: true,
      data: [{ type: 'page', title: 'sample class notes, page 1' }],
    })
    expect(atlas.errors).toEqual([])
  } finally {
    await atlas.close()
  }
})

test('notes, flashcards and the timer work without AI', async () => {
  const atlas = await launchReady()
  try {
    const { page } = atlas
    const nav = page.getByRole('navigation', { name: 'Main' })

    await nav.getByRole('link', { name: 'Notes' }).click()
    await page.getByRole('button', { name: 'New note' }).first().click()
    await page.getByLabel('Note title').fill('Enzymes')
    await page.getByLabel('Note text').fill('Rate law: $v = k[A]$ and **bold**')
    await expect(page.locator('.katex').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Enzymes/ })).toBeVisible()

    await nav.getByRole('link', { name: 'Flashcards' }).click()
    await page.getByRole('button', { name: 'New card' }).first().click()
    await page.getByLabel('Front').fill('What does a catalyst lower?')
    await page.getByLabel('Back', { exact: true }).fill('The activation energy')
    await page.getByRole('button', { name: 'Add card' }).click()
    await page.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('button', { name: 'Start review' }).click()
    await page.keyboard.press('Space')
    await expect(page.getByText('The activation energy')).toBeVisible()
    await page.keyboard.press('3')
    await expect(page.getByText('All caught up')).toBeVisible()

    await nav.getByRole('link', { name: 'Timer' }).click()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByRole('link', { name: /Timer running/ })).toBeVisible()
    await page.getByRole('button', { name: 'Finish' }).click()
    // A finished session shows up in the stats. (Logged directly: a real one takes a minute.)
    await page.evaluate(() =>
      window.atlas.invoke('db:create', {
        entity: 'studySessions',
        values: { startedAt: Date.now() - 1_800_000, seconds: 1800 },
      }),
    )
    await nav.getByRole('link', { name: 'Today' }).click()
    await expect(page.getByText('30 min').first()).toBeVisible()
    expect(atlas.errors).toEqual([])
  } finally {
    await atlas.close()
  }
})

test('theme and profile survive a restart; a password gates the profile', async () => {
  const userData = await makeUserData()
  try {
    const first = await launchAtlas(userData)
    await first.page.getByLabel('Your name').fill('Riley')
    await first.page.getByLabel('Password (optional)').fill('open sesame')
    await first.page.getByRole('button', { name: 'Create profile' }).click()
    await finishOnboarding(first.page)
    await first.page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Settings' })
      .click()
    await first.page.getByRole('button', { name: 'Appearance' }).click()
    await first.page.getByRole('radio', { name: 'Dark' }).click()
    await expect(first.page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(first.errors).toEqual([])
    await first.close()

    const second = await launchAtlas(userData)
    const { page } = second
    // The main process applies the saved theme before the window exists.
    expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true)
    await page.getByRole('button', { name: 'Riley' }).click()
    await page.getByLabel('Password').fill('wrong')
    await page.getByRole('button', { name: 'Unlock' }).click()
    await expect(page.getByRole('alert')).toContainText('password is not right')
    await page.getByLabel('Password').fill('open sesame')
    await page.getByRole('button', { name: 'Unlock' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Riley')
    await second.close()
  } finally {
    await rm(userData, { recursive: true, force: true })
  }
})

test('a second profile starts empty', async () => {
  const atlas = await launchReady()
  try {
    const { page } = atlas
    await page.evaluate(() =>
      window.atlas.invoke('db:create', { entity: 'notes', values: { title: 'Private to Sam' } }),
    )
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Settings' })
      .click()
    await page.getByRole('button', { name: 'Switch profile' }).click()
    await page.getByRole('button', { name: 'New profile' }).click()
    await completeSetup(page, 'Alex')
    const notes = await page.evaluate(() => window.atlas.invoke('db:list', { entity: 'notes' }))
    expect(notes).toEqual({ ok: true, data: [] })
  } finally {
    await atlas.close()
  }
})

test('mark a question on a paper, practise it and log a mistake', async () => {
  const atlas = await launchReady()
  try {
    const { page } = atlas
    await page.evaluate(
      async (paths) => {
        await window.atlas.invoke('db:create', {
          entity: 'subjects',
          values: { name: 'Chemistry', kind: 'science', colour: 'teal' },
        })
        await window.atlas.invoke('library:importPaths', { subjectId: null, paths })
      },
      [resolve('tests/fixtures/sample-practice-exam-2024.pdf')],
    )
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Library' })
      .click()
    await expect(page.getByText('Reading…')).toHaveCount(0, { timeout: 20_000 })
    await page.getByRole('link', { name: 'sample practice exam 2024' }).click()

    // Draw a box around Question 1 on page 1.
    await page.getByRole('button', { name: 'Mark questions' }).click()
    const firstPage = page.locator('#page-1')
    await expect(firstPage.locator('canvas')).toBeVisible()
    const box = await firstPage.boundingBox()
    if (!box) throw new Error('page 1 has no box')
    await page.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.33, { steps: 8 })
    await page.mouse.up()

    // Atlas read the number and marks from the text in the box.
    await expect(page.getByRole('button', { name: 'Open Question 1' })).toBeVisible()
    await expect(page.getByText('3 marks')).toBeVisible()
    await page.keyboard.press('Escape')

    // Add a solution, then practise with it hidden.
    await page.getByRole('radio', { name: 'Details' }).click()
    await page.getByLabel(/^Solution/).fill('A catalyst lowers the activation energy.')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('radio', { name: 'Practice' }).click()
    await expect(page.getByText('lowers the activation energy')).toHaveCount(0)
    await page.getByRole('button', { name: 'Check answer' }).click()
    await expect(page.getByText('A catalyst lowers the activation energy.')).toBeVisible()
    await page.getByRole('radio', { name: '1', exact: true }).click()
    await page.getByRole('button', { name: 'Save mark' }).click()
    await page.getByLabel(/^Note to yourself/).fill('Mention activation energy')
    await page.getByRole('button', { name: 'Log mistake' }).click()
    await expect(page.getByText('Saved: 1 out of 3')).toBeVisible()

    // The mistake is waiting on the Questions page.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: /Questions/ })
      .click()
    await page.getByRole('radio', { name: /Mistakes/ }).click()
    await expect(page.getByText('Mention activation energy')).toBeVisible()
    expect(atlas.errors).toEqual([])
  } finally {
    await atlas.close()
  }
})

test('exam: open a paper, mark a question, keyboard views, practise and deep link', async () => {
  const atlas = await launchReady()
  try {
    const { page } = atlas
    await page.evaluate(
      async (paths) => {
        const subject = (await window.atlas.invoke('db:create', {
          entity: 'subjects',
          values: { name: 'Chemistry', kind: 'science', colour: 'teal' },
        })) as unknown as { data: { id: string } }
        await window.atlas.invoke('library:importPaths', { subjectId: subject.data.id, paths })
      },
      [resolve('tests/fixtures/sample-practice-exam-2024.pdf')],
    )

    // The paper appears in the library on the Exam page by itself.
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Exam', exact: true })
      .click()
    await expect(page.getByRole('heading', { name: 'Exam', level: 1 })).toBeVisible()
    const open = page.getByRole('button', { name: 'Open', exact: true })
    await expect(open).toBeVisible({ timeout: 20_000 })
    await open.click()
    await expect(page).toHaveURL(/#\/paper\//)

    // Draw a box around Question 1.
    const firstPage = page.locator('#pdf-page-1')
    await expect(firstPage.locator('canvas')).toBeVisible()
    await page.getByRole('button', { name: /Mark a question/ }).click()
    const box = await firstPage.boundingBox()
    if (!box) throw new Error('page 1 has no box')
    await page.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.33, { steps: 8 })
    await page.mouse.up()
    const inspector = page.getByRole('complementary', { name: 'Question inspector' })
    await expect(inspector.getByRole('tab', { name: 'overview' })).toBeVisible()
    await expect(page.locator('[data-question-box]')).toHaveCount(1)
    await expect(page).toHaveURL(/q=/)

    // 2 asks for the examiner report, which this paper does not have.
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    await page.keyboard.press('2')
    await expect(page.getByText('No examiner report for this paper')).toBeVisible()

    // A opens Practice; self-mark and log a mistake.
    await page.keyboard.press('a')
    await expect(inspector.getByRole('tab', { name: 'practice' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await inspector.getByLabel('Answer').fill('The catalyst speeds it up.')
    await inspector.getByRole('button', { name: 'Self-mark against the report' }).click()
    await inspector.getByRole('button', { name: '1', exact: true }).click()
    await expect(inspector.getByText('1 out of 3. Log a mistake?')).toBeVisible()
    await inspector.getByRole('button', { name: 'Log mistake' }).click()
    await expect(page.getByText('Added to your mistakes')).toBeVisible()

    // The link survives a reload: same question, same tab, answer kept.
    await page.reload()
    await expect(inspector.getByRole('tab', { name: 'practice' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(inspector.getByLabel('Answer')).toHaveValue('The catalyst speeds it up.')
    await expect(inspector.getByText('last: 1/3')).toBeVisible()
    expect(atlas.errors).toEqual([])
  } finally {
    await atlas.close()
  }
})

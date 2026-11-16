// Renders a sample exam in the built app: a screenshot of the on-screen paper and a real PDF.
// Usage: npm run build && node scripts/exam-preview.mjs <output-folder>
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

const outDir = resolve(process.argv[2] ?? 'docs/screenshots')
await mkdir(outDir, { recursive: true })
const userData = await mkdtemp(join(tmpdir(), 'atlas-exam-'))
const BODY = `# Chemistry practice examination
## Section A - Multiple-choice questions
### Question 1
Which one of the following is a strong acid?
A. ethanoic acid
B. hydrochloric acid
C. carbonic acid
D. water
### Question 2
The oxidation number of sulfur in $\\ce{H2SO4}$ is
A. $+2$
B. $+4$
C. $+6$
D. $-2$
## Section B - Short-answer questions
### Question 1 (6 marks)
A student titrates 20.00 mL of ethanoic acid with 0.100 M sodium hydroxide.
**a.** Write a balanced equation for the reaction. (1 mark)
**b.** The mean titre is 18.45 mL. Calculate the concentration of the ethanoic acid. (3 marks)
**c.** Explain why phenolphthalein is a suitable indicator. (2 marks)
### Question 2 (3 marks)
Explain how a catalyst increases the rate of a reaction. (3 marks)`
const app = await electron.launch({
  args: ['.'],
  colorScheme: null,
  env: { ...process.env, ATLAS_USER_DATA: userData, ELECTRON_RENDERER_URL: '' },
})
try {
  const page = await app.firstWindow()
  await page.getByLabel('Your name').fill('Sam')
  await page.getByRole('button', { name: 'Create profile' }).click()
  await page.getByRole('button', { name: 'Get started' }).click()
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Open Atlas' }).click()
  await page.getByRole('navigation', { name: 'Main' }).waitFor()
  await page.evaluate(async (bodyMd) => {
    const subject = (
      await window.atlas.invoke('db:create', {
        entity: 'subjects',
        values: { name: 'Chemistry', kind: 'science', colour: 'teal' },
      })
    ).data
    await window.atlas.invoke('db:create', {
      entity: 'exams',
      values: {
        subjectId: subject.id,
        title: 'Chemistry practice examination',
        config: { minutes: 90 },
        bodyMd,
        solutionsMd: '### Question 1\nB',
      },
    })
  }, BODY)
  const pdf = join(outDir, 'exam-sample.pdf')
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, pdf)
  await page.evaluate(() => (window.location.hash = '#/exam-builder'))
  await page.getByRole('button', { name: /Chemistry practice examination/ }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(outDir, 'exam-cover.png') })
  await page.mouse.move(1100, 600)
  await page.mouse.wheel(0, 1250)
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(outDir, 'exam-questions.png') })
  await page.getByRole('button', { name: 'Save as PDF' }).click()
  await page.getByText('PDF saved').waitFor({ timeout: 40000 })
  console.warn('saved', pdf)
} finally {
  await app.close()
  await rm(userData, { recursive: true, force: true })
}

import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractText } from '../../src/main/extract-text'

describe('extractText', () => {
  it('reads slide text from a PowerPoint file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-pptx-'))
    mkdirSync(join(dir, 'ppt/slides'), { recursive: true })
    writeFileSync(
      join(dir, 'ppt/slides/slide1.xml'),
      '<p:sld><a:p><a:r><a:t>Photosynthesis</a:t></a:r></a:p><a:p><a:r><a:t>Light &amp; dark</a:t></a:r></a:p></p:sld>',
    )
    writeFileSync(
      join(dir, 'ppt/slides/slide2.xml'),
      '<p:sld><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>',
    )
    execFileSync('zip', ['-qr', join(dir, 'deck.pptx'), 'ppt'], { cwd: dir })
    const out = await extractText(join(dir, 'deck.pptx'))
    expect(out.pages).toBe(2)
    expect(out.text).toContain('[Slide 1] Photosynthesis\nLight & dark')
    expect(out.text).toContain('[Slide 2] Second')
  })
})

describe('parseDigest', () => {
  it('splits the summary from the text version', async () => {
    const { parseDigest } = await import('../../src/main/ai/service')
    const out = parseDigest(
      '## Summary\n- Enzymes\n- Rates\n\n## Text\n# Enzymes\nThey speed up reactions.',
    )
    expect(out.summary).toBe('- Enzymes\n- Rates')
    expect(out.text).toBe('# Enzymes\nThey speed up reactions.')
  })
})

describe('parseDetails', () => {
  it('reads the details line and keeps the text part clean', async () => {
    const { parseDetails, parseDigest } = await import('../../src/main/ai/service')
    const answer =
      '## Summary\n- Derivatives\n\n## Text\nFind f′(x).\n\n## Details\n{"title": "Methods SAC revision", "subject": "Mathematical Methods", "material": "worksheet", "units": [3, "4", 7], "teacher": "Ms Lee", "description": "Practice on derivatives."}'
    expect(parseDigest(answer).text).toBe('Find f′(x).')
    expect(parseDetails(answer)).toEqual({
      title: 'Methods SAC revision',
      subject: 'Mathematical Methods',
      material: 'worksheet',
      units: [3, 4],
      teacher: 'Ms Lee',
      description: 'Practice on derivatives.',
    })
  })

  it('gives null when there is no usable details line', async () => {
    const { parseDetails } = await import('../../src/main/ai/service')
    expect(parseDetails('## Summary\n- x')).toBeNull()
    expect(parseDetails('## Details\n{not json}')).toBeNull()
  })
})

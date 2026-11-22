import { describe, expect, it } from 'vitest'
import { classifyFile, pairPapers, parseReference, subjectKeyFor } from '../../src/shared/papers'

const names = [
  '2023MM1-w.pdf',
  '2023MM2-w.pdf',
  '2021MM1-w.pdf',
  '2021mathmethods1-report.pdf',
  '2021mathmethods2-report.pdf',
  'NHT 2022mm1-nht-w.pdf',
  'NHT 2022mm1-NHT-report.pdf',
  '2019 MM1_examrep19.pdf',
  '2019MM1-w.pdf',
  '2024chemistry-w.pdf',
  '2020VCEChemistry-exam-report.pdf',
  '2020chem-w.pdf',
  '2024english-language-w.pdf',
  '2019 AnswerBook-EnglishFINAL.pdf',
  '2022specmath2-w.pdf',
  'NHT 2022specmath1-NH-w.pdf',
]

describe('past paper file names', () => {
  it('reads year, sitting, exam number and role', () => {
    expect(classifyFile('2023MM1-w.pdf')).toMatchObject({
      role: 'paper',
      year: 2023,
      sitting: 'main',
      exam: '1',
      subjectKey: 'methods',
    })
    expect(classifyFile('2021mathmethods2-report.pdf')).toMatchObject({ role: 'report', exam: '2' })
    expect(classifyFile('NHT 2022mm1-NHT-report.pdf')).toMatchObject({
      role: 'report',
      sitting: 'nht',
    })
    expect(classifyFile('2019 MM1_examrep19.pdf')).toMatchObject({
      role: 'report',
      year: 2019,
      exam: '1',
    })
    expect(classifyFile('NHT 2022specmath1-NH-w.pdf')).toMatchObject({ sitting: 'nht', exam: '1' })
    expect(classifyFile('2024english-language-w.pdf')).toBeNull()
    expect(classifyFile('2019 AnswerBook-EnglishFINAL.pdf')).toBeNull()
  })

  it('pairs each paper with the report of the same year, sitting and exam', () => {
    const files = names.map((name, i) => ({ id: String(i), name, subjectId: null }))
    const papers = pairPapers(files)
    const mm1in2021 = papers.find((p) => p.year === 2021 && p.exam === '1')
    expect(mm1in2021?.report?.name).toBe('2021mathmethods1-report.pdf')
    expect(mm1in2021?.title).toBe('2021 VCAA Exam 1')
    expect(mm1in2021?.group).toBe('earlier')
    expect(papers.find((p) => p.year === 2023 && p.exam === '2')?.group).toBe('official')
    expect(
      papers.find((p) => p.sitting === 'nht' && p.subjectKey === 'methods')?.report?.name,
    ).toBe('NHT 2022mm1-NHT-report.pdf')
    expect(papers.find((p) => p.year === 2020 && p.subjectKey === 'chemistry')?.report?.name).toBe(
      '2020VCEChemistry-exam-report.pdf',
    )
    expect(papers.filter((p) => p.subjectKey === 'english')).toHaveLength(0)
  })

  it('maps subject names to keys', () => {
    expect(subjectKeyFor('Mathematical Methods')).toBe('methods')
    expect(subjectKeyFor('Specialist Mathematics')).toBe('specialist')
    expect(subjectKeyFor('English')).toBe('english')
    expect(subjectKeyFor('English Language')).toBeNull()
  })
})

describe('question references', () => {
  it('understands the usual ways of naming a question', () => {
    expect(parseReference('2019 B4')).toMatchObject({ year: 2019, section: 'B', number: '4' })
    expect(parseReference('MM 2023 E1 Q7')).toMatchObject({ year: 2023, exam: '1', number: '7' })
    expect(parseReference('Spesh 2024 E2 B3c')).toMatchObject({
      exam: '2',
      section: 'B',
      number: '3c',
    })
    expect(parseReference('question 9 NHT')).toMatchObject({ number: '9', sitting: 'nht' })
    expect(parseReference('how do enzymes work')).toBeNull()
  })
})

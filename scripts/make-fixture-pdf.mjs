// Writes a small, valid, text-based PDF that we made ourselves, for tests.
// Usage: node scripts/make-fixture-pdf.mjs <output.pdf>
import { writeFileSync } from 'node:fs'

const pages = [
  [
    'Sample Practice Examination 2024',
    'Written examination',
    'Question 1 (3 marks)',
    'Explain how a catalyst changes the rate of a reaction.',
  ],
  [
    'Question 2 (4 marks)',
    'Describe the role of mitochondria in aerobic respiration.',
    'Question 3 (2 marks)',
    'State the first law of thermodynamics.',
  ],
]

const objects = []
const add = (body) => objects.push(body) && objects.length
const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
const pageIds = []
const pagesId = objects.length + pages.length * 2 + 1
for (const lines of pages) {
  const text = lines
    .map(
      (line, i) =>
        `BT /F1 ${i === 0 ? 16 : 12} Tf 72 ${720 - i * 28} Td (${line.replace(/[()\\]/g, '\\$&')}) Tj ET`,
    )
    .join('\n')
  const contentId = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`)
  pageIds.push(
    add(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    ),
  )
}
add(
  `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
)
const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

let out = '%PDF-1.4\n'
const offsets = []
objects.forEach((body, i) => {
  offsets.push(out.length)
  out += `${i + 1} 0 obj\n${body}\nendobj\n`
})
const xref = out.length
out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
writeFileSync(process.argv[2] ?? 'fixture.pdf', out, 'latin1')

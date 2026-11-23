import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { inflateRawSync } from 'node:zlib'

/** What a file says, as plain text, plus how many pages or slides it has (0 if unknown). */
export interface Extracted {
  text: string
  pages: number
}

/** Reads the entries of a zip file (PowerPoint and Word files are zips of XML). */
export function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  // End of central directory: signature 0x06054b50, within the last 64 KB.
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return out
  const count = buf.readUInt16LE(eocd + 10)
  let at = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < count && at + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) break
    const method = buf.readUInt16LE(at + 10)
    const compressed = buf.readUInt32LE(at + 20)
    const nameLen = buf.readUInt16LE(at + 28)
    const extraLen = buf.readUInt16LE(at + 30)
    const commentLen = buf.readUInt16LE(at + 32)
    const local = buf.readUInt32LE(at + 42)
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen)
    at += 46 + nameLen + extraLen + commentLen
    if (buf.readUInt32LE(local) !== 0x04034b50) continue
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const data = buf.subarray(start, start + compressed)
    try {
      if (method === 0) out.set(name, data)
      else if (method === 8) out.set(name, inflateRawSync(data))
    } catch {
      // A damaged entry: skip it.
    }
  }
  return out
}

const decode = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

/** The text runs (`<a:t>` or `<w:t>`) in Office XML, one paragraph per line. */
function officeText(xml: string, run: 'a:t' | 'w:t', para: 'a:p' | 'w:p'): string {
  return xml
    .split(`</${para}>`)
    .map((p) =>
      [...p.matchAll(new RegExp(`<${run}(?: [^>]*)?>([^<]*)</${run}>`, 'g'))]
        .map((m) => decode(m[1] ?? ''))
        .join(''),
    )
    .filter((line) => line.trim())
    .join('\n')
}

async function pdfText(bytes: Buffer): Promise<Extracted> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes) })
  const doc = await task.promise
  const parts: string[] = []
  const pages = Math.min(doc.numPages, 400)
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    parts.push(`[Page ${i}] ${line}`)
  }
  await task.destroy()
  return { text: parts.join('\n'), pages: doc.numPages }
}

/** Plain text from PDFs, PowerPoint, Word, Markdown and text files. Other files give ''. */
export async function extractText(path: string): Promise<Extracted> {
  const ext = extname(path).toLowerCase()
  const bytes = await readFile(path)
  if (ext === '.pdf') return pdfText(bytes)
  if (['.md', '.txt', '.csv', '.tex'].includes(ext))
    return { text: bytes.toString('utf8'), pages: 0 }
  if (ext === '.pptx') {
    const zip = unzip(bytes)
    const slides = [...zip.keys()]
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
    const text = slides
      .map((k, i) => {
        const notes = zip.get(k.replace('slides/slide', 'notesSlides/notesSlide'))
        const body = officeText(zip.get(k)?.toString('utf8') ?? '', 'a:t', 'a:p')
        const said = notes ? officeText(notes.toString('utf8'), 'a:t', 'a:p') : ''
        return `[Slide ${i + 1}] ${body}${said ? `\nSpeaker notes: ${said}` : ''}`
      })
      .join('\n\n')
    return { text, pages: slides.length }
  }
  if (ext === '.docx') {
    const xml = unzip(bytes).get('word/document.xml')?.toString('utf8') ?? ''
    return { text: officeText(xml, 'w:t', 'w:p'), pages: 0 }
  }
  return { text: '', pages: 0 }
}

import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export type { PDFDocumentProxy } from 'pdfjs-dist'

/** Opens a PDF from bytes. The bytes are copied, because pdf.js takes ownership of its input. */
export function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ data: data.slice(), useSystemFonts: true }).promise
}

/** The plain text of one page, with line breaks where the PDF ends a line. */
export async function pageText(doc: PDFDocumentProxy, number: number): Promise<string> {
  const page = await doc.getPage(number)
  const content = await page.getTextContent()
  let text = ''
  for (const item of content.items) {
    if ('str' in item) text += item.str + (item.hasEOL ? '\n' : '')
  }
  page.cleanup()
  return text.replace(/[ \t]+\n/g, '\n').trim()
}

/** Releases a document and its worker resources. */
export function closePdf(doc: PDFDocumentProxy): Promise<void> {
  return doc.loadingTask.destroy()
}

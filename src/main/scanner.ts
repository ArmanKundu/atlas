import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import QRCode from 'qrcode'
import { PDFDocument } from 'pdf-lib'
import { AtlasError } from '@shared/errors'
import type { ScanSession } from '@shared/scanner'
import { SCANNER_PAGE } from './scanner-page'

const MAX_IMAGE = 25 * 1024 * 1024
const MAX_PAGES = 60
/** Page slots per scan; removed and retaken pages use new slots. */
const MAX_SLOTS = 600
const LIFETIME = 30 * 60_000

/** True for addresses on a home or school network (and this computer). */
function isPrivate(address: string | undefined): boolean {
  const ip = (address ?? '').replace(/^::ffff:/, '')
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^f[cd][0-9a-f]{2}:/i.test(ip)
  )
}

function lanAddress(): string | null {
  const all = Object.values(networkInterfaces()).flat()
  const v4 = all.filter((n) => n && n.family === 'IPv4' && !n.internal && isPrivate(n.address))
  // Prefer Wi-Fi and Ethernet ranges over VPN-like 10.x addresses.
  return (
    v4.find((n) => n?.address.startsWith('192.168.'))?.address ??
    v4.find((n) => n?.address.startsWith('172.'))?.address ??
    v4[0]?.address ??
    null
  )
}

function body(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('too large'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

interface Batch {
  pages: Map<number, string>
}

/**
 * Scan with your phone. Atlas serves a small scanner page on your home network behind a random
 * one-time link (shown as a QR code). The phone takes photos of pages and sends them straight to
 * this computer; nothing goes through the internet. The link stops working after 30 minutes or
 * when the scan window closes.
 */
export class PhoneScanner {
  private server: Server | null = null
  private session: (ScanSession & { subjectId: string | null; timer: NodeJS.Timeout }) | null = null
  private batches = new Map<string, Batch>()

  constructor(
    private readonly deps: {
      importFiles: (input: {
        subjectId: string | null
        paths: string[]
      }) => Promise<{ id: string; title: string }[]>
      onReceived: (item: { id: string; title: string; pages: number }) => void
      onProgress: (pages: number) => void
    },
  ) {}

  private dir(): string {
    return join(app.getPath('temp'), 'atlas-scans')
  }

  async start(input: { subjectId: string | null }): Promise<ScanSession> {
    await this.stop()
    const host = lanAddress()
    if (!host)
      throw new AtlasError(
        'unavailable',
        'This computer is not on a Wi-Fi or wired network. Connect it, then try again.',
      )
    const token = randomBytes(18).toString('base64url')
    const server = createServer((req, res) => {
      void this.handle(req, token)
        .then(({ status, type, data }) => {
          res.writeHead(status, {
            'Content-Type': type,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy':
              "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob: data:; media-src blob: mediastream:; connect-src 'self'",
          })
          res.end(data)
        })
        .catch(() => {
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Something went wrong')
        })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '0.0.0.0', () => resolve())
    })
    const address = server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const url = `http://${host}:${port}/s/${token}`
    const qr = await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
    this.server = server
    const expiresAt = Date.now() + LIFETIME
    this.session = {
      url,
      qr,
      expiresAt,
      subjectId: input.subjectId,
      timer: setTimeout(() => void this.stop(), LIFETIME),
    }
    return { url, qr, expiresAt }
  }

  async stop(): Promise<void> {
    if (this.session) clearTimeout(this.session.timer)
    // Pages that arrived but were never sent as a finished scan are still saved.
    const session = this.session
    if (session) {
      for (const [id, batch] of this.batches) {
        if (batch.pages.size === 0) continue
        await this.save(id, batch, session.subjectId, '', 'pdf', null).catch(() => undefined)
      }
    }
    this.session = null
    this.batches.clear()
    const server = this.server
    this.server = null
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(this.dir(), { recursive: true, force: true }).catch(() => undefined)
  }

  private pending(): number {
    let n = 0
    for (const b of this.batches.values()) n += b.pages.size
    return n
  }

  /** Turns a batch into PDFs in the library (one PDF, or one per photo). Returns how many. */
  private async save(
    id: string,
    batch: Batch,
    subjectId: string | null,
    rawTitle: string,
    mode: 'pdf' | 'photos',
    order: number[] | null,
  ): Promise<number> {
    const stamp = new Date()
      .toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
      .replace(/,/g, '')
    const title =
      rawTitle
        .replace(/[\\/:*?"<>|]+/g, ' ')
        .trim()
        .slice(0, 80) || `Scan ${stamp.replace(/[\\/:*?"<>|]+/g, '.')}`
    const keys = order?.filter((k) => batch.pages.has(k)) ?? []
    const slots = keys.length ? keys : [...batch.pages.keys()].sort((a, b) => a - b)
    const ordered = slots.map((k) => batch.pages.get(k)).filter((p): p is string => !!p)
    this.batches.delete(id)
    this.deps.onProgress(this.pending())
    if (ordered.length === 0) return 0

    // The library reads PDFs, so photos mode makes one single-page PDF per photo.
    const groups = mode === 'photos' ? ordered.map((p) => [p]) : [ordered]
    const paths: string[] = []
    for (const [n, group] of groups.entries()) {
      const name = groups.length > 1 ? `${title} (${n + 1})` : title
      const pdf = await PDFDocument.create()
      pdf.setTitle(name)
      pdf.setProducer('Atlas phone scanner')
      for (const page of group) {
        const bytes = await readFile(page)
        const image = page.endsWith('.png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
        // A4 width in points; height follows the photo.
        const width = 595
        const height = (image.height / image.width) * width
        pdf.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height })
      }
      const out = join(this.dir(), `${name}.pdf`)
      await writeFile(out, await pdf.save())
      paths.push(out)
    }
    const imported = await this.deps.importFiles({ subjectId, paths })
    const first = imported[0]
    if (first) this.deps.onReceived({ id: first.id, title, pages: ordered.length })
    return imported.length
  }

  private async handle(
    req: IncomingMessage,
    token: string,
  ): Promise<{ status: number; type: string; data: string | Buffer }> {
    const text = (status: number, data: string) => ({
      status,
      type: 'text/plain; charset=utf-8',
      data,
    })
    if (!isPrivate(req.socket.remoteAddress))
      return text(403, 'Only devices on your network can scan')
    const url = new URL(req.url ?? '/', 'http://local')
    const [, s, given, action] = url.pathname.split('/')
    if (s !== 's' || given !== token || !this.session)
      return text(404, 'This scan link has expired. Show a new QR code in Atlas.')

    if (req.method === 'GET' && !action) {
      return { status: 200, type: 'text/html; charset=utf-8', data: SCANNER_PAGE }
    }

    if (req.method === 'POST' && action === 'page') {
      const batch = (url.searchParams.get('batch') ?? '').replace(/[^\w-]/g, '').slice(0, 40)
      const index = Number(url.searchParams.get('index'))
      if (!batch || !Number.isInteger(index) || index < 0 || index >= MAX_SLOTS)
        return text(400, 'Bad page')
      const current = this.batches.get(batch)
      if (current && !current.pages.has(index) && current.pages.size >= MAX_PAGES)
        return text(400, 'That is the most pages for one scan (60).')
      const bytes = await body(req, MAX_IMAGE)
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8
      const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
      if (!isJpeg && !isPng) return text(415, 'Send a photo')
      const dir = join(this.dir(), batch)
      await mkdir(dir, { recursive: true })
      const path = join(dir, `${String(index).padStart(3, '0')}.${isJpeg ? 'jpg' : 'png'}`)
      await writeFile(path, bytes)
      const entry = this.batches.get(batch) ?? { pages: new Map() }
      entry.pages.set(index, path)
      this.batches.set(batch, entry)
      this.deps.onProgress(this.pending())
      return text(200, 'ok')
    }

    if (req.method === 'POST' && action === 'drop') {
      const entry = this.batches.get(url.searchParams.get('batch') ?? '')
      const index = Number(url.searchParams.get('index'))
      const path = entry?.pages.get(index)
      if (entry && path) {
        entry.pages.delete(index)
        await rm(path, { force: true })
        this.deps.onProgress(this.pending())
      }
      return text(200, 'ok')
    }

    if (req.method === 'POST' && action === 'finish') {
      const raw = JSON.parse((await body(req, 20_000)).toString('utf8')) as {
        batch?: string
        title?: string
        mode?: string
        order?: unknown
      }
      const id = String(raw.batch ?? '')
      const batch = this.batches.get(id)
      if (!batch || batch.pages.size === 0) return text(400, 'No pages arrived')
      const order = Array.isArray(raw.order) ? raw.order.map(Number) : null
      const count = await this.save(
        id,
        batch,
        this.session.subjectId,
        String(raw.title ?? ''),
        raw.mode === 'photos' ? 'photos' : 'pdf',
        order,
      )
      return {
        status: 200,
        type: 'application/json',
        data: JSON.stringify({ ok: true, count }),
      }
    }

    return text(404, 'Not found')
  }
}

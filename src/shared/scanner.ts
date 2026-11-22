import { z } from 'zod'

export const ScanSessionSchema = z.object({
  /** The one-time link on this network, also encoded in the QR code. */
  url: z.string(),
  /** The QR code as a PNG data URL. */
  qr: z.string(),
  expiresAt: z.number(),
})
export type ScanSession = z.infer<typeof ScanSessionSchema>

import { z } from 'zod'

/**
 * The shared library: notes, files, flashcard decks and links that a small invite-only group
 * publishes for each other. Lives in one Supabase project (see `supabase/library.sql`).
 */

/** The free plan's per-file cap. Bigger files are shared as a link instead. */
export const SHARED_FILE_LIMIT = 50 * 1024 * 1024
/** The free plan's total file storage. */
export const SHARED_STORAGE_QUOTA = 1024 * 1024 * 1024

export const SHARED_KINDS = ['note', 'file', 'deck', 'link'] as const
export type SharedKind = (typeof SHARED_KINDS)[number]

export const CommunityStatusSchema = z.object({
  /** False until the project URL and key are built in. */
  configured: z.boolean(),
  signedIn: z.boolean(),
  member: z.boolean(),
  userId: z.string().nullable(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
})
export type CommunityStatus = z.infer<typeof CommunityStatusSchema>

export const SharedCardSchema = z.object({
  id: z.string(),
  owner: z.string(),
  kind: z.enum(SHARED_KINDS),
  title: z.string(),
  description: z.string(),
  subject: z.string(),
  tags: z.array(z.string()),
  fileName: z.string().nullable(),
  fileSize: z.number().nullable(),
  linkUrl: z.string().nullable(),
  remixOf: z.string().nullable(),
  downloads: z.number(),
  createdAt: z.string(),
  author: z.string(),
  likes: z.number(),
  liked: z.boolean(),
  remixes: z.number(),
  bodyLength: z.number(),
})
export type SharedCard = z.infer<typeof SharedCardSchema>

export const SharedItemSchema = SharedCardSchema.extend({
  body: z.string(),
  remixOfTitle: z.string().nullable(),
})
export type SharedItem = z.infer<typeof SharedItemSchema>

export const SharedQuerySchema = z.object({
  text: z.string().max(200).default(''),
  kind: z.enum(SHARED_KINDS).nullable().default(null),
  subject: z.string().max(80).nullable().default(null),
  sort: z.enum(['new', 'popular']).default('new'),
  mine: z.boolean().default(false),
  liked: z.boolean().default(false),
})
export type SharedQuery = z.input<typeof SharedQuerySchema>

export const SharedListSchema = z.object({
  items: z.array(SharedCardSchema),
  subjects: z.array(z.string()),
  storageUsed: z.number(),
  members: z.number(),
})
export type SharedList = z.infer<typeof SharedListSchema>

const meta = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(''),
  subject: z.string().max(80).default(''),
  tags: z.array(z.string().max(40)).max(12).default([]),
  remixOf: z.string().max(64).nullable().default(null),
}

export const PublishSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note'), noteId: z.string().max(64), ...meta }),
  z.object({ kind: z.literal('file'), sourceId: z.string().max(64), ...meta }),
  z.object({
    kind: z.literal('deck'),
    flashcardIds: z.array(z.string().max(64)).min(1).max(2000),
    ...meta,
  }),
  z.object({ kind: z.literal('link'), url: z.url().startsWith('https://'), ...meta }),
])
export type PublishInput = z.input<typeof PublishSchema>

export const DeckCardSchema = z.object({ front: z.string(), back: z.string() })

/** Where a remix landed in this profile. */
export const RemixResultSchema = z.object({
  kind: z.enum(['note', 'source', 'flashcards', 'link']),
  id: z.string().nullable(),
  count: z.number(),
})
export type RemixResult = z.infer<typeof RemixResultSchema>

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

/** Turns a free-text search into a Postgres `websearch_to_tsquery` input, or null when empty. */
export function searchTerms(text: string): string | null {
  const cleaned = text.replace(/[^\p{L}\p{N}\s"'-]/gu, ' ').trim()
  return cleaned ? cleaned.slice(0, 200) : null
}

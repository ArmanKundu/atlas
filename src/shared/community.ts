import { z } from 'zod'

/**
 * The shared library: notes, files, flashcard decks and links that a small invite-only group
 * publishes for each other. Lives in one Supabase project (see `supabase/library.sql` and `library-v2.sql`): people
 * belong to spaces (small communities with roles) and share into them.
 */

/** The free plan's per-file cap. Bigger files are shared as a link instead. */
export const SHARED_FILE_LIMIT = 50 * 1024 * 1024
/** The free plan's total file storage. */
export const SHARED_STORAGE_QUOTA = 1024 * 1024 * 1024

export const SHARED_KINDS = ['note', 'file', 'deck', 'link'] as const
export type SharedKind = (typeof SHARED_KINDS)[number]

export const SPACE_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const
export type SpaceRole = (typeof SPACE_ROLES)[number]
export const INVITE_ROLES = ['admin', 'editor', 'viewer'] as const
export type InviteRole = (typeof INVITE_ROLES)[number]

export const ROLE_LABEL: Record<SpaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
}
export const ROLE_HINT: Record<SpaceRole, string> = {
  owner: 'Made the space. Can do everything.',
  admin: 'Can invite people, approve requests and tidy anything.',
  editor: 'Can share and edit their own things.',
  viewer: 'Can browse, react and save copies.',
}
export function canWrite(role: SpaceRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor'
}
export function canManage(role: SpaceRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/** Avatar and space colours: names of the app's soft accent tokens. */
export const SPACE_COLORS = ['blue', 'green', 'purple', 'orange', 'pink', 'teal'] as const
export type SpaceColor = (typeof SPACE_COLORS)[number]
export const SPACE_BANNERS = ['sky', 'dusk', 'meadow', 'sunset', 'ocean', 'paper'] as const
export type SpaceBanner = (typeof SPACE_BANNERS)[number]
export const SPACE_ICONS = [
  'book-open',
  'users',
  'flask-conical',
  'calculator',
  'globe',
  'pen-tool',
  'brain',
  'dna',
  'atom',
  'landmark',
  'music',
  'sparkles',
] as const
export type SpaceIcon = (typeof SPACE_ICONS)[number]

export const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/

export const ProfileSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarColor: z.string(),
})
export type Profile = z.infer<typeof ProfileSchema>

export const ProfileInputSchema = z.object({
  username: z.string().trim().toLowerCase().regex(USERNAME_PATTERN),
  displayName: z.string().trim().min(1).max(60),
  avatarColor: z.enum(SPACE_COLORS).default('blue'),
})
export type ProfileInput = z.input<typeof ProfileInputSchema>

export const CommunityStatusSchema = z.object({
  /** False until the project URL and key are built in. */
  configured: z.boolean(),
  signedIn: z.boolean(),
  userId: z.string().nullable(),
  email: z.string().nullable(),
  /** Null until the student picks a name and @username. */
  profile: ProfileSchema.nullable(),
  /** Unread inbox notifications. */
  unread: z.number(),
  /** Null when signed out. Waitlisted people wait for the admin to let them in. */
  access: z.enum(['approved', 'waitlisted']).nullable(),
  isAdmin: z.boolean(),
  /** How many accounts Atlas allows, and how many are taken. */
  capacity: z.number(),
  used: z.number(),
})
export type CommunityStatus = z.infer<typeof CommunityStatusSchema>

export const CapacitySchema = z.object({ capacity: z.number(), used: z.number() })
export type Capacity = z.infer<typeof CapacitySchema>

export const AccessEntrySchema = z.object({
  userId: z.string(),
  email: z.string(),
  status: z.enum(['approved', 'waitlisted']),
  createdAt: z.string(),
  displayName: z.string().nullable(),
  username: z.string().nullable(),
})
export type AccessEntry = z.infer<typeof AccessEntrySchema>

export const FEEDBACK_KINDS = ['bug', 'idea', 'other'] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export const FeedbackInputSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  title: z.string().trim().min(1).max(140),
  body: z.string().max(8000).default(''),
  /** A local screenshot or recording to attach. */
  attachment: z.string().nullable().default(null),
})
export type FeedbackInput = z.input<typeof FeedbackInputSchema>

export const FeedbackSchema = z.object({
  id: z.string(),
  kind: z.enum(FEEDBACK_KINDS),
  title: z.string(),
  body: z.string(),
  attachmentUrl: z.string().nullable(),
  attachmentName: z.string().nullable(),
  appVersion: z.string(),
  platform: z.string(),
  status: z.enum(['new', 'seen', 'done']),
  createdAt: z.string(),
  from: z.string(),
})
export type Feedback = z.infer<typeof FeedbackSchema>

export const SpaceInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(500).default(''),
  icon: z.enum(SPACE_ICONS).default('book-open'),
  color: z.enum(SPACE_COLORS).default('blue'),
  banner: z.enum(SPACE_BANNERS).default('sky'),
  visibility: z.enum(['private', 'public']).default('private'),
  requireApproval: z.boolean().default(true),
  defaultRole: z.enum(['viewer', 'editor']).default('viewer'),
})
export type SpaceInput = z.input<typeof SpaceInputSchema>

export const SpaceSchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  color: z.string(),
  banner: z.string(),
  visibility: z.enum(['private', 'public']),
  requireApproval: z.boolean(),
  defaultRole: z.enum(['viewer', 'editor']),
  createdAt: z.string(),
  role: z.enum(SPACE_ROLES),
  /** Only owners and admins see the join code. */
  joinCode: z.string().nullable(),
  memberCount: z.number(),
  itemCount: z.number(),
})
export type Space = z.infer<typeof SpaceSchema>

export const MemberSchema = ProfileSchema.extend({
  role: z.enum(SPACE_ROLES),
  joinedAt: z.string(),
})
export type Member = z.infer<typeof MemberSchema>

export const SpacePeopleSchema = z.object({
  members: z.array(MemberSchema),
  /** Waiting for an owner or admin; only they see these. */
  requests: z.array(z.object({ id: z.string(), user: ProfileSchema, createdAt: z.string() })),
  invites: z.array(
    z.object({
      id: z.string(),
      user: ProfileSchema,
      role: z.enum(INVITE_ROLES),
      createdAt: z.string(),
    }),
  ),
})
export type SpacePeople = z.infer<typeof SpacePeopleSchema>

export const JoinResultSchema = z.object({
  status: z.enum(['joined', 'requested', 'already']),
  spaceId: z.string(),
  name: z.string(),
})
export type JoinResult = z.infer<typeof JoinResultSchema>

export const NOTIFICATION_KINDS = [
  'invite',
  'join_request',
  'request_approved',
  'request_declined',
  'invite_accepted',
  'role_changed',
  'waitlist',
] as const

export const NotificationSchema = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  spaceId: z.string().nullable(),
  spaceName: z.string(),
  actor: ProfileSchema.nullable(),
  refId: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
  /** For invites and join requests: still waiting for an answer. */
  open: z.boolean(),
  /** The role an invite offers. */
  role: z.enum(INVITE_ROLES).nullable(),
})
export type Notification = z.infer<typeof NotificationSchema>

export const SharedCardSchema = z.object({
  id: z.string(),
  spaceId: z.string(),
  spaceName: z.string(),
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
  updatedAt: z.string(),
  author: z.string(),
  ups: z.number(),
  downs: z.number(),
  /** -1, 0 or 1. */
  myReaction: z.number(),
  remixes: z.number(),
  bodyLength: z.number(),
  /** The author, or an owner or admin of the space. */
  canEdit: z.boolean(),
})
export type SharedCard = z.infer<typeof SharedCardSchema>

export const SharedItemSchema = SharedCardSchema.extend({
  body: z.string(),
  remixOfTitle: z.string().nullable(),
})
export type SharedItem = z.infer<typeof SharedItemSchema>

export const SharedQuerySchema = z.object({
  /** Null: every space the student is in. */
  spaceId: z.string().max(64).nullable().default(null),
  text: z.string().max(200).default(''),
  kind: z.enum(SHARED_KINDS).nullable().default(null),
  subject: z.string().max(80).nullable().default(null),
  sort: z.enum(['new', 'top']).default('new'),
  mine: z.boolean().default(false),
  limit: z.number().int().min(1).max(300).default(300),
})
export type SharedQuery = z.input<typeof SharedQuerySchema>

export const SharedListSchema = z.object({
  items: z.array(SharedCardSchema),
  subjects: z.array(z.string()),
  storageUsed: z.number(),
})
export type SharedList = z.infer<typeof SharedListSchema>

const meta = {
  spaceId: z.string().max(64),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(''),
  subject: z.string().max(80).default(''),
  tags: z.array(z.string().max(40)).max(12).default([]),
  remixOf: z.string().max(64).nullable().default(null),
}

/**
 * A note is either one of the student's notes (noteId) or written right there (body).
 * A file is either from their library (sourceId) or picked from the computer (path).
 */
export const PublishSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('note'),
    noteId: z.string().max(64).nullable().default(null),
    body: z.string().max(400000).default(''),
    ...meta,
  }),
  z.object({
    kind: z.literal('file'),
    sourceId: z.string().max(64).nullable().default(null),
    path: z.string().max(4000).nullable().default(null),
    ...meta,
  }),
  z.object({
    kind: z.literal('deck'),
    flashcardIds: z.array(z.string().max(64)).min(1).max(2000),
    ...meta,
  }),
  z.object({ kind: z.literal('link'), url: z.url().startsWith('https://'), ...meta }),
])
export type PublishInput = z.input<typeof PublishSchema>

export const SharedUpdateSchema = z.object({
  id: z.string().max(64),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  subject: z.string().max(80),
  tags: z.array(z.string().max(40)).max(12),
  /** Notes: the new text. */
  body: z.string().max(400000).optional(),
  /** Links: the new address. */
  url: z.url().startsWith('https://').optional(),
  /** Files: a replacement picked from the computer. */
  path: z.string().max(4000).optional(),
})
export type SharedUpdate = z.input<typeof SharedUpdateSchema>

/** A file picked from the computer, before it is shared. */
export const PickedFileSchema = z.object({ path: z.string(), name: z.string(), size: z.number() })
export type PickedFile = z.infer<typeof PickedFileSchema>

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

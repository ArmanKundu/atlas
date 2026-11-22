import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { BrowserWindow, app, dialog } from 'electron'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AtlasError } from '@shared/errors'
import { LIBRARY_KEY, LIBRARY_URL } from '@shared/constants'
import {
  FeedbackInputSchema,
  ProfileInputSchema,
  PublishSchema,
  SHARED_FILE_LIMIT,
  SharedQuerySchema,
  SharedUpdateSchema,
  SpaceInputSchema,
  canManage,
  canWrite,
  formatBytes,
  searchTerms,
  type AccessEntry,
  type Capacity,
  type CommunityStatus,
  type Feedback,
  type FeedbackInput,
  type InviteRole,
  type JoinResult,
  type Notification,
  type PickedFile,
  type Profile,
  type ProfileInput,
  type PublishInput,
  type RemixResult,
  type SharedCard,
  type SharedItem,
  type SharedList,
  type SharedQuery,
  type SharedUpdate,
  type Space,
  type SpaceInput,
  type SpacePeople,
  type SpaceRole,
} from '@shared/community'
import type { SecretStore } from './ai/secrets'
import type { Database } from './db/database'
import { importPaths } from './library'
import type { Logger } from './log'

const SESSION_KEY = 'library.session'
const CARD_COLUMNS =
  'id, space_id, owner, kind, title, description, subject, tags, file_name, file_size, link_url, remix_of, downloads, created_at, updated_at, author, ups, downs, my_reaction, remixes, body_length'
const PROFILE_COLUMNS = 'user_id, username, display_name, avatar_color'

type Row = Record<string, unknown>

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

function toProfile(row: Row | null | undefined): Profile | null {
  if (!row || !row['user_id']) return null
  return {
    userId: String(row['user_id']),
    username: String(row['username'] ?? ''),
    displayName: String(row['display_name'] ?? ''),
    avatarColor: String(row['avatar_color'] ?? 'blue'),
  }
}

function one(value: unknown): Row | null {
  if (Array.isArray(value)) return (value[0] as Row | undefined) ?? null
  return (value as Row | null) ?? null
}

function toSpace(row: Row): Space {
  return {
    id: String(row['id']),
    owner: String(row['owner']),
    name: String(row['name']),
    description: String(row['description'] ?? ''),
    icon: String(row['icon'] ?? 'book-open'),
    color: String(row['color'] ?? 'blue'),
    banner: String(row['banner'] ?? 'sky'),
    visibility: row['visibility'] === 'public' ? 'public' : 'private',
    requireApproval: Boolean(row['require_approval']),
    defaultRole: row['default_role'] === 'editor' ? 'editor' : 'viewer',
    createdAt: String(row['created_at']),
    role: row['role'] as SpaceRole,
    joinCode: (row['join_code'] as string | null) ?? null,
    memberCount: Number(row['member_count'] ?? 0),
    itemCount: Number(row['item_count'] ?? 0),
  }
}

function toCard(row: Row, me: string, spaces: Map<string, Space>): SharedCard {
  const space = spaces.get(String(row['space_id']))
  const owner = String(row['owner'])
  return {
    id: String(row['id']),
    spaceId: String(row['space_id']),
    spaceName: space?.name ?? 'Shared',
    owner,
    kind: row['kind'] as SharedCard['kind'],
    title: String(row['title'] ?? ''),
    description: String(row['description'] ?? ''),
    subject: String(row['subject'] ?? ''),
    tags: Array.isArray(row['tags']) ? (row['tags'] as string[]) : [],
    fileName: (row['file_name'] as string | null) ?? null,
    fileSize: row['file_size'] === null ? null : Number(row['file_size']),
    linkUrl: (row['link_url'] as string | null) ?? null,
    remixOf: (row['remix_of'] as string | null) ?? null,
    downloads: Number(row['downloads'] ?? 0),
    createdAt: String(row['created_at']),
    updatedAt: String(row['updated_at'] ?? row['created_at']),
    author: String(row['author'] ?? 'Someone'),
    ups: Number(row['ups'] ?? 0),
    downs: Number(row['downs'] ?? 0),
    myReaction: Number(row['my_reaction'] ?? 0),
    remixes: Number(row['remixes'] ?? 0),
    bodyLength: Number(row['body_length'] ?? 0),
    canEdit: owner === me || canManage(space?.role),
  }
}

/** Short, human versions of the errors Supabase sends back. */
export function friendly(
  error: { message?: string; code?: string } | null | undefined,
  fallback: string,
): AtlasError {
  const message = error?.message ?? ''
  if (/token has expired|otp.*expired|invalid.*otp|token.*invalid/i.test(message))
    return new AtlasError('forbidden', 'That code is not right or has expired. Send a new one.')
  if (/rate limit|security purposes|too many/i.test(message))
    return new AtlasError(
      'unavailable',
      'Too many codes asked for. Wait a minute, then send a new one.',
    )
  if (/error sending|smtp|email.*(provider|disabled)/i.test(message))
    return new AtlasError(
      'unavailable',
      'The sign-in email could not be sent. The library owner needs to finish the email setup.',
    )
  if (/signups not allowed/i.test(message))
    return new AtlasError('forbidden', 'New accounts are switched off for this library.')
  if (/profiles_username_key|duplicate key.*username/i.test(message))
    return new AtlasError('conflict', 'That @username is taken. Try another.')
  if (/No space has that code/i.test(message))
    return new AtlasError('not_found', 'No space has that code. Check it with whoever shared it.')
  if (
    /Only the Atlas admin|admin keeps access|Only owners and admins|already in this space|owner keeps|owner cannot leave|no longer open|already handled|Set up your profile/i.test(
      message,
    )
  )
    return new AtlasError('forbidden', message)
  if (/row-level security|permission denied/i.test(message))
    return new AtlasError('forbidden', 'Your role in this space does not allow that.')
  if (/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(message))
    return new AtlasError(
      'unavailable',
      'Atlas could not reach the shared library. Check the internet.',
    )
  if (/exceeded|too large|payload/i.test(message))
    return new AtlasError('bad_request', 'The shared library is full or the file is too big.')
  return new AtlasError('internal', message ? `${fallback} (${message})` : fallback)
}

async function sha256(bytes: Buffer): Promise<string> {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * The shared library, from the main process (the renderer's CSP allows no outside requests).
 * Sign-in is a one-time code sent by email; the session is kept encrypted with the OS keychain,
 * beside the AI settings. People belong to spaces and share into them.
 */
export class CommunityLibrary {
  private client: SupabaseClient | null = null
  private profileCache: Profile | null | undefined
  private accessCache:
    | { status: 'approved' | 'waitlisted'; isAdmin: boolean; capacity: number; used: number }
    | undefined

  constructor(
    private readonly deps: {
      secrets: SecretStore
      log: Logger
      db: () => Database
      filesDir: () => string
      onLibraryChanged: () => void
    },
  ) {}

  private config(): { url: string; key: string } | null {
    const url = process.env['ATLAS_LIBRARY_URL'] || LIBRARY_URL
    const key = process.env['ATLAS_LIBRARY_KEY'] || LIBRARY_KEY
    return url && key ? { url, key } : null
  }

  private supabase(): SupabaseClient {
    if (this.client) return this.client
    const config = this.config()
    if (!config) {
      throw new AtlasError(
        'unavailable',
        'The shared library has not been set up in this build yet.',
      )
    }
    const secrets = this.deps.secrets
    this.client = createClient(config.url, config.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: SESSION_KEY,
        storage: {
          getItem: (key) => (key === SESSION_KEY ? secrets.get(SESSION_KEY) : null),
          setItem: (key, value) => {
            if (key === SESSION_KEY) secrets.set(SESSION_KEY, value)
          },
          removeItem: (key) => {
            if (key === SESSION_KEY) secrets.delete(SESSION_KEY)
          },
        },
      },
    })
    return this.client
  }

  private async userId(): Promise<string> {
    const { data } = await this.supabase().auth.getSession()
    const id = data.session?.user.id
    if (!id) throw new AtlasError('forbidden', 'Sign in to the shared library first.')
    return id
  }

  private async rpc<T>(name: string, args: Row, fallback: string): Promise<T> {
    const { data, error } = await this.supabase().rpc(name, args)
    if (error) throw friendly(error, fallback)
    return data as T
  }

  /* ---------- Account ---------- */

  async status(): Promise<CommunityStatus> {
    const empty: CommunityStatus = {
      configured: Boolean(this.config()),
      signedIn: false,
      userId: null,
      email: null,
      profile: null,
      unread: 0,
      access: null,
      isAdmin: false,
      capacity: 0,
      used: 0,
    }
    if (!empty.configured) return empty
    const sb = this.supabase()
    const { data } = await sb.auth.getSession()
    const user = data.session?.user
    if (!user) return empty
    // Approved stays approved for the session; a waitlisted place is checked each time.
    if (this.accessCache?.status !== 'approved') {
      const claim = await this.rpc<Row>('claim_access', {}, 'Could not check your place in Atlas.')
      this.accessCache = {
        status: claim['status'] === 'approved' ? 'approved' : 'waitlisted',
        isAdmin: Boolean(claim['is_admin']),
        capacity: Number(claim['capacity'] ?? 0),
        used: Number(claim['used'] ?? 0),
      }
    }
    const access = this.accessCache
    if (access.status === 'waitlisted') {
      return {
        ...empty,
        signedIn: true,
        userId: user.id,
        email: user.email ?? null,
        access: 'waitlisted',
        capacity: access.capacity,
        used: access.used,
      }
    }
    if (this.profileCache === undefined) {
      const { data: row, error } = await sb
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw friendly(error, 'Could not load your profile.')
      this.profileCache = toProfile(row as Row | null)
    }
    let unread = 0
    if (this.profileCache) {
      const { count } = await sb
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('read', false)
      unread = count ?? 0
    }
    return {
      ...empty,
      signedIn: true,
      userId: user.id,
      email: user.email ?? null,
      profile: this.profileCache,
      unread,
      access: 'approved',
      isAdmin: access.isAdmin,
      capacity: access.capacity,
      used: access.used,
    }
  }

  /** How full Atlas is. Works signed out, so the sign-in screen can warn early. */
  async capacity(): Promise<Capacity> {
    const data = await this.rpc<Row>('capacity_status', {}, 'Could not check how full Atlas is.')
    return { capacity: Number(data['capacity'] ?? 0), used: Number(data['used'] ?? 0) }
  }

  async recheckAccess(): Promise<CommunityStatus> {
    this.accessCache = undefined
    this.profileCache = undefined
    return this.status()
  }

  /* ---------- Admin ---------- */

  async adminAccess(): Promise<AccessEntry[]> {
    const rows = await this.rpc<Row[]>('admin_access_list', {}, 'Could not load the accounts.')
    return (rows ?? []).map((r) => ({
      userId: String(r['user_id']),
      email: String(r['email'] ?? ''),
      status: r['status'] === 'approved' ? 'approved' : 'waitlisted',
      createdAt: String(r['created_at']),
      displayName: (r['display_name'] as string | null) ?? null,
      username: (r['username'] as string | null) ?? null,
    }))
  }

  async adminSetAccess(input: {
    userId: string
    status: 'approved' | 'waitlisted' | 'removed'
  }): Promise<void> {
    await this.rpc(
      'admin_set_access',
      { target: input.userId, new_status: input.status },
      'Could not change that account.',
    )
    this.accessCache = undefined
  }

  async adminSetCapacity(capacity: number): Promise<void> {
    await this.rpc('admin_set_capacity', { cap: capacity }, 'Could not change the limit.')
    this.accessCache = undefined
  }

  async adminFeedback(): Promise<Feedback[]> {
    const sb = this.supabase()
    const { data, error } = await sb
      .from('feedback')
      .select(
        'id, kind, title, body, attachment, app_version, platform, status, created_at, user_id',
      )
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw friendly(error, 'Could not load the reports.')
    const rows = (data ?? []) as Row[]
    const ids = [...new Set(rows.map((r) => String(r['user_id'])))]
    const { data: people } = ids.length
      ? await sb.from('profiles').select(PROFILE_COLUMNS).in('user_id', ids)
      : { data: [] }
    const names = new Map(
      ((people ?? []) as Row[]).map((p) => [
        String(p['user_id']),
        `${String(p['display_name'])} @${String(p['username'])}`,
      ]),
    )
    return Promise.all(
      rows.map(async (r) => {
        const path = (r['attachment'] as string | null) ?? null
        let url: string | null = null
        if (path) {
          const signed = await sb.storage.from('feedback').createSignedUrl(path, 60 * 60)
          url = signed.data?.signedUrl ?? null
        }
        return {
          id: String(r['id']),
          kind: (r['kind'] as Feedback['kind']) ?? 'other',
          title: String(r['title']),
          body: String(r['body'] ?? ''),
          attachmentUrl: url,
          attachmentName: path ? basename(path) : null,
          appVersion: String(r['app_version'] ?? ''),
          platform: String(r['platform'] ?? ''),
          status: (r['status'] as Feedback['status']) ?? 'new',
          createdAt: String(r['created_at']),
          from: names.get(String(r['user_id'])) ?? 'Someone',
        }
      }),
    )
  }

  async adminSetFeedback(input: { id: string; status: Feedback['status'] }): Promise<void> {
    const { error } = await this.supabase()
      .from('feedback')
      .update({ status: input.status })
      .eq('id', input.id)
    if (error) throw friendly(error, 'Could not update the report.')
  }

  /* ---------- Feedback ---------- */

  /** Sends a bug report or idea to the Atlas developer, with an optional screenshot or recording. */
  async sendFeedback(raw: FeedbackInput): Promise<void> {
    const input = FeedbackInputSchema.parse(raw)
    const me = await this.userId()
    const sb = this.supabase()
    let attachment: string | null = null
    if (input.attachment) {
      const bytes = await readFile(input.attachment)
      if (bytes.byteLength > 50 * 1024 * 1024)
        throw new AtlasError('bad_request', 'The recording is over 50 MB. Record a shorter clip.')
      const ext = extname(input.attachment).toLowerCase() || '.png'
      attachment = `${me}/${Date.now()}${ext}`
      const { error } = await sb.storage.from('feedback').upload(attachment, bytes, {
        contentType: MIME[ext] ?? 'application/octet-stream',
        upsert: false,
      })
      if (error) throw friendly(error, 'Could not upload the screenshot.')
    }
    const { error } = await sb.from('feedback').insert({
      kind: input.kind,
      title: input.title,
      body: input.body,
      attachment,
      app_version: app.getVersion(),
      platform: `${process.platform} ${process.arch}`,
    })
    if (error) throw friendly(error, 'Could not send the report.')
  }

  /** Emails a one-time code. Makes the account on first use. */
  async sendCode(email: string): Promise<void> {
    const { error } = await this.supabase().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    })
    if (error) throw friendly(error, 'Could not send the code.')
  }

  async verifyCode(input: { email: string; code: string }): Promise<CommunityStatus> {
    const { error } = await this.supabase().auth.verifyOtp({
      email: input.email.trim().toLowerCase(),
      token: input.code.replace(/\D/g, ''),
      type: 'email',
    })
    if (error) throw friendly(error, 'Could not check the code.')
    this.profileCache = undefined
    this.accessCache = undefined
    return this.status()
  }

  async signOut(): Promise<CommunityStatus> {
    await this.supabase().auth.signOut()
    this.deps.secrets.delete(SESSION_KEY)
    this.profileCache = undefined
    this.accessCache = undefined
    return this.status()
  }

  async usernameFree(username: string): Promise<boolean> {
    const me = await this.userId()
    const { data } = await this.supabase()
      .from('profiles')
      .select('user_id')
      .eq('username', username.trim().toLowerCase())
      .maybeSingle()
    return !data || (data as Row)['user_id'] === me
  }

  async saveProfile(raw: ProfileInput): Promise<CommunityStatus> {
    const input = ProfileInputSchema.parse(raw)
    const me = await this.userId()
    const { error } = await this.supabase().from('profiles').upsert({
      user_id: me,
      username: input.username,
      display_name: input.displayName,
      avatar_color: input.avatarColor,
    })
    if (error) throw friendly(error, 'Could not save your profile.')
    this.profileCache = undefined
    return this.status()
  }

  /* ---------- Spaces ---------- */

  async spaces(): Promise<Space[]> {
    await this.userId()
    const { data, error } = await this.supabase()
      .from('my_spaces')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) throw friendly(error, 'Could not load your spaces.')
    return ((data ?? []) as Row[]).map(toSpace)
  }

  private async spaceMap(): Promise<Map<string, Space>> {
    return new Map((await this.spaces()).map((s) => [s.id, s]))
  }

  async createSpace(raw: SpaceInput): Promise<Space> {
    const input = SpaceInputSchema.parse(raw)
    const id = await this.rpc<string>(
      'create_space',
      {
        name: input.name,
        description: input.description,
        icon: input.icon,
        color: input.color,
        banner: input.banner,
        visibility: input.visibility,
        require_approval: input.requireApproval,
        default_role: input.defaultRole,
      },
      'Could not make the space.',
    )
    const space = (await this.spaces()).find((s) => s.id === id)
    if (!space) throw new AtlasError('internal', 'The space was made but could not be loaded.')
    return space
  }

  async updateSpace(input: { id: string } & SpaceInput): Promise<void> {
    const v = SpaceInputSchema.parse(input)
    const { error } = await this.supabase()
      .from('spaces')
      .update({
        name: v.name,
        description: v.description,
        icon: v.icon,
        color: v.color,
        banner: v.banner,
        visibility: v.visibility,
        require_approval: v.requireApproval,
        default_role: v.defaultRole,
      })
      .eq('id', input.id)
    if (error) throw friendly(error, 'Could not save the space.')
  }

  async deleteSpace(id: string): Promise<void> {
    const sb = this.supabase()
    const { data: files } = await sb.from('items').select('file_path').eq('space_id', id)
    const { error } = await sb.from('spaces').delete().eq('id', id)
    if (error) throw friendly(error, 'Could not delete the space.')
    const paths = ((files ?? []) as Row[])
      .map((r) => r['file_path'])
      .filter((p): p is string => typeof p === 'string')
    if (paths.length) await sb.storage.from('library').remove(paths)
  }

  async regenerateCode(spaceId: string): Promise<string> {
    return this.rpc<string>('regenerate_code', { space: spaceId }, 'Could not make a new code.')
  }

  async joinByCode(code: string): Promise<JoinResult> {
    const data = await this.rpc<Row>('join_by_code', { code }, 'Could not join.')
    return {
      status: data['status'] as JoinResult['status'],
      spaceId: String(data['space_id']),
      name: String(data['name']),
    }
  }

  async people(spaceId: string): Promise<SpacePeople> {
    await this.userId()
    const sb = this.supabase()
    const [members, requests, invites] = await Promise.all([
      sb
        .from('space_members')
        .select(`role, joined_at, profile:profiles (${PROFILE_COLUMNS})`)
        .eq('space_id', spaceId),
      sb
        .from('join_requests')
        .select(`id, created_at, user:profiles!join_requests_user_id_fkey (${PROFILE_COLUMNS})`)
        .eq('space_id', spaceId)
        .eq('status', 'pending'),
      sb
        .from('invites')
        .select(`id, role, created_at, user:profiles!invites_invitee_fkey (${PROFILE_COLUMNS})`)
        .eq('space_id', spaceId)
        .eq('status', 'pending'),
    ])
    if (members.error) throw friendly(members.error, 'Could not load the people.')
    const order: SpaceRole[] = ['owner', 'admin', 'editor', 'viewer']
    return {
      members: ((members.data ?? []) as Row[])
        .map((r) => {
          const p = toProfile(one(r['profile']))
          return p ? { ...p, role: r['role'] as SpaceRole, joinedAt: String(r['joined_at']) } : null
        })
        .filter((m): m is NonNullable<typeof m> => m !== null)
        .sort(
          (a, b) =>
            order.indexOf(a.role) - order.indexOf(b.role) ||
            a.displayName.localeCompare(b.displayName),
        ),
      requests: ((requests.data ?? []) as Row[]).flatMap((r) => {
        const user = toProfile(one(r['user']))
        return user ? [{ id: String(r['id']), user, createdAt: String(r['created_at']) }] : []
      }),
      invites: ((invites.data ?? []) as Row[]).flatMap((r) => {
        const user = toProfile(one(r['user']))
        return user
          ? [
              {
                id: String(r['id']),
                user,
                role: r['role'] as InviteRole,
                createdAt: String(r['created_at']),
              },
            ]
          : []
      }),
    }
  }

  async searchUsers(q: string): Promise<Profile[]> {
    if (q.trim().length < 2) return []
    const data = await this.rpc<Row[]>('search_users', { q }, 'Could not search.')
    return (data ?? []).map((r) => toProfile(r)).filter((p): p is Profile => p !== null)
  }

  async invite(input: { spaceId: string; userId: string; role: InviteRole }): Promise<void> {
    await this.rpc(
      'invite_user',
      { space: input.spaceId, target: input.userId, new_role: input.role },
      'Could not send the invite.',
    )
  }

  async setRole(input: { spaceId: string; userId: string; role: InviteRole }): Promise<void> {
    await this.rpc(
      'set_member_role',
      { space: input.spaceId, target: input.userId, new_role: input.role },
      'Could not change the role.',
    )
  }

  async removeMember(input: { spaceId: string; userId: string }): Promise<void> {
    await this.rpc(
      'remove_member',
      { space: input.spaceId, target: input.userId },
      'Could not remove them.',
    )
  }

  async leave(spaceId: string): Promise<void> {
    await this.removeMember({ spaceId, userId: await this.userId() })
  }

  /* ---------- Inbox ---------- */

  async inbox(): Promise<Notification[]> {
    await this.userId()
    const sb = this.supabase()
    const { data, error } = await sb
      .from('notifications')
      .select(
        `id, kind, space_id, ref_id, read, created_at, space:spaces (name), actor:profiles!notifications_actor_fkey (${PROFILE_COLUMNS})`,
      )
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw friendly(error, 'Could not load your inbox.')
    const rows = (data ?? []) as Row[]
    const inviteIds = rows.filter((r) => r['kind'] === 'invite').map((r) => String(r['ref_id']))
    const requestIds = rows
      .filter((r) => r['kind'] === 'join_request')
      .map((r) => String(r['ref_id']))
    const [invites, requests] = await Promise.all([
      inviteIds.length
        ? sb.from('invites').select('id, status, role').in('id', inviteIds)
        : Promise.resolve({ data: [] }),
      requestIds.length
        ? sb.from('join_requests').select('id, status').in('id', requestIds)
        : Promise.resolve({ data: [] }),
    ])
    const state = new Map<string, Row>()
    for (const r of [...((invites.data ?? []) as Row[]), ...((requests.data ?? []) as Row[])]) {
      state.set(String(r['id']), r)
    }
    return rows.map((r) => {
      const ref = r['ref_id'] ? String(r['ref_id']) : null
      const linked = ref ? state.get(ref) : undefined
      const kind = r['kind'] as Notification['kind']
      return {
        id: String(r['id']),
        kind,
        spaceId: (r['space_id'] as string | null) ?? null,
        spaceName: String(one(r['space'])?.['name'] ?? 'a space'),
        actor: toProfile(one(r['actor'])),
        refId: ref,
        read: Boolean(r['read']),
        createdAt: String(r['created_at']),
        open: (kind === 'invite' || kind === 'join_request') && linked?.['status'] === 'pending',
        role: kind === 'invite' ? ((linked?.['role'] as InviteRole | undefined) ?? null) : null,
      }
    })
  }

  async markRead(): Promise<void> {
    await this.userId()
    await this.supabase().from('notifications').update({ read: true }).eq('read', false)
  }

  async respondInvite(input: { id: string; accept: boolean }): Promise<void> {
    await this.rpc(
      'respond_invite',
      { invite: input.id, accept: input.accept },
      'Could not answer the invite.',
    )
  }

  async decideRequest(input: { id: string; approve: boolean; role: InviteRole }): Promise<void> {
    await this.rpc(
      'decide_request',
      { request: input.id, approve: input.approve, new_role: input.role },
      'Could not answer the request.',
    )
  }

  /* ---------- Items ---------- */

  async list(raw: SharedQuery): Promise<SharedList> {
    const query = SharedQuerySchema.parse(raw)
    const me = await this.userId()
    const sb = this.supabase()
    let request = sb.from('item_cards').select(CARD_COLUMNS).limit(query.limit)
    const terms = searchTerms(query.text)
    if (terms)
      request = request.textSearch('search', terms, { type: 'websearch', config: 'english' })
    if (query.spaceId) request = request.eq('space_id', query.spaceId)
    if (query.kind) request = request.eq('kind', query.kind)
    if (query.subject) request = request.eq('subject', query.subject)
    if (query.mine) request = request.eq('owner', me)
    request =
      query.sort === 'top'
        ? request.order('ups', { ascending: false }).order('downloads', { ascending: false })
        : request.order('created_at', { ascending: false })

    let files = sb.from('items').select('subject, file_sha256, file_size')
    if (query.spaceId) files = files.eq('space_id', query.spaceId)
    const [items, all, spaces] = await Promise.all([request, files, this.spaceMap()])
    if (items.error) throw friendly(items.error, 'Could not load the shared library.')
    const seen = new Map<string, number>()
    const subjects = new Set<string>()
    for (const row of (all.data ?? []) as Row[]) {
      if (row['subject']) subjects.add(String(row['subject']))
      if (row['file_sha256']) seen.set(String(row['file_sha256']), Number(row['file_size'] ?? 0))
    }
    return {
      items: ((items.data ?? []) as Row[]).map((r) => toCard(r, me, spaces)),
      subjects: [...subjects].sort((a, b) => a.localeCompare(b)),
      storageUsed: [...seen.values()].reduce((a, b) => a + b, 0),
    }
  }

  async get(id: string): Promise<SharedItem> {
    const me = await this.userId()
    const sb = this.supabase()
    const [card, full, spaces] = await Promise.all([
      sb.from('item_cards').select(CARD_COLUMNS).eq('id', id).maybeSingle(),
      sb.from('items').select('body, remix_of').eq('id', id).maybeSingle(),
      this.spaceMap(),
    ])
    if (card.error || full.error) throw friendly(card.error ?? full.error, 'Could not open that.')
    if (!card.data || !full.data) throw new AtlasError('not_found', 'That has been removed.')
    let remixOfTitle: string | null = null
    const parent = (full.data as Row)['remix_of']
    if (typeof parent === 'string') {
      const { data } = await sb.from('items').select('title').eq('id', parent).maybeSingle()
      remixOfTitle = (data?.['title'] as string | undefined) ?? null
    }
    return {
      ...toCard(card.data as Row, me, spaces),
      body: String((full.data as Row)['body'] ?? ''),
      remixOfTitle,
    }
  }

  /** Opens the system file picker for something to share. */
  async pickFile(): Promise<PickedFile | null> {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options = {
      title: 'Choose a file to share',
      properties: ['openFile'] as 'openFile'[],
    }
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    const path = picked.filePaths[0]
    if (picked.canceled || !path) return null
    return this.describeFile(path)
  }

  async describeFile(path: string): Promise<PickedFile> {
    const info = await stat(path).catch(() => null)
    if (!info?.isFile()) throw new AtlasError('not_found', 'That file could not be opened.')
    return { path, name: basename(path), size: info.size }
  }

  /** Uploads bytes into the space's folder, reusing a copy already shared there. */
  private async upload(
    spaceId: string,
    me: string,
    file: { bytes: Buffer; name: string; mime?: string },
  ): Promise<Row> {
    const size = file.bytes.byteLength
    if (size > SHARED_FILE_LIMIT) {
      throw new AtlasError(
        'bad_request',
        `This file is ${formatBytes(size)}; the shared library takes files up to ${formatBytes(SHARED_FILE_LIMIT)}. Share it as a link instead (Google Drive, OneDrive).`,
      )
    }
    const sb = this.supabase()
    const sha = await sha256(file.bytes)
    const { data: same } = await sb
      .from('items')
      .select('file_path')
      .eq('space_id', spaceId)
      .eq('file_sha256', sha)
      .not('file_path', 'is', null)
      .limit(1)
    let path = (same?.[0]?.['file_path'] as string | undefined) ?? null
    if (!path) {
      const ext = extname(file.name).toLowerCase()
      path = `${spaceId}/${me}/${sha}${ext}`
      const { error } = await sb.storage.from('library').upload(path, file.bytes, {
        contentType: file.mime ?? MIME[ext] ?? 'application/octet-stream',
        upsert: true,
      })
      if (error) throw friendly(error, 'Could not upload the file.')
    }
    return { file_path: path, file_name: file.name, file_size: size, file_sha256: sha }
  }

  private async readLocal(path: string): Promise<{ bytes: Buffer; name: string }> {
    const info = await this.describeFile(path)
    if (info.size > SHARED_FILE_LIMIT) {
      throw new AtlasError(
        'bad_request',
        `This file is ${formatBytes(info.size)}; the shared library takes files up to ${formatBytes(SHARED_FILE_LIMIT)}. Share it as a link instead (Google Drive, OneDrive).`,
      )
    }
    return { bytes: await readFile(path), name: info.name }
  }

  async publish(raw: PublishInput): Promise<SharedCard> {
    const input = PublishSchema.parse(raw)
    const me = await this.userId()
    const sb = this.supabase()
    const row: Row = {
      owner: me,
      space_id: input.spaceId,
      kind: input.kind,
      title: input.title,
      description: input.description,
      subject: input.subject,
      tags: input.tags,
      remix_of: input.remixOf,
    }

    if (input.kind === 'note') {
      let body = input.body
      if (input.noteId && !body.trim()) {
        const note = this.deps.db().get('notes', input.noteId)
        if (!note) throw new AtlasError('not_found', 'That note is no longer here.')
        body = String(note['bodyMd'] ?? '')
      }
      if (!body.trim()) throw new AtlasError('bad_request', 'Write something in the note first.')
      row['body'] = body
    } else if (input.kind === 'deck') {
      const db = this.deps.db()
      const cards = input.flashcardIds
        .map((id) => db.get('flashcards', id))
        .filter((c): c is Row => Boolean(c))
        .map((c) => ({ front: String(c['frontMd']), back: String(c['backMd']) }))
      if (cards.length === 0) throw new AtlasError('bad_request', 'Pick some flashcards to share.')
      row['body'] = JSON.stringify(cards)
    } else if (input.kind === 'link') {
      row['link_url'] = input.url
    } else if (input.path) {
      Object.assign(row, await this.upload(input.spaceId, me, await this.readLocal(input.path)))
    } else if (input.sourceId) {
      const source = this.deps.db().get('sources', input.sourceId)
      if (!source || typeof source['filePath'] !== 'string') {
        throw new AtlasError('not_found', 'That file is no longer in your library.')
      }
      const bytes = await readFile(join(this.deps.filesDir(), source['filePath']))
      Object.assign(
        row,
        await this.upload(input.spaceId, me, {
          bytes,
          name: String(source['fileName'] ?? `${input.title}.pdf`),
          mime: typeof source['mime'] === 'string' ? source['mime'] : undefined,
        }),
      )
    } else {
      throw new AtlasError('bad_request', 'Choose a file to share.')
    }

    const { data, error } = await sb.from('items').insert(row).select('id').single()
    if (error) throw friendly(error, 'Could not share that.')
    return this.get(String((data as Row)['id']))
  }

  async update(raw: SharedUpdate): Promise<void> {
    const input = SharedUpdateSchema.parse(raw)
    const me = await this.userId()
    const sb = this.supabase()
    const { data: current, error: readError } = await sb
      .from('items')
      .select('space_id, kind, file_path')
      .eq('id', input.id)
      .maybeSingle()
    if (readError) throw friendly(readError, 'Could not open that.')
    if (!current) throw new AtlasError('not_found', 'That has been removed.')
    const patch: Row = {
      title: input.title,
      description: input.description,
      subject: input.subject,
      tags: input.tags,
    }
    const kind = (current as Row)['kind']
    if (kind === 'note' && input.body !== undefined) patch['body'] = input.body
    if (kind === 'link' && input.url) patch['link_url'] = input.url
    const oldPath = (current as Row)['file_path'] as string | null
    if (kind === 'file' && input.path) {
      Object.assign(
        patch,
        await this.upload(
          String((current as Row)['space_id']),
          me,
          await this.readLocal(input.path),
        ),
      )
    }
    const { error } = await sb.from('items').update(patch).eq('id', input.id)
    if (error) throw friendly(error, 'Could not save the changes.')
    if (oldPath && patch['file_path'] && patch['file_path'] !== oldPath) {
      await this.dropFileIfUnused(oldPath)
    }
  }

  private async dropFileIfUnused(path: string): Promise<void> {
    const sb = this.supabase()
    const { count } = await sb
      .from('items')
      .select('id', { count: 'exact', head: true })
      .eq('file_path', path)
    if (!count) await sb.storage.from('library').remove([path])
  }

  async remove(id: string): Promise<void> {
    await this.userId()
    const sb = this.supabase()
    const { data } = await sb.from('items').select('file_path').eq('id', id).maybeSingle()
    const { error } = await sb.from('items').delete().eq('id', id)
    if (error) throw friendly(error, 'Could not remove that.')
    const path = data?.['file_path'] as string | undefined
    if (path) await this.dropFileIfUnused(path)
  }

  /** Thumbs up (1), thumbs down (-1) or neither (0). */
  async react(input: { id: string; value: -1 | 0 | 1 }): Promise<void> {
    const me = await this.userId()
    const sb = this.supabase()
    const { error } =
      input.value === 0
        ? await sb.from('reactions').delete().eq('item_id', input.id).eq('user_id', me)
        : await sb.from('reactions').upsert({ item_id: input.id, user_id: me, value: input.value })
    if (error) throw friendly(error, 'Could not save that.')
  }

  /** Copies a shared item into this profile, as the student's own to edit. */
  async remix(id: string): Promise<RemixResult> {
    const item = await this.get(id)
    const sb = this.supabase()
    const db = this.deps.db()
    const subject = item.subject
      ? db.all('SELECT id FROM subjects WHERE lower(name) = lower(?) LIMIT 1', item.subject)[0]
      : undefined
    const subjectId = (subject?.['id'] as string | undefined) ?? null
    void sb.rpc('count_download', { item: id })

    if (item.kind === 'note') {
      const credit = `\n\n---\n_Remixed from “${item.title}” by ${item.author} in ${item.spaceName}._\n`
      const note = db.insert('notes', {
        subjectId,
        title: item.title,
        bodyMd: `${item.body}${credit}`,
        pinned: false,
      })
      return { kind: 'note', id: String(note['id']), count: 1 }
    }
    if (item.kind === 'deck') {
      const cards = JSON.parse(item.body) as { front: string; back: string }[]
      db.tx(() => {
        for (const c of cards) {
          db.insert('flashcards', {
            subjectId,
            frontMd: c.front,
            backMd: c.back,
            origin: 'manual',
            ease: 2.5,
            interval: 0,
            reps: 0,
            lapses: 0,
            due: 0,
          })
        }
      })
      return { kind: 'flashcards', id: null, count: cards.length }
    }
    if (item.kind === 'link') return { kind: 'link', id: null, count: 0 }

    const { data: full } = await sb.from('items').select('file_path').eq('id', id).single()
    const path = String((full as Row)['file_path'])
    const { data, error } = await sb.storage.from('library').download(path)
    if (error) throw friendly(error, 'Could not download the file.')
    const dir = join(app.getPath('temp'), `atlas-shared-${id}`)
    await mkdir(dir, { recursive: true })
    const file = join(dir, (item.fileName ?? 'shared.pdf').replace(/[\\/]/g, '-'))
    await writeFile(file, Buffer.from(await data.arrayBuffer()))
    try {
      const [source] = await importPaths(db, this.deps.filesDir(), { subjectId, paths: [file] })
      this.deps.onLibraryChanged()
      return { kind: 'source', id: source ? String(source['id']) : null, count: 1 }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  /**
   * For the assistant: the student's spaces, shared things that match the question (with links
   * it can cite), and how to propose sharing something. Null when signed out.
   */
  async assistantContext(question: string): Promise<string | null> {
    if (!this.config()) return null
    const status = await this.status()
    if (!status.signedIn || !status.profile) return null
    const me = status.userId ?? ''
    const spaces = await this.spaces()
    if (spaces.length === 0) {
      return 'Shared library: the student is signed in but not in any space yet. They can create or join one on the Shared page.'
    }
    const { items } = await this.list({ text: question, limit: 6 })
    const recent = items.length ? [] : (await this.list({ limit: 4 })).items
    const notes = items.filter((i) => i.kind === 'note').map((i) => i.id)
    const bodies = new Map<string, string>()
    if (notes.length) {
      const { data } = await this.supabase().from('items').select('id, body').in('id', notes)
      for (const r of (data ?? []) as Row[]) {
        bodies.set(String(r['id']), String(r['body'] ?? '').slice(0, 900))
      }
    }
    const describe = (i: SharedCard): string =>
      [
        `- "${i.title}" (${i.kind}${i.subject ? `, ${i.subject}` : ''}) by ${i.owner === me ? 'the student' : i.author} in ${i.spaceName}, ${i.ups} helpful. Link: [${i.title}](atlas://shared/${i.id})`,
        i.description ? `  ${i.description.slice(0, 240)}` : '',
        bodies.get(i.id) ? `  Excerpt: ${bodies.get(i.id)?.replace(/\s+/g, ' ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')

    const db = this.deps.db()
    const localNotes = db
      .list('notes', {}, { orderBy: 'updatedAt', desc: true, limit: 15 })
      .map((n) => `- ${String(n['title'])}`)
    const localFiles = db
      .list('sources', {}, { orderBy: 'createdAt', desc: true, limit: 15 })
      .map((f) => `- ${String(f['title'])}`)

    return [
      "Shared library (friends' spaces in Atlas). The student is in these spaces:",
      ...spaces.map(
        (s) =>
          `- ${s.name}: ${s.role}${canWrite(s.role) ? ', can share' : ', view only'}, ${s.itemCount} items`,
      ),
      items.length
        ? `Shared things that match this message (link them with the given Markdown links when relevant):\n${items.map(describe).join('\n')}`
        : `Nothing shared matches this message.${recent.length ? ` Most recent:\n${recent.map(describe).join('\n')}` : ''}`,
      localNotes.length ? `The student's own notes (titles):\n${localNotes.join('\n')}` : '',
      localFiles.length ? `Files in the student's library (titles):\n${localFiles.join('\n')}` : '',
      [
        'Only when the student asks you to share, post or upload something to a space, propose it with one fenced block, and say nothing is shared until they press Share:',
        '```atlas-share',
        '{"space": "<space name>", "kind": "note", "title": "<title>", "body": "<Markdown you wrote>"}',
        '```',
        'Other forms: {"space": "...", "kind": "note", "note": "<exact title of one of their notes>"}, {"space": "...", "kind": "file", "file": "<exact title of a library file>"}, {"space": "...", "kind": "link", "title": "...", "url": "https://..."}. Optional fields: "subject", "description", "tags" (array). Use a space where they can share. Never share textbooks or paid material.',
      ].join('\n'),
    ]
      .filter(Boolean)
      .join('\n\n')
  }
}

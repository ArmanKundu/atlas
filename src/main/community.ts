import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { app } from 'electron'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AtlasError } from '@shared/errors'
import { LIBRARY_KEY, LIBRARY_URL } from '@shared/constants'
import {
  PublishSchema,
  SHARED_FILE_LIMIT,
  searchTerms,
  type CommunityStatus,
  type PublishInput,
  type RemixResult,
  type SharedCard,
  type SharedItem,
  type SharedList,
  type SharedQuery,
  SharedQuerySchema,
  formatBytes,
} from '@shared/community'
import type { SecretStore } from './ai/secrets'
import type { Database } from './db/database'
import { importPaths } from './library'
import type { Logger } from './log'

const SESSION_KEY = 'library.session'
const CARD_COLUMNS =
  'id, owner, kind, title, description, subject, tags, file_name, file_size, link_url, remix_of, downloads, created_at, author, likes, liked, remixes, body_length'

type Row = Record<string, unknown>

function toCard(row: Row): SharedCard {
  return {
    id: String(row['id']),
    owner: String(row['owner']),
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
    author: String(row['author'] ?? 'Someone'),
    likes: Number(row['likes'] ?? 0),
    liked: Boolean(row['liked']),
    remixes: Number(row['remixes'] ?? 0),
    bodyLength: Number(row['body_length'] ?? 0),
  }
}

/** Short, human versions of the errors Supabase sends back. */
function friendly(error: { message?: string } | null | undefined, fallback: string): AtlasError {
  const message = error?.message ?? ''
  if (/invalid login credentials/i.test(message))
    return new AtlasError('forbidden', 'That email and password do not match.')
  if (/already registered/i.test(message))
    return new AtlasError('conflict', 'That email already has an account. Sign in instead.')
  if (/library code/i.test(message))
    return new AtlasError('forbidden', 'That library code is not right. Check it with a friend.')
  if (/password should be/i.test(message))
    return new AtlasError('bad_request', 'Use a password of at least 6 characters.')
  if (/email not confirmed/i.test(message))
    return new AtlasError('forbidden', 'Confirm your email first, then sign in.')
  if (/fetch failed|network/i.test(message))
    return new AtlasError(
      'unavailable',
      'Atlas could not reach the shared library. Check the internet.',
    )
  if (/exceeded|too large|payload/i.test(message))
    return new AtlasError('bad_request', 'The shared library is full or the file is too big.')
  return new AtlasError('internal', message ? `${fallback} (${message})` : fallback)
}

/**
 * The shared library, from the main process (the renderer's CSP allows no outside requests).
 * The sign-in session is kept encrypted with the OS keychain, beside the AI keys.
 */
export class CommunityLibrary {
  private client: SupabaseClient | null = null
  private memberName: string | null | undefined

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

  async status(): Promise<CommunityStatus> {
    const empty: CommunityStatus = {
      configured: Boolean(this.config()),
      signedIn: false,
      member: false,
      userId: null,
      email: null,
      displayName: null,
    }
    if (!empty.configured) return empty
    const { data } = await this.supabase().auth.getSession()
    const user = data.session?.user
    if (!user) return empty
    if (this.memberName === undefined) {
      const { data: row } = await this.supabase()
        .from('members')
        .select('display_name')
        .eq('user_id', user.id)
        .maybeSingle()
      this.memberName = (row?.['display_name'] as string | undefined) ?? null
    }
    return {
      ...empty,
      signedIn: true,
      member: this.memberName !== null,
      userId: user.id,
      email: user.email ?? null,
      displayName: this.memberName,
    }
  }

  async signUp(input: { email: string; password: string }): Promise<CommunityStatus> {
    const { data, error } = await this.supabase().auth.signUp(input)
    if (error) throw friendly(error, 'Could not create the account.')
    if (!data.session) {
      throw new AtlasError('forbidden', 'Check your email to confirm the account, then sign in.')
    }
    this.memberName = undefined
    return this.status()
  }

  async signIn(input: { email: string; password: string }): Promise<CommunityStatus> {
    const { error } = await this.supabase().auth.signInWithPassword(input)
    if (error) throw friendly(error, 'Could not sign in.')
    this.memberName = undefined
    return this.status()
  }

  async signOut(): Promise<CommunityStatus> {
    await this.supabase().auth.signOut()
    this.deps.secrets.delete(SESSION_KEY)
    this.memberName = undefined
    return this.status()
  }

  async join(input: { code: string; name: string }): Promise<CommunityStatus> {
    await this.userId()
    const { error } = await this.supabase().rpc('join_library', {
      code: input.code.trim(),
      name: input.name.trim(),
    })
    if (error) throw friendly(error, 'Could not join the library.')
    this.memberName = undefined
    return this.status()
  }

  async list(raw: SharedQuery): Promise<SharedList> {
    const query = SharedQuerySchema.parse(raw)
    const me = await this.userId()
    const sb = this.supabase()
    let request = sb.from('item_cards').select(CARD_COLUMNS).limit(300)
    const terms = searchTerms(query.text)
    if (terms)
      request = request.textSearch('search', terms, { type: 'websearch', config: 'english' })
    if (query.kind) request = request.eq('kind', query.kind)
    if (query.subject) request = request.eq('subject', query.subject)
    if (query.mine) request = request.eq('owner', me)
    if (query.liked) request = request.eq('liked', true)
    request =
      query.sort === 'popular'
        ? request.order('likes', { ascending: false }).order('downloads', { ascending: false })
        : request.order('created_at', { ascending: false })

    const [items, files, members] = await Promise.all([
      request,
      sb.from('items').select('subject, file_sha256, file_size'),
      sb.from('members').select('user_id', { count: 'exact', head: true }),
    ])
    if (items.error) throw friendly(items.error, 'Could not load the shared library.')
    const seen = new Map<string, number>()
    const subjects = new Set<string>()
    for (const row of (files.data ?? []) as Row[]) {
      if (row['subject']) subjects.add(String(row['subject']))
      if (row['file_sha256']) seen.set(String(row['file_sha256']), Number(row['file_size'] ?? 0))
    }
    return {
      items: ((items.data ?? []) as Row[]).map(toCard),
      subjects: [...subjects].sort((a, b) => a.localeCompare(b)),
      storageUsed: [...seen.values()].reduce((a, b) => a + b, 0),
      members: members.count ?? 0,
    }
  }

  async get(id: string): Promise<SharedItem> {
    await this.userId()
    const sb = this.supabase()
    const [card, full] = await Promise.all([
      sb.from('item_cards').select(CARD_COLUMNS).eq('id', id).maybeSingle(),
      sb.from('items').select('body, remix_of').eq('id', id).maybeSingle(),
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
      ...toCard(card.data as Row),
      body: String((full.data as Row)['body'] ?? ''),
      remixOfTitle,
    }
  }

  async publish(raw: PublishInput): Promise<SharedCard> {
    const input = PublishSchema.parse(raw)
    const me = await this.userId()
    const sb = this.supabase()
    const db = this.deps.db()
    const row: Row = {
      owner: me,
      kind: input.kind,
      title: input.title,
      description: input.description,
      subject: input.subject,
      tags: input.tags,
      remix_of: input.remixOf,
    }

    if (input.kind === 'note') {
      const note = db.get('notes', input.noteId)
      if (!note) throw new AtlasError('not_found', 'That note is no longer here.')
      row['body'] = String(note['bodyMd'] ?? '')
    } else if (input.kind === 'deck') {
      const cards = input.flashcardIds
        .map((id) => db.get('flashcards', id))
        .filter((c): c is Row => Boolean(c))
        .map((c) => ({ front: String(c['frontMd']), back: String(c['backMd']) }))
      if (cards.length === 0) throw new AtlasError('bad_request', 'Pick some flashcards to share.')
      row['body'] = JSON.stringify(cards)
    } else if (input.kind === 'link') {
      row['link_url'] = input.url
    } else {
      const source = db.get('sources', input.sourceId)
      if (!source || typeof source['filePath'] !== 'string') {
        throw new AtlasError('not_found', 'That file is no longer in your library.')
      }
      const size = Number(source['size'] ?? 0)
      if (size > SHARED_FILE_LIMIT) {
        throw new AtlasError(
          'bad_request',
          `This file is ${formatBytes(size)}; the shared library takes files up to ${formatBytes(SHARED_FILE_LIMIT)}. Share it as a link instead (Google Drive, OneDrive).`,
        )
      }
      const sha = String(source['checksum'] ?? '')
      const fileName = String(source['fileName'] ?? `${input.title}.pdf`)
      // Someone already shared the same file: point at their copy instead of storing it twice.
      const { data: same } = await sb
        .from('items')
        .select('file_path')
        .eq('file_sha256', sha)
        .not('file_path', 'is', null)
        .limit(1)
      let path = (same?.[0]?.['file_path'] as string | undefined) ?? null
      if (!path) {
        path = `${me}/${sha}${extname(fileName).toLowerCase()}`
        const bytes = await readFile(join(this.deps.filesDir(), source['filePath']))
        const { error } = await sb.storage.from('library').upload(path, bytes, {
          contentType: String(source['mime'] ?? 'application/octet-stream'),
          upsert: true,
        })
        if (error) throw friendly(error, 'Could not upload the file.')
      }
      Object.assign(row, {
        file_path: path,
        file_name: fileName,
        file_size: size,
        file_sha256: sha,
      })
    }

    const { data, error } = await sb.from('items').insert(row).select('id').single()
    if (error) throw friendly(error, 'Could not share that.')
    return (await this.get(String((data as Row)['id']))) as SharedCard
  }

  async update(input: {
    id: string
    title: string
    description: string
    subject: string
    tags: string[]
  }): Promise<void> {
    await this.userId()
    const { error } = await this.supabase()
      .from('items')
      .update({
        title: input.title,
        description: input.description,
        subject: input.subject,
        tags: input.tags,
      })
      .eq('id', input.id)
    if (error) throw friendly(error, 'Could not save the changes.')
  }

  async remove(id: string): Promise<void> {
    const me = await this.userId()
    const sb = this.supabase()
    const { data } = await sb.from('items').select('file_path').eq('id', id).maybeSingle()
    const { error } = await sb.from('items').delete().eq('id', id)
    if (error) throw friendly(error, 'Could not remove that.')
    const path = data?.['file_path'] as string | undefined
    if (path?.startsWith(`${me}/`)) {
      const { count } = await sb
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('file_path', path)
      if (!count) await sb.storage.from('library').remove([path])
    }
  }

  async like(input: { id: string; liked: boolean }): Promise<void> {
    const me = await this.userId()
    const sb = this.supabase()
    const { error } = input.liked
      ? await sb.from('likes').upsert({ item_id: input.id, user_id: me })
      : await sb.from('likes').delete().eq('item_id', input.id).eq('user_id', me)
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
      const credit = `\n\n---\n_Remixed from “${item.title}” by ${item.author} in the shared library._\n`
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
}

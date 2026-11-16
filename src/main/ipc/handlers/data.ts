import { writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog } from 'electron'
import { AtlasError } from '@shared/errors'
import {
  ENTITIES,
  ProfileMetaSchema,
  StudyGoalsSchema,
  type EntityName,
  type ProfileMeta,
} from '@shared/models'
import type { AiService } from '../../ai/service'
import type { Database, Row } from '../../db/database'
import {
  getPages,
  importPaths,
  IMPORTABLE_EXTENSIONS,
  readSourceFile,
  removeSource,
  savePages,
  search,
} from '../../library'
import type { Logger } from '../../log'
import type { PrefsStore } from '../../prefs'
import type { ProfileManager } from '../../profiles'
import { computeStats } from '../../stats'
import type { IpcRegistry } from '../registry'

export interface DataHandlerDeps {
  registry: IpcRegistry
  profiles: ProfileManager
  prefs: PrefsStore
  ai: AiService
  log: Logger
  emit: {
    profileChanged: (activeId: string | null) => void
    libraryChanged: (sourceId: string | null) => void
  }
  /** Opens a hidden copy of the app at `hash` and prints it to PDF. */
  printRoute: (hash: string) => Promise<Buffer>
}

function readMeta(db: Database): ProfileMeta {
  const row = db.one("SELECT * FROM profile_meta WHERE id = 'me'")
  if (!row) throw new AtlasError('not_found', 'This profile has no details yet.')
  let goals: unknown
  try {
    goals = JSON.parse(String(row['study_goals'] ?? '{}'))
  } catch {
    goals = {}
  }
  return ProfileMetaSchema.parse({
    name: row['name'],
    yearLevel: row['year_level'] ?? null,
    school: row['school'] ?? null,
    examYear: row['exam_year'] ?? null,
    studySystem: row['study_system'],
    avatarColour: row['avatar_colour'],
    avatarAccessory: row['avatar_accessory'],
    onboardingDone: row['onboarding_done'] === 1,
    onboardingStep: row['onboarding_step'],
    studyGoals: StudyGoalsSchema.parse(goals),
  })
}

const META_COLUMNS: Record<keyof ProfileMeta, string> = {
  name: 'name',
  yearLevel: 'year_level',
  school: 'school',
  examYear: 'exam_year',
  studySystem: 'study_system',
  avatarColour: 'avatar_colour',
  avatarAccessory: 'avatar_accessory',
  onboardingDone: 'onboarding_done',
  onboardingStep: 'onboarding_step',
  studyGoals: 'study_goals',
}

export function registerDataHandlers(deps: DataHandlerDeps): void {
  const { registry, profiles, prefs, ai, emit } = deps
  const db = (): Database => profiles.db()
  const filesDir = (): string => {
    const current = profiles.current
    if (!current) throw new AtlasError('unavailable', 'Open a profile first.')
    return profiles.filesDir(current.id)
  }

  /* ---------- Profiles ---------- */

  registry.handle('profile:list', () => profiles.list())

  registry.handle('profile:create', async (input) => {
    const summary = profiles.create(input)
    await prefs.set({ lastProfileId: summary.id })
    emit.profileChanged(summary.id)
    return summary
  })

  registry.handle('profile:unlock', async ({ id, password }) => {
    const summary = profiles.unlock(id, password)
    await prefs.set({ lastProfileId: summary.id })
    emit.profileChanged(summary.id)
    return summary
  })

  registry.handle('profile:lock', () => {
    profiles.lock()
    emit.profileChanged(null)
  })

  registry.handle('profile:meta', () => (profiles.current ? readMeta(db()) : null))

  registry.handle('profile:updateMeta', (patch) => {
    const database = db()
    const entries = Object.entries(patch) as [keyof ProfileMeta, unknown][]
    database.tx(() => {
      for (const [key, value] of entries) {
        const column = META_COLUMNS[key]
        const stored =
          key === 'studyGoals'
            ? JSON.stringify(value)
            : typeof value === 'boolean'
              ? value
                ? 1
                : 0
              : (value as string | number | null)
        database.run(
          `UPDATE profile_meta SET ${column} = ?, updated_at = ? WHERE id = 'me'`,
          stored,
          Date.now(),
        )
      }
    })
    if (typeof patch.name === 'string') profiles.rename(patch.name)
    return readMeta(database)
  })

  registry.handle('profile:exportAll', async () => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options = {
      title: 'Choose where to save the export',
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
    }
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    const target = picked.filePaths[0]
    if (picked.canceled || !target) return null
    return { path: profiles.exportAll(target) }
  })

  registry.handle('backup:list', () => profiles.listBackups())
  registry.handle('backup:create', () => profiles.backupNow())
  registry.handle('backup:restore', ({ file }) => {
    profiles.restore(file)
    emit.profileChanged(profiles.current?.id ?? null)
  })

  /* ---------- Generic data access ---------- */

  const spec = (entity: EntityName): (typeof ENTITIES)[EntityName] => ENTITIES[entity]

  registry.handle('db:list', ({ entity, where, orderBy, desc, limit }) =>
    db().list(spec(entity).table, where ?? {}, { orderBy, desc, limit }),
  )

  registry.handle('db:get', ({ entity, id }) => db().get(spec(entity).table, id) ?? null)

  registry.handle('db:create', ({ entity, values }) => {
    const definition = spec(entity)
    if (!definition.create)
      throw new AtlasError('forbidden', 'Those are added by importing a file.')
    const parsed = definition.input.safeParse(values)
    if (!parsed.success)
      throw new AtlasError(
        'bad_request',
        'Some of those details are not valid. Check them and try again.',
      )
    return db().insert(definition.table, parsed.data as Row)
  })

  registry.handle('db:update', ({ entity, id, patch }) => {
    const definition = spec(entity)
    const parsed = definition.input.partial().safeParse(patch)
    if (!parsed.success)
      throw new AtlasError(
        'bad_request',
        'Some of those details are not valid. Check them and try again.',
      )
    // `partial()` still applies defaults for missing keys; keep only what the caller sent.
    const sent = Object.fromEntries(
      Object.entries(parsed.data as Row).filter(([key]) => key in patch),
    )
    const row = db().update(definition.table, id, sent)
    if (!row) throw new AtlasError('not_found', 'That item no longer exists.')
    return row
  })

  registry.handle('db:remove', ({ entity, id }) => {
    db().remove(spec(entity).table, id)
  })

  registry.handle('settings:get', ({ key }) => db().getSetting<unknown>(key, null))
  registry.handle('settings:set', ({ key, value }) => db().setSetting(key, value))
  registry.handle('stats:summary', () => computeStats(db()))

  /* ---------- Library ---------- */

  registry.handle('library:pickAndImport', async ({ subjectId, kind }) => {
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options = {
      title: 'Import resources',
      properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
      filters: [{ name: 'Documents', extensions: IMPORTABLE_EXTENSIONS }],
    }
    const picked = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) return []
    const rows = await importPaths(db(), filesDir(), { subjectId, paths: picked.filePaths, kind })
    emit.libraryChanged(null)
    return rows
  })

  registry.handle('library:importPaths', async ({ subjectId, paths, kind }) => {
    const rows = await importPaths(db(), filesDir(), { subjectId, paths, kind })
    emit.libraryChanged(null)
    return rows
  })

  registry.handle('library:fileBytes', ({ sourceId }) => readSourceFile(db(), filesDir(), sourceId))

  registry.handle('library:savePages', ({ sourceId, pages }) => {
    savePages(db(), sourceId, pages)
    emit.libraryChanged(sourceId)
  })

  registry.handle('library:setStatus', ({ sourceId, status, error }) => {
    db().update('sources', sourceId, { ingestStatus: status, ingestError: error ?? null })
    emit.libraryChanged(sourceId)
  })

  registry.handle('library:pages', ({ sourceId }) => getPages(db(), sourceId))

  registry.handle('library:remove', async ({ sourceId }) => {
    await removeSource(db(), filesDir(), sourceId)
    emit.libraryChanged(sourceId)
  })

  registry.handle('search:query', (input) => search(db(), input))

  /* ---------- AI ---------- */

  registry.handle('ai:status', () => ai.statuses())
  registry.handle('ai:agents', async () => (await import('../../ai/prompts/agents')).listAgents())
  registry.handle('ai:config', () => ai.config())
  registry.handle('ai:setConfig', (patch) => ai.setConfig(patch))
  registry.handle('ai:setKey', ({ provider, key }) => ai.setKey(provider, key))
  registry.handle('ai:clearKey', ({ provider }) => ai.clearKey(provider))
  registry.handle('ai:models', async ({ provider }) => {
    try {
      return await ai.models(provider)
    } catch (error) {
      throw new AtlasError(
        'unavailable',
        error instanceof Error ? error.message : 'The model list could not be loaded.',
      )
    }
  })
  registry.handle('ai:test', ({ provider }) => ai.test(provider))
  registry.handle('ai:login', ({ provider }) => ai.login(provider))
  registry.handle('ai:messages', ({ chatId }) => ai.messages(chatId))
  registry.handle('ai:send', ({ chatId, content }) => ai.send(chatId, content))
  registry.handle('ai:cancel', ({ chatId }) => ai.cancel(chatId))
  registry.handle('ai:complete', ({ task, prompt, subjectId }) =>
    ai.complete(task, prompt, subjectId ?? null),
  )

  /* ---------- Exam builder ---------- */

  registry.handle('exam:exportPdf', async ({ examId, variant }) => {
    const exam = db().get('exams_generated', examId)
    if (!exam) throw new AtlasError('not_found', 'That exam no longer exists.')
    const suffix = variant === 'solutions' ? ' - solutions' : ''
    const safe = `${String(exam['title'])}${suffix}`.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Exam'
    const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const options = {
      title: 'Save PDF',
      defaultPath: `${safe}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    }
    const picked = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (picked.canceled || !picked.filePath) return null
    const pdf = await deps.printRoute(`/print/exam/${examId}?variant=${variant}`)
    await writeFile(picked.filePath, pdf)
    return { path: picked.filePath }
  })
}

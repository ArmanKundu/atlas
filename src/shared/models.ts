import { z } from 'zod'

/**
 * Shapes of everything that crosses the IPC boundary. The main process validates writes against
 * these; the renderer uses the inferred types.
 */

const id = z.string().min(1).max(64)
const refId = id.nullable().default(null)
const text = (max = 200_000) => z.string().max(max)
const optText = (max = 200_000) => z.string().max(max).nullable().default(null)
const optNum = z.number().finite().nullable().default(null)
const optInt = z.number().int().nullable().default(null)
const ts = z.number().int()

export interface BaseRow {
  id: string
  createdAt: number
  updatedAt: number
}

/* ---------- Enumerations ---------- */

export const SUBJECT_KINDS = [
  'science',
  'maths',
  'essay',
  'accounting',
  'language',
  'other',
] as const
export type SubjectKind = (typeof SUBJECT_KINDS)[number]
export const SUBJECT_COLOURS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const
export const SOURCE_KINDS = [
  'study_design',
  'exam',
  'solutions',
  'examiner_report',
  'textbook',
  'class_notes',
  'worksheet',
  'data_book',
  'other',
] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]
export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  study_design: 'Study design',
  exam: 'Past exam',
  solutions: 'Solutions',
  examiner_report: 'Examiner report',
  textbook: 'Textbook',
  class_notes: 'Class notes',
  worksheet: 'Worksheet',
  data_book: 'Data book',
  other: 'Other',
}
export const STUDY_SYSTEMS = ['vce', 'hsc', 'ib', 'a-levels', 'ap', 'university', 'other'] as const
export type StudySystem = (typeof STUDY_SYSTEMS)[number]
export const EVENT_KINDS = ['lesson', 'sac', 'exam', 'due', 'event', 'study_block'] as const
export const MISTAKE_TYPES = [
  'concept',
  'careless',
  'command_term',
  'working',
  'knowledge_gap',
  'time',
] as const

/* ---------- Entities the renderer can read and write through `db:*` ---------- */

export const SubjectInput = z.object({
  name: text(120).min(1),
  code: optText(24),
  kind: z.enum(SUBJECT_KINDS).default('other'),
  colour: z.enum(SUBJECT_COLOURS).default('blue'),
  icon: optText(40),
  unitRange: optText(40),
  examDates: z.array(z.object({ label: text(80), date: ts })).default([]),
  active: z.boolean().default(true),
  sort: optInt,
})

export const TopicInput = z.object({
  subjectId: id,
  parentId: refId,
  title: text(300).min(1),
  code: optText(60),
  kind: optText(40),
  sort: optInt,
  sourceId: refId,
  notRequired: z.boolean().default(false),
  notes: optText(),
})

/** Sources are created by the import pipeline; the renderer may only edit these fields. */
export const SourceInput = z.object({
  subjectId: refId,
  kind: z.enum(SOURCE_KINDS).default('other'),
  title: text(300).min(1),
  year: optInt,
  publisher: optText(120),
  personal: z.boolean().default(false),
})

export const NoteInput = z.object({
  subjectId: refId,
  topicId: refId,
  title: text(300).default('Untitled note'),
  bodyMd: text().default(''),
  pinned: z.boolean().default(false),
})

export const FlashcardInput = z.object({
  subjectId: refId,
  topicId: refId,
  frontMd: text(20_000).min(1),
  backMd: text(20_000).min(1),
  origin: z.enum(['manual', 'ai', 'mistake', 'question']).default('manual'),
  ease: z.number().default(2.5),
  interval: z.number().int().default(0),
  reps: z.number().int().default(0),
  lapses: z.number().int().default(0),
  due: ts.default(0),
})

export const StudySessionInput = z.object({
  subjectId: refId,
  topicId: refId,
  startedAt: ts,
  endedAt: ts.nullable().default(null),
  seconds: z.number().int().min(0),
  mode: z.enum(['focus', 'stopwatch', 'exam']).default('focus'),
  source: z.enum(['timer', 'manual']).default('timer'),
  summary: optText(2000),
})

export const CalendarEventInput = z.object({
  source: z
    .enum(['compass_ical', 'compass_adapter', 'manual', 'planner', 'other_ical'])
    .default('manual'),
  externalId: optText(300),
  title: text(300).min(1),
  location: optText(300),
  startsAt: ts,
  endsAt: ts,
  allDay: z.boolean().default(false),
  subjectId: refId,
  kind: z.enum(EVENT_KINDS).default('event'),
  notes: optText(5000),
  done: z.boolean().default(false),
})

export const TodoInput = z.object({
  title: text(300).min(1),
  groupName: text(60).default('This week'),
  done: z.boolean().default(false),
  subjectId: refId,
  dueAt: ts.nullable().default(null),
  sort: optInt,
})

export const AssessmentInput = z.object({
  subjectId: refId,
  title: text(300).min(1),
  kind: z.enum(['sac', 'exam', 'test', 'trial']).default('sac'),
  date: ts.nullable().default(null),
  topics: z.array(z.string()).default([]),
  score: optNum,
  max: optNum,
  feedbackMd: optText(),
  source: z.enum(['manual', 'compass']).default('manual'),
})

export const MistakeInput = z.object({
  attemptId: refId,
  questionId: refId,
  subjectId: refId,
  topicId: refId,
  type: z.enum(MISTAKE_TYPES).default('concept'),
  note: optText(5000),
  fix: optText(5000),
  status: z.enum(['open', 'fixed']).default('open'),
  reviewDue: ts.nullable().default(null),
})

/** A box on a source page, as fractions of the page (0 to 1) so it survives any zoom. */
export const RegionSchema = z.object({
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
})
export type Region = z.infer<typeof RegionSchema>

export const McSchema = z.object({
  answer: z.string().max(4).optional(),
  options: z.array(z.string().max(4)).max(8).optional(),
  pct: z.record(z.string().max(4), z.number().min(0).max(100)).optional(),
  comment: z.string().max(5000).optional(),
})
export type Mc = z.infer<typeof McSchema>

/** One part of a question, with the report's mark distribution and the expected answer. */
export const QuestionPartSchema = z.object({
  part: z.string().max(10),
  marks: z.number().nullable().optional(),
  /** Mark distribution: `labels` like ["0","1","2","Average"], `pct` the matching percentages. */
  stats: z
    .object({ labels: z.array(z.string().max(12)), pct: z.array(z.number()) })
    .nullable()
    .optional(),
  text: z.string().max(20_000).optional(),
  latex: z.string().max(20_000).optional(),
})
export type QuestionPart = z.infer<typeof QuestionPartSchema>

export const PAPER_GROUPS = ['official', 'nht', 'earlier', 'mine'] as const
export type PaperGroup = (typeof PAPER_GROUPS)[number]

export const PaperInput = z.object({
  subjectId: refId,
  title: text(200).min(1),
  grp: z.enum(PAPER_GROUPS).default('mine'),
  year: optInt,
  sitting: z.enum(['main', 'nht', 'sample', 'other']).default('main'),
  exam: optText(10),
  paperSourceId: id,
  reportSourceId: refId,
  solutionsSourceId: refId,
  aidSourceId: refId,
  structure: optText(120),
  totalMarks: optNum,
  minutes: optInt,
  readingMinutes: optInt,
})

export const AnnotationInput = z.object({
  targetType: z.enum(['source', 'note']).default('source'),
  targetId: id,
  page: optInt,
  rect: RegionSchema.partial().default({}),
  kind: z.enum(['highlight', 'underline', 'pen', 'marker', 'comment', 'flag', 'bookmark']),
  color: optText(20),
  path: z.array(z.array(z.number())).max(4000).default([]),
  bodyMd: optText(5000),
  marksDelta: optNum,
  author: z.enum(['me', 'ai', 'teacher']).default('me'),
  thread: z.array(z.unknown()).default([]),
  resolved: z.boolean().default(false),
})

export const QuestionInput = z.object({
  subjectId: id,
  sourceId: refId,
  year: optInt,
  paper: optText(60),
  section: optText(60),
  number: optText(20),
  label: optText(80),
  marks: optNum,
  stemMd: text().min(1),
  parts: z.array(QuestionPartSchema).max(20).default([]),
  pageRefs: z.array(z.number().int()).default([]),
  regions: z.array(RegionSchema).max(20).default([]),
  /** Where this question is discussed in the paper's examiner report. */
  reportRegions: z.array(RegionSchema).max(20).default([]),
  commandTerms: z.array(z.string().max(40)).max(12).default([]),
  qtype: optText(40),
  /** Multiple choice: the answer, the share of students choosing each option, the report's comment. */
  mc: McSchema.default({}),
  /** Sentences from the examiner report about common mistakes. */
  reportMistakes: z.array(z.string().max(2000)).max(20).default([]),
  sampleMd: optText(),
  topicIds: z.array(z.string()).default([]),
  difficulty: optInt,
  stateAverage: optNum,
  tags: z.array(z.string()).default([]),
  bookmarked: z.boolean().default(false),
})

export const AnswerInput = z.object({
  questionId: id,
  kind: z.enum(['official_solution', 'examiner_report', 'sample', 'ai']).default('sample'),
  contentMd: text().min(1),
  sourceId: refId,
  pageRefs: z.array(z.number().int()).default([]),
})

export const AttemptInput = z.object({
  questionId: id,
  givenAnswerMd: optText(),
  score: optNum,
  max: optNum,
  selfMarked: z.boolean().default(false),
  aiMarked: z.boolean().default(false),
  confidence: optInt,
  seconds: optInt,
})

export const MemoryInput = z.object({
  content: text(2000).min(1),
  source: optText(200),
  kind: optText(40),
})

export const ExamInput = z.object({
  subjectId: refId,
  title: text(300).min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  bodyMd: optText(),
  solutionsMd: optText(),
  latex: optText(),
  questionIds: z.array(z.string()).default([]),
  provider: optText(60),
})

export const ChatInput = z.object({
  title: text(200).default('New chat'),
  subjectId: refId,
  agent: text(40).default('tutor'),
  provider: optText(40),
  model: optText(120),
  pinned: z.boolean().default(false),
})

/** Table name and write schema for every entity exposed over `db:*`. */
export const ENTITIES = {
  subjects: { table: 'subjects', input: SubjectInput, create: true },
  topics: { table: 'topics', input: TopicInput, create: true },
  sources: { table: 'sources', input: SourceInput, create: false },
  notes: { table: 'notes', input: NoteInput, create: true },
  flashcards: { table: 'flashcards', input: FlashcardInput, create: true },
  studySessions: { table: 'study_sessions', input: StudySessionInput, create: true },
  calendarEvents: { table: 'calendar_events', input: CalendarEventInput, create: true },
  todos: { table: 'todos', input: TodoInput, create: true },
  assessments: { table: 'assessments', input: AssessmentInput, create: true },
  mistakes: { table: 'mistakes', input: MistakeInput, create: true },
  questions: { table: 'questions', input: QuestionInput, create: true },
  answers: { table: 'answers', input: AnswerInput, create: true },
  attempts: { table: 'attempts', input: AttemptInput, create: true },
  memories: { table: 'memories', input: MemoryInput, create: true },
  exams: { table: 'exams_generated', input: ExamInput, create: true },
  chats: { table: 'chats', input: ChatInput, create: true },
  papers: { table: 'papers', input: PaperInput, create: true },
  annotations: { table: 'annotations', input: AnnotationInput, create: true },
} as const

export type EntityName = keyof typeof ENTITIES
export const ENTITY_NAMES = Object.keys(ENTITIES) as [EntityName, ...EntityName[]]
export type EntityInput<E extends EntityName> = z.input<(typeof ENTITIES)[E]['input']>
export type EntityRow<E extends EntityName> = z.output<(typeof ENTITIES)[E]['input']> & BaseRow

export type Subject = EntityRow<'subjects'>
export type Topic = EntityRow<'topics'>
export type Note = EntityRow<'notes'>
export type Flashcard = EntityRow<'flashcards'>
export type StudySession = EntityRow<'studySessions'>
export type CalendarEvent = EntityRow<'calendarEvents'>
export type Todo = EntityRow<'todos'>
export type Assessment = EntityRow<'assessments'>
export type Exam = EntityRow<'exams'>
export type Chat = EntityRow<'chats'>
export type Memory = EntityRow<'memories'>
export type Question = EntityRow<'questions'>
export type Answer = EntityRow<'answers'>
export type Attempt = EntityRow<'attempts'>
export type Mistake = EntityRow<'mistakes'>
export type Paper = EntityRow<'papers'>
export type Annotation = EntityRow<'annotations'>

/** A source row as stored: the editable fields plus what the import pipeline recorded. */
export type Source = EntityRow<'sources'> & {
  fileName: string | null
  mime: string | null
  size: number | null
  pageCount: number | null
  ingestStatus: 'queued' | 'extracting' | 'ready' | 'error'
  ingestError: string | null
  checksum: string | null
}

/* ---------- Profiles ---------- */

export const ProfileSummarySchema = z.object({
  id,
  name: z.string(),
  hasPassword: z.boolean(),
  createdAt: z.number(),
  active: z.boolean(),
})
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>

export const StudyGoalsSchema = z.object({
  targetOverall: z.string().max(40).default(''),
  subjectTargets: z.record(z.string(), z.string().max(40)).default({}),
  weeklyHours: z.record(z.string(), z.number().min(0).max(100)).default({}),
  focusMinutes: z.number().int().min(5).max(180).default(25),
  dailyMinutes: z.number().int().min(0).max(960).default(120),
})
export type StudyGoals = z.infer<typeof StudyGoalsSchema>

export const ProfileMetaSchema = z.object({
  name: z.string().min(1).max(80),
  yearLevel: z.string().max(40).nullable(),
  school: z.string().max(120).nullable(),
  examYear: z.number().int().nullable(),
  studySystem: z.enum(STUDY_SYSTEMS),
  avatarColour: z.string().max(20),
  avatarAccessory: z.string().max(20),
  onboardingDone: z.boolean(),
  onboardingStep: z.number().int().min(0),
  studyGoals: StudyGoalsSchema,
})
export type ProfileMeta = z.infer<typeof ProfileMetaSchema>
export const ProfileMetaPatchSchema = ProfileMetaSchema.partial().strict()
export type ProfileMetaPatch = z.infer<typeof ProfileMetaPatchSchema>

export const BackupInfoSchema = z.object({
  file: z.string(),
  reason: z.string(),
  createdAt: z.number(),
  size: z.number(),
})
export type BackupInfo = z.infer<typeof BackupInfoSchema>

/* ---------- Library and search ---------- */

export const PageTextSchema = z.object({ number: z.number().int().min(1), text: z.string() })
export type PageText = z.infer<typeof PageTextSchema>

export const SearchHitSchema = z.object({
  type: z.enum(['page', 'note', 'flashcard', 'question']),
  id: z.string(),
  title: z.string(),
  snippet: z.string(),
  subjectId: z.string().nullable(),
  sourceId: z.string().nullable(),
  page: z.number().nullable(),
})
export type SearchHit = z.infer<typeof SearchHitSchema>

/* ---------- AI ---------- */

export const PROVIDER_IDS = [
  'claude-code',
  'codex',
  'gemini-cli',
  'ollama',
  'lmstudio',
  'anthropic-api',
  'openai-api',
  'google-api',
  'openrouter',
] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]
export const ProviderIdSchema = z.enum(PROVIDER_IDS)

export const ProviderStatusSchema = z.object({
  id: ProviderIdSchema,
  name: z.string(),
  kind: z.enum(['subscription', 'local', 'api-key']),
  description: z.string(),
  termsUrl: z.string(),
  /** For CLI providers: the official install command for this computer. */
  installHint: z.string().nullable(),
  installed: z.boolean(),
  /** Ready to answer: installed and signed in, has a key, or the local server is running. */
  ready: z.boolean(),
  detail: z.string(),
  model: z.string().nullable(),
})
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>

export const AI_ERROR_CODES = [
  'ai_unavailable',
  'not_installed',
  'not_signed_in',
  'usage_limit',
  'network',
  'bad_output',
  'unsupported',
  'cancelled',
  'refused',
  'unknown',
] as const
export type AiErrorCode = (typeof AI_ERROR_CODES)[number]

export const AiConfigSchema = z.object({
  /** Provider tried first for every task. `null` means "No AI". */
  defaultProvider: ProviderIdSchema.nullable().default(null),
  /** Chosen model per provider; missing means the provider's default. */
  models: z.record(z.string(), z.string().max(160)).default({}),
  /** Optional per-task override: task kind → ordered provider list. */
  routes: z.record(z.string(), z.array(ProviderIdSchema)).default({}),
})
export type AiConfig = z.infer<typeof AiConfigSchema>

export const AgentInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  placeholder: z.string(),
  /** Heading the helper is listed under. */
  group: z.string(),
  /** Subject kinds this helper is made for. Missing means every subject. */
  kinds: z.array(z.string()).optional(),
})
export type AgentInfo = z.infer<typeof AgentInfoSchema>

export const ChatSourceSchema = z.object({
  n: z.number().int(),
  sourceId: z.string(),
  title: z.string(),
  page: z.number().int(),
  snippet: z.string(),
})
export type ChatSource = z.infer<typeof ChatSourceSchema>

export const ChatMessageSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  createdAt: z.number(),
  role: z.enum(['user', 'assistant']),
  contentMd: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  sources: z.array(ChatSourceSchema),
  status: z.enum(['streaming', 'done', 'error', 'cancelled']),
  error: z.string().nullable(),
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

/* ---------- Stats ---------- */

export const StatsSchema = z.object({
  todaySeconds: z.number(),
  weekSeconds: z.number(),
  streakDays: z.number(),
  dueCards: z.number(),
  openMistakes: z.number(),
  /** Seconds per subject id for the current week ('' = no subject). */
  weekBySubject: z.record(z.string(), z.number()),
  /** Seconds per local day (YYYY-MM-DD) for the last 371 days. */
  days: z.record(z.string(), z.number()),
  counts: z.object({
    sources: z.number(),
    pages: z.number(),
    notes: z.number(),
    flashcards: z.number(),
    chats: z.number(),
  }),
})
export type Stats = z.infer<typeof StatsSchema>

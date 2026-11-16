/**
 * The profile database schema, as data. One definition drives both the first migration's DDL and
 * the repository's value conversion (booleans, JSON columns).
 *
 * Column types: `text`, `int`, `real` (nullable); a trailing `!` means NOT NULL;
 * `bool` is INTEGER NOT NULL DEFAULT 0; `json[]` / `json{}` are TEXT with that default.
 *
 * IMPORTANT: migration 1 is generated from `SCHEMA_V1`. Never edit `SCHEMA_V1` after release;
 * add a new migration in `migrations.ts` and update `TABLES` (the current shape) instead.
 */
export type ColumnType = 'text' | 'text!' | 'int' | 'int!' | 'real' | 'bool' | 'json[]' | 'json{}'

export interface TableDef {
  cols: Record<string, ColumnType>
  /** Rows are hidden with `deleted_at` instead of being removed. */
  soft?: boolean
  /** Columns indexed for full-text search (FTS5, kept in sync by triggers). */
  fts?: string[]
  indexes?: string[][]
}

export const SCHEMA_V1 = {
  subjects: {
    soft: true,
    cols: {
      name: 'text!',
      code: 'text',
      kind: 'text!',
      colour: 'text!',
      icon: 'text',
      unit_range: 'text',
      exam_dates: 'json[]',
      active: 'bool',
      sort: 'int',
    },
  },
  topics: {
    soft: true,
    indexes: [['subject_id']],
    cols: {
      subject_id: 'text!',
      parent_id: 'text',
      title: 'text!',
      code: 'text',
      kind: 'text',
      sort: 'int',
      source_id: 'text',
      not_required: 'bool',
      notes: 'text',
    },
  },
  sources: {
    soft: true,
    indexes: [['subject_id'], ['checksum']],
    cols: {
      subject_id: 'text',
      kind: 'text!',
      title: 'text!',
      year: 'int',
      publisher: 'text',
      file_path: 'text',
      file_name: 'text',
      mime: 'text',
      size: 'int',
      page_count: 'int',
      personal: 'bool',
      ingest_status: 'text!',
      ingest_error: 'text',
      checksum: 'text',
    },
  },
  pages: {
    indexes: [['source_id', 'number']],
    fts: ['text'],
    cols: { source_id: 'text!', number: 'int!', text: 'text!', image_path: 'text', ocr: 'bool' },
  },
  questions: {
    soft: true,
    indexes: [['subject_id'], ['source_id']],
    fts: ['stem_md'],
    cols: {
      subject_id: 'text!',
      source_id: 'text',
      year: 'int',
      paper: 'text',
      section: 'text',
      number: 'text',
      label: 'text',
      marks: 'real',
      stem_md: 'text!',
      parts: 'json[]',
      page_refs: 'json[]',
      topic_ids: 'json[]',
      difficulty: 'int',
      state_average: 'real',
      tags: 'json[]',
      bookmarked: 'bool',
    },
  },
  question_topics: {
    indexes: [['question_id'], ['topic_id']],
    cols: { question_id: 'text!', topic_id: 'text!', confidence: 'real' },
  },
  answers: {
    soft: true,
    indexes: [['question_id']],
    fts: ['content_md'],
    cols: {
      question_id: 'text!',
      kind: 'text!',
      content_md: 'text!',
      source_id: 'text',
      page_refs: 'json[]',
    },
  },
  attempts: {
    indexes: [['question_id']],
    cols: {
      question_id: 'text!',
      given_answer_md: 'text',
      score: 'real',
      max: 'real',
      self_marked: 'bool',
      ai_marked: 'bool',
      confidence: 'int',
      seconds: 'int',
    },
  },
  mistakes: {
    soft: true,
    cols: {
      attempt_id: 'text',
      question_id: 'text',
      subject_id: 'text',
      topic_id: 'text',
      type: 'text!',
      note: 'text',
      fix: 'text',
      status: 'text!',
      review_due: 'int',
    },
  },
  flashcards: {
    soft: true,
    indexes: [['subject_id'], ['due']],
    fts: ['front_md', 'back_md'],
    cols: {
      subject_id: 'text',
      topic_id: 'text',
      front_md: 'text!',
      back_md: 'text!',
      origin: 'text!',
      ease: 'real',
      interval: 'int',
      reps: 'int',
      lapses: 'int',
      due: 'int',
    },
  },
  notes: {
    soft: true,
    indexes: [['subject_id']],
    fts: ['title', 'body_md'],
    cols: {
      subject_id: 'text',
      topic_id: 'text',
      title: 'text!',
      body_md: 'text!',
      pinned: 'bool',
    },
  },
  study_sessions: {
    soft: true,
    indexes: [['started_at']],
    cols: {
      subject_id: 'text',
      topic_id: 'text',
      started_at: 'int!',
      ended_at: 'int',
      seconds: 'int!',
      mode: 'text!',
      source: 'text!',
      summary: 'text',
    },
  },
  assessments: {
    soft: true,
    cols: {
      subject_id: 'text',
      title: 'text!',
      kind: 'text!',
      date: 'int',
      topics: 'json[]',
      score: 'real',
      max: 'real',
      feedback_md: 'text',
      source: 'text!',
    },
  },
  exams_generated: {
    soft: true,
    cols: {
      subject_id: 'text',
      title: 'text!',
      config: 'json{}',
      body_md: 'text',
      solutions_md: 'text',
      latex: 'text',
      question_ids: 'json[]',
      provider: 'text',
    },
  },
  ai_jobs: {
    cols: {
      kind: 'text!',
      input: 'json{}',
      status: 'text!',
      progress: 'real',
      output: 'json{}',
      error: 'text',
      provider: 'text',
      tokens_hint: 'int',
      finished_at: 'int',
    },
  },
  compass_items: {
    cols: {
      type: 'text!',
      external_id: 'text',
      title: 'text',
      body: 'text',
      due_at: 'int',
      subject_id: 'text',
      raw: 'json{}',
      synced_at: 'int',
    },
  },
  packs_installed: {
    cols: {
      pack_id: 'text!',
      name: 'text!',
      version: 'text',
      author: 'text',
      installed_at: 'int',
      contents: 'json{}',
    },
  },
  calendar_events: {
    soft: true,
    indexes: [['starts_at']],
    cols: {
      source: 'text!',
      external_id: 'text',
      title: 'text!',
      location: 'text',
      starts_at: 'int!',
      ends_at: 'int!',
      all_day: 'bool',
      subject_id: 'text',
      kind: 'text!',
      notes: 'text',
      raw: 'json{}',
      done: 'bool',
    },
  },
  todos: {
    soft: true,
    cols: {
      title: 'text!',
      group_name: 'text!',
      done: 'bool',
      subject_id: 'text',
      due_at: 'int',
      sort: 'int',
    },
  },
  submissions: {
    soft: true,
    cols: {
      subject_id: 'text',
      title: 'text!',
      kind: 'text!',
      source_id: 'text',
      question_ids: 'json[]',
      status: 'text!',
      total: 'real',
      max: 'real',
      marked_by: 'text',
      feedback_md: 'text',
    },
  },
  annotations: {
    soft: true,
    indexes: [['target_type', 'target_id']],
    cols: {
      target_type: 'text!',
      target_id: 'text!',
      page: 'int',
      rect: 'json{}',
      kind: 'text!',
      color: 'text',
      path: 'json[]',
      body_md: 'text',
      marks_delta: 'real',
      author: 'text!',
      thread: 'json[]',
      resolved: 'bool',
    },
  },
  memories: {
    soft: true,
    cols: { content: 'text!', source: 'text', kind: 'text' },
  },
  briefings: {
    cols: { date: 'text!', kind: 'text!', content_md: 'text', actions: 'json[]' },
  },
  media_projects: {
    soft: true,
    cols: {
      kind: 'text!',
      title: 'text!',
      prompt: 'text',
      scene_code: 'text',
      assets: 'json[]',
      voice: 'text',
      output_path: 'text',
      status: 'text!',
    },
  },
  plugins: {
    cols: {
      plugin_id: 'text!',
      name: 'text!',
      version: 'text',
      source: 'text!',
      enabled: 'bool',
      permissions: 'json[]',
      manifest: 'json{}',
    },
  },
  chats: {
    soft: true,
    cols: {
      title: 'text!',
      subject_id: 'text',
      agent: 'text!',
      provider: 'text',
      model: 'text',
      pinned: 'bool',
    },
  },
  chat_messages: {
    indexes: [['chat_id']],
    cols: {
      chat_id: 'text!',
      role: 'text!',
      content_md: 'text!',
      provider: 'text',
      model: 'text',
      sources: 'json[]',
      status: 'text!',
      error: 'text',
    },
  },
} as const satisfies Record<string, TableDef>

/** The current shape of every table. Equal to v1 until a later migration changes something. */
export const TABLES: Record<string, TableDef> = SCHEMA_V1
export type TableName = keyof typeof SCHEMA_V1

function columnSql(name: string, type: ColumnType): string {
  switch (type) {
    case 'text':
      return `${name} TEXT`
    case 'text!':
      return `${name} TEXT NOT NULL`
    case 'int':
      return `${name} INTEGER`
    case 'int!':
      return `${name} INTEGER NOT NULL`
    case 'real':
      return `${name} REAL`
    case 'bool':
      return `${name} INTEGER NOT NULL DEFAULT 0`
    case 'json[]':
      return `${name} TEXT NOT NULL DEFAULT '[]'`
    case 'json{}':
      return `${name} TEXT NOT NULL DEFAULT '{}'`
  }
}

/** DDL for a set of table definitions: tables, indexes, and FTS5 tables with sync triggers. */
export function buildDdl(schema: Record<string, TableDef>): string {
  const out: string[] = []
  for (const [table, def] of Object.entries(schema)) {
    const cols = [
      'id TEXT PRIMARY KEY',
      'created_at INTEGER NOT NULL',
      'updated_at INTEGER NOT NULL',
      ...(def.soft ? ['deleted_at INTEGER'] : []),
      ...Object.entries(def.cols).map(([name, type]) => columnSql(name, type)),
    ]
    out.push(`CREATE TABLE ${table} (${cols.join(', ')});`)
    for (const index of def.indexes ?? []) {
      out.push(`CREATE INDEX idx_${table}_${index.join('_')} ON ${table} (${index.join(', ')});`)
    }
    if (def.fts) {
      const f = def.fts.join(', ')
      const news = def.fts.map((c) => `new.${c}`).join(', ')
      const olds = def.fts.map((c) => `old.${c}`).join(', ')
      out.push(
        `CREATE VIRTUAL TABLE ${table}_fts USING fts5(${f}, content='${table}', content_rowid='rowid', tokenize='porter unicode61');`,
        `CREATE TRIGGER ${table}_fts_ai AFTER INSERT ON ${table} BEGIN INSERT INTO ${table}_fts(rowid, ${f}) VALUES (new.rowid, ${news}); END;`,
        `CREATE TRIGGER ${table}_fts_ad AFTER DELETE ON ${table} BEGIN INSERT INTO ${table}_fts(${table}_fts, rowid, ${f}) VALUES ('delete', old.rowid, ${olds}); END;`,
        `CREATE TRIGGER ${table}_fts_au AFTER UPDATE ON ${table} BEGIN INSERT INTO ${table}_fts(${table}_fts, rowid, ${f}) VALUES ('delete', old.rowid, ${olds}); INSERT INTO ${table}_fts(rowid, ${f}) VALUES (new.rowid, ${news}); END;`,
      )
    }
  }
  return out.join('\n')
}

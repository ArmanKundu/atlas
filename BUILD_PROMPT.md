# Build brief: Atlas — an open-source, local-first AI study assistant for any subject (desktop, Mac + Windows)

**This is the final build brief.** Build the framework and structure now: every screen, data path and integration point works end to end, with **no subject content shipped**. Users add all content themselves.

Before writing any UI, read section R (references) and look through the `random-inspo/` folder in this repo.

Paste everything below into Claude Code. Work through it phase by phase. Don't stop to ask questions: when something is ambiguous, pick the option that best fits this brief, note the decision in `DECISIONS.md`, and keep going.

---

## 0. What we're building

Atlas is a desktop study app for any student studying anything: high school (VCE, HSC, IB, A-levels, AP), university units, or self-study. It is built first for my VCE year, but nothing is hard-coded to one curriculum. Each student installs it on their own laptop, adds whatever subjects they're studying, imports their own resources (study designs, past exams, solutions, examiner reports, textbooks, class notes), and the app organises everything into a clean, searchable study workspace. AI features run on **the student's own AI plan**: Claude, ChatGPT or Gemini through that provider's official sign-in, a local model, or their own API key (section 6). **Nothing goes to a server we run.** All data stays on the laptop.

Atlas is **open source** (MIT licence) and distributed through a public **GitHub repo**:
- Releases are downloaded from GitHub and the app auto-updates from GitHub Releases.
- Anyone can fork it, build plugins and skills, and send pull requests.
- All personal data lives only on the user's laptop.

The goal: give every student a personal assistant that knows their subjects, resources, timetable, results and mistakes, and tells them exactly what to do next to get the best possible results. It should be better organised and more available than any tutor, and close to free, because it runs on the AI plan the student already pays for.

Users: me plus about 5 friends. Each person has their own profile, subjects, data and AI login. Nobody sees anyone else's data unless they deliberately export a pack and share it.

The bar: it should feel like a polished, well-funded product. That means fast, calm, consistent and forgiving, with no dead ends, no console errors and no lost data.

---

## R. References and brand (read first)

**Brand:**
- **App icon:** my own artwork, provided at `build/icon.png` (1024×1024), and I'll add `build/icon.icns` and `build/icon.ico`. If those two are missing, generate them from the PNG. Use it for the app, dock/taskbar, installers and the About screen.
- **Mascot:** the icon's character (a soft black spiky blob with two big white eyes and pupils) is the app mascot. Recreate it as an animated SVG component in the same silhouette style:
  - blinks and glances;
  - looks toward the cursor;
  - shows moods (idle, thinking, happy, celebrating/dancing, sleepy, concerned);
  - a tiny bounce when tapped.
  - The user picks a colour and accessory in onboarding; the default is black on light grey, like the icon.
- **Design inspiration folder:** I'll add `random-inspo/` with screenshots and videos. Before building the design system:
  - open every file;
  - write `random-inspo/NOTES.md` listing what to take from each (colours, type, spacing, components, motion);
  - then choose one coherent direction and record it in `DECISIONS.md`.
  - Don't mix styles screen by screen.

**Reference patterns I've already chosen (copy the patterns, not the brands):**
1. **Floating pill toolbars (annotation and text tools):** soft white rounded pills with gentle shadows on a light grey canvas.
   - Groups are separated by thin dividers: comment input with a send arrow; find bar with "2/7" and up/down/close; AI actions on a text selection ("Improve", "Explain"); "Edit"/"Comment"; formatting (B, I, U, code, colour, list, link); vertical zoom pill (+ / − / fit).
   - The primary action ("Reply") is a dark pill.
   - Use this pattern for the PDF viewer, the annotation layer, the notes editor and the selection menu.
2. **Calendar / planner:**
   - **Layout:** a clean left sidebar (workspace switcher, search with ⌘K, Essentials, Projects). The Calendar header has Today and prev/next controls with a black "+" button.
   - **To-do column:** a panel of collapsible groups (This week / This month / Unscheduled / Personal) with checkboxes. Items drag onto the grid.
   - **Week grid:** an all-day row, hour lines, and soft grey event cards with a small icon, title, time and a coloured progress strip. The current day is underlined.
   - Use this layout for the Planner.
3. **Segmented code input:** the large rounded digit boxes of a one-time-code screen, in two groups of three, with an active-box ring and placeholder zeros. Use it for the profile PIN/unlock and the "pair a device" code.
4. **Editorial pages:** warm off-white paper, a classic serif for big headings (e.g. Newsreader or Source Serif), a monospace for small labels, generous margins, and occasional finely engraved-style illustrations.
   - Use this for onboarding, the welcome/empty states, the weekly review and the README/website.
   - The working app stays clean sans-serif (Inter).

## 1. Hard rules (never break these)

1. **Local-first.** No backend, no telemetry, no analytics, no cloud database. The only network calls allowed:
   - the AI provider the user connected (section 6);
   - the update check;
   - the optional public library index (read-only HTTPS GET, section 9);
   - Compass sync, if the user turns it on.
2. **AI auth.**
   - Subscription sign-ins always go through each provider's **official** CLI or SDK (Claude Code / Claude Agent SDK, OpenAI Codex CLI, Gemini CLI). The user signs in through the provider's own login flow.
   - Atlas never reads, copies, logs, stores or transmits their tokens or session files. Atlas never offers its own login screen for a provider.
   - For API keys, the key belongs to the user and is used only from their laptop.
   - Show each provider's official terms link next to its connect button.
3. **Secrets.** API keys and Compass credentials are stored only with Electron `safeStorage` (Keychain / Windows Credential Manager), never in SQLite, logs, exports or packs.
4. **Copyright-safe sharing.** Exported or public packs can include the user's own notes, flashcards, question tags, and official study designs, exams and examiner reports.
   - Textbooks and paid tutoring material can be imported for personal use only.
   - Mark them `personal: true` and block them from public packs and from any export marked "shareable".
5. **No data loss.**
   - Every write goes through a transaction.
   - Make an automatic daily backup of each profile database (keep 14 copies).
   - Back up before every migration and before every update.
   - Provide one-click "Export everything" and "Restore from backup".
6. **Honest and legal.**
   - Atlas teaches and organises; it never helps complete assessed work (SACs, exams) dishonestly.
   - Compass access is read-only, uses the student's own login and is for personal use.
   - Estimates (ATAR or other entrance ranks, subject scores, grades) are always labelled as estimates.
7. **Works without AI.** Every non-AI feature must work fully in "none" mode. AI buttons hide or explain what they need. They never fail silently.

---

## 2. Stack

- **App:** Electron (latest stable) + Vite + React 18 + TypeScript (strict) + Tailwind + Radix UI primitives + Framer Motion (subtle) + lucide-react icons.
- **Storage:**
  - `better-sqlite3`, with one database file per profile in `app.getPath('userData')/profiles/<id>/atlas.db`;
  - Drizzle ORM with versioned migrations;
  - SQLite FTS5 for search.
- **Documents:**
  - `pdfjs-dist` for rendering and text extraction;
  - `tesseract.js` as the offline OCR fallback for scans;
  - `mammoth` for .docx;
  - `sharp` for page images.
- **Maths:**
  - KaTeX for rendering;
  - `mathjs` for numeric answer checking;
  - CodeMirror 6 for the LaTeX/Markdown editors with live KaTeX preview.
- **Packaging:** `electron-builder` for macOS (dmg, arm64 + x64) and Windows (nsis, x64), and `electron-updater` with the GitHub Releases provider.
- **Calendar:** `node-ical` for iCal feeds (Compass and others), and `rrule`.
- **Media studio:**
  - `ffmpeg-static` (bundled) for encoding;
  - `three` for 3D;
  - an offscreen BrowserWindow renderer for frame-by-frame capture.
- **Voices:**
  - Piper (offline neural TTS) as an optional downloadable voice pack;
  - fallback to the OS voices (macOS `say`, Windows SAPI via PowerShell).
- **Agent tools:** `@anthropic-ai/claude-agent-sdk` `createSdkMcpServer` + `tool()` exposes Atlas actions to the assistant in-process.
- **Notifications:** Electron `Notification` plus a tray icon.
- **Testing:** Vitest for unit tests and Playwright for Electron end-to-end tests. Use ESLint and Prettier.
- **Architecture:**
  - The main process owns the database, files, AI jobs and secrets.
  - The renderer talks only through a typed IPC layer (`contextBridge` + zod-validated channels).
  - Set `contextIsolation: true`, `nodeIntegration: false` and `sandbox: true` on the renderer.
  - Add a CSP that allows only `self` and KaTeX fonts in the renderer. All network calls (AI providers, update check, library index, calendar feeds) happen in the main process.

Folders:

```
src/main/        db, migrations, ipc, jobs, ai, ingest, packs, updater, compass, backup, mcp
src/renderer/    app shell, routes, components, design system, features/*
src/shared/      types, zod schemas, constants
content-schemas/ JSON schema for packs
tests/           unit + e2e
```

---

## 3. Data model (SQLite via Drizzle)

Every table has `id` (ULID), `created_at` and `updated_at`. Use soft delete (`deleted_at`) where users can delete things.

- **profile_meta:** name, year level, school, exam year, theme, avatar character, onboarding_done, ai_routes (JSON: which provider handles which task kind), study goals.
- **subjects:** name, code (e.g. MM34), kind (`science` | `maths` | `essay` | `accounting` | `language` | `other`), colour, icon, unit range, exam dates (JSON), active.
- **topics:** subject_id, parent_id, title, code (e.g. "U3 AOS1 KK4"), kind (`aos` | `outcome` | `key_knowledge` | `key_skill`), order, source_id (the study design it came from), not_required (bool), notes.
- **sources:** subject_id, kind (`study_design` | `exam` | `solutions` | `examiner_report` | `textbook` | `class_notes` | `worksheet` | `data_book` | `other`), title, year, publisher, file_path (copied into profile storage), page_count, personal (bool), ingest_status, checksum.
- **pages:** source_id, number, text, image_path (lazy), ocr (bool).
- **questions:** subject_id, source_id, year, paper, section, number, label (e.g. "2024 Q5b"), marks, stem_md (Markdown + KaTeX), parts (JSON), page_refs, topic_ids (JSON plus a join table), difficulty, state_average (if known), tags.
- **answers:** question_id, kind (`official_solution` | `examiner_report` | `sample` | `ai`), content_md, source_id, page_refs.
- **attempts:** question_id, given_answer_md, score, max, self_marked, ai_marked, confidence (1–4), seconds, created_at.
- **mistakes:** attempt_id, question_id, topic_id, type (`concept` | `careless` | `command_term` | `working` | `knowledge_gap` | `time`), note, fix, status (`open` | `fixed`), review_due.
- **flashcards:** subject_id, topic_id, front_md, back_md, origin (`manual` | `ai` | `mistake` | `question`), SM-2 fields (ease, interval, reps, due).
- **notes:** subject_id, topic_id, title, body_md, pinned.
- **study_sessions:** subject_id, topic_id, started_at, ended_at, seconds, mode (`focus` | `stopwatch` | `exam`), source (`timer` | `manual`).
- **assessments:** subject_id, title, kind (`sac` | `exam` | `test` | `trial`), date, topics, score, max, feedback_md, source (`manual` | `compass`).
- **exams_generated:** subject_id, title, config (JSON), latex, question_ids, created_at.
- **ai_jobs:** kind, input (JSON), status (`queued` | `running` | `done` | `error` | `cancelled`), progress, output (JSON), error, provider, tokens_hint, created_at, finished_at.
- **compass_items:** type (`lesson` | `task` | `news` | `feedback` | `event`), external_id, title, body, due_at, subject_id, raw (JSON), synced_at.
- **packs_installed:** pack_id, name, version, author, installed_at, contents summary.
- **calendar_events:** source (`compass_ical` | `compass_adapter` | `manual` | `planner` | `other_ical`), external_id, title, location, starts_at, ends_at, all_day, subject_id, kind (`lesson` | `sac` | `exam` | `due` | `event` | `study_block`), notes, raw.
- **submissions:** subject_id, title, kind (`practice_paper` | `sac_practice` | `essay` | `homework`), source_id (the scan/PDF of the student's work), question_ids, status (`draft` | `marking` | `marked`), total, max, marked_by (`self` | `ai` | `teacher`), feedback_md.
- **annotations:** target_type (`page` | `submission_page` | `note`), target_id, page, rect (x, y, w, h normalised 0–1), kind (`highlight` | `pen` | `box` | `comment` | `tick` | `cross` | `mark`), color, path (for pen), body_md, marks_delta, author (`me` | `ai` | `teacher`), thread (JSON replies), resolved.
- **goals:** target overall rank or grade (with the system chosen: ATAR, HSC, IB points, GPA, none), target score per subject, weekly hours, exam dates.
- **memories:** the assistant's local long-term memory about the student, one fact per row (preferences, recurring struggles, what works). Each row has a source and is user-visible and deletable.
- **briefings:** date, kind (`daily` | `weekly`), content_md, actions (JSON).
- **media_projects:** kind (`image` | `animation` | `video` | `3d` | `slides`), title, prompt, scene_code, assets, voice, output_path, status.
- **plugins:** id, name, version, source (`builtin` | `github` | `local`), enabled, permissions (JSON), manifest.
- **settings:** key/value.

Add FTS5 virtual tables over `pages.text`, `questions.stem_md`, `answers.content_md`, `notes.body_md` and `flashcards`.

---

## 4. Onboarding (first run)

This is a full-screen, beautiful, step-by-step flow with a progress rail, keyboard support, Back/Next on every step, and Skip where it makes sense. Save after every step, so quitting midway resumes in the same place.

1. **Welcome.** Show the app name, a one-line promise ("Everything you study, organised, on your laptop") and an animated mascot blob (see section 12).
2. **Create profile.** Name, password (optional, argon2-hashed; it unlocks the profile at launch), year level, exam year.
3. **Choose subjects.**
   - First pick a **study system** (VCE, HSC, IB, A-levels, AP, University, Other). Presets only suggest subject names, terminology (SAC, internal assessment, coursework) and grading scales; they ship no content.
   - Then add subjects: type any name, or pick suggestions from the preset list (a small static JSON of names + `kind` per system).
   - The user can also add a subject later just by importing its resources: Atlas suggests a name and kind from the files.
   - Multi-select, then confirm units (1/2, 3/4) and set exam dates (optional, editable later).
   - Allow custom subjects.
4. **Connect AI.** Show provider cards with a live status on each:
   - **Claude (Pro/Max)**, **ChatGPT (Plus/Pro)**, **Gemini (Google account)**, **Local model (Ollama / LM Studio)**, **API key** (Anthropic, OpenAI, Google, OpenRouter) and **No AI**.
   - **Detection:** for each provider, detect if its official CLI is installed and signed in.
     - Not installed: show the official install command for their OS with Copy and a Recheck button.
     - Installed but signed out: "Sign in" opens a terminal running the official login command, then Atlas polls until it's ready.
   - **Several providers:** the user can connect more than one. After connecting, show a small routing table (smart defaults, editable later in Settings):
     - chat → Claude;
     - reading scans → whichever has vision;
     - bulk tagging → the cheapest connected option.
   - Explain in one line that AI uses their own plan and nothing goes through us.
5. **Import resources, per subject.** A large drop zone for each subject, with tiles for:
   - study design, past exams, solutions, examiner reports, textbooks, class notes, data book;
   - plus "Import a folder" (walks recursively) and "Install a pack" (`.atlaspack`).
   - Files are copied into profile storage, hashed and de-duplicated.
6. **Organise.** Show the ingestion pipeline running (section 5) as a live checklist per file. The user can keep going while it runs in the background.
7. **Goals.** Target overall result (in their system's terms) and target score per subject, with a short explainer that these are estimates. Set a weekly hour goal per subject and a preferred focus length.
8. **Connect your school calendar (optional, with a tutorial).** Pick the school portal: Compass, Canvas, Google Classroom, SEQTA, Schoolbox, other, or any iCal link. Show a step-by-step guide per portal, with screenshot placeholders:
   - Option A, recommended: in Compass go to Calendar → Subscribe/Export → copy the iCal link, then paste it here.
   - Option B (Compass first; other portals later): turn on the advanced read-only sync adapter (section 10).
   - Show a live preview of the next 7 days once connected. Skippable.
9. **Quick tour.** A 5-stop tooltip tour (Today, a subject, the paper viewer, the assistant, the timer), dismissible.
10. **Done.** Show a personalised dashboard preview, then go to Today.

---

## 5. Ingestion pipeline (the hardest part — build it carefully)

This is a resumable job queue in the main process: concurrency 2 for AI jobs and 4 for local jobs. Every step is idempotent and checkpointed in `ai_jobs`, so a crash or quit resumes where it left off. The UI shows per-file progress, a cancel button, an "AI usage" hint, and a clear error with **Retry** and **Fix manually** when something fails.

**Stage A — local (no AI):**
- Copy the file, then compute its checksum, page count, page text (pdf.js) and thumbnails.
- If a page has under 40 characters of text, mark it as a scan and queue OCR (tesseract.js offline, English).
- Guess the document type from the filename and first-page text with heuristics: "Study Design", "Examination", "Examiner's report"/"Assessment report", "Solutions"/"Answers", "Data book". Confidence below 0.8 asks the user in a small confirm chip.

**Stage B — understand, via AI (any connected provider):**
1. **Study design → topic tree.**
   - Send the text of the key-knowledge sections in chunks.
   - Ask for strict JSON matching a zod schema: units → areas of study → outcomes → key knowledge / key skills, with codes, plus a "not required" list if the document has one.
   - Validate it; on a schema failure, retry once with the validation error in the prompt.
2. **Exam → questions.**
   - Split by page. Detect "Question N" or "Section A/B" boundaries locally first. AI then refines each question into stem, parts, marks, any diagram/table page refs, and multiple-choice options.
   - Store the stem as Markdown + KaTeX, converting maths to LaTeX.
   - For pages with diagrams, keep the page image ref and show it in the viewer; don't try to redraw diagrams.
3. **Solutions / examiner reports → answers.** Match them to questions by year, paper and number. Extract per-part answers, examiner comments, state averages and the multiple-choice % distribution where present.
4. **Tagging.** Map each question to 1–3 topics from that subject's tree, with confidence. Below 0.6 goes to a "Needs review" queue.
5. **Textbooks / notes.** Chunk them by heading, link chunks to topics, and detect worked examples paired with their answers ("Example 3" ↔ the answer or solution page), so worked-example hovers work like past-paper hovers.

**Other ingestion requirements:**
- **Reading scanned pages with AI:** render the page to PNG in a temp folder and send it through the provider's vision path:
  - Claude Agent SDK with `allowedTools: ["Read"]` and the working directory set to that folder;
  - Codex/Gemini CLIs with an image attachment;
  - API image input;
  - a local vision model if available.
  - Delete the temp files afterwards.
- **No AI:** the same pipeline runs Stage A only, then gives a fast manual editor:
  - draw a box around a question on the page;
  - set its year, number and marks;
  - pick topics from a searchable tree;
  - link a solution page with a click.
  - Bulk tools: "next question", keyboard shortcuts.
- **Usage control:**
  - Show a rough "this import will take ~N AI calls" before starting a large import.
  - Send text before images, cache by checksum (never re-process the same file), and let the user pause the queue.
  - If a provider reports a usage limit, pause its jobs and show "Your <Provider> usage limit is reached. Jobs resume when it resets", with a manual resume button and "Use another connected provider for now".
- **Prompts** live in `src/main/ai/prompts/*.ts` as versioned functions with zod output schemas, so they're easy to improve later.

---

## 6. AI providers (bring your own plan)

`src/main/ai/` holds a common interface plus one adapter per provider. There's a router that picks the adapter per task kind, and a capability registry.

```ts
interface AiAdapter {
  id: 'claude-code' | 'codex' | 'gemini-cli' | 'ollama' | 'lmstudio' | 'anthropic-api' | 'openai-api' | 'google-api' | 'openrouter';
  caps: { vision: boolean; tools: boolean; json: boolean; maxContext: number; streaming: boolean };
  status(): Promise<{ installed: boolean; signedIn: boolean; detail: string; plan?: string }>;
  json<T>(task: AiTask, schema: ZodSchema<T>, opts?): Promise<T>;            // structured
  stream(task: AiTask, onText: (t: string) => void, opts?): Promise<string>; // chat
  vision(task: AiTask, imagePaths: string[], schema?): Promise<any>;
  cancel(jobId: string): void;
}
```

**Adapters:**
- **claude-code:** `@anthropic-ai/claude-agent-sdk` `query()` using the user's own Claude Code sign-in.
  - Make sure `ANTHROPIC_API_KEY` is not set for these calls, so usage comes from their plan.
  - Atlas tools go in via `createSdkMcpServer` + `tool()`, so the assistant can act.
  - Skills from plugins load from a `.claude/skills` folder in the agent's working directory.
- **codex:** the official OpenAI Codex CLI, signed in with the user's ChatGPT account.
  - Run it non-interactively (`codex exec`, with JSON output and a read-only sandbox) as a child process.
  - Prompt and schema go in; parsed JSON or streamed text comes out.
- **gemini-cli:** the official Gemini CLI, signed in with the user's Google account, run non-interactively the same way.
- **ollama / lmstudio:** local HTTP on localhost. List the installed models and let the user pick one. Fully offline.
- **anthropic-api / openai-api / google-api / openrouter:** official SDKs with the user's key from safeStorage.

**Rules for every adapter:**
- CLI adapters spawn the official binary with a clean, minimal environment and a temp working directory. They never touch the provider's config or credential files.
- The exact CLI flags live in one file per adapter (`src/main/ai/adapters/<id>/cli.ts`) with a version check, so they're easy to fix when a CLI changes.
- If a CLI's output format isn't machine-readable, wrap the prompt so the model returns a fenced JSON block, and parse that.
- Every adapter supports cancellation (AbortController / kill the child process), a 3-minute timeout (5 for big jobs) and one retry on transient errors.
- Errors map to `not_installed` / `not_signed_in` / `usage_limit` / `network` / `bad_output` / `unsupported` / `unknown`, each with a friendly message and next step.

**Router:**
- `ai_routes` maps each task kind to an ordered list of adapters:
  - `chat`, `explain`, `exam_answer`, `mark_answer`, `mark_scan` (needs vision);
  - `ingest_study_design`, `ingest_exam`, `tag_questions`, `make_flashcards`;
  - `generate_exam`, `media_scene`, `briefing`.
- If the first adapter fails with `usage_limit`/`not_signed_in`, fall through to the next one and tell the user which provider answered.
- If no connected adapter has vision, scans fall back to local OCR (tesseract) + text.
- Settings → AI shows each provider's status, a "Test" button, the routing table and a usage log (counts per provider per day, no content).

**NoneAdapter:** throws a typed `ai_unavailable` error that the UI turns into a helpful empty state.

**Labels:** every AI output is marked with a small badge naming the provider that wrote it, and can be edited.

## 7. Features

### Today (home dashboard)
- **Greeting:** greeting, date, and days to each exam.
- **Study next:** a ranked list scored by `weak_topic_score × urgency(days to next assessment on that topic) × staleness(days since practised)`, with one-tap actions (practise 5 questions, review flashcards, read notes).
- **Upcoming:** assessments, plus Compass items if enabled.
- **Progress:** today's study time against goal per subject (ring), flashcards due, open mistakes.
- **Continue:** "Continue where you left off".

### Subject workspace (one per subject, with tabs)
- **Overview:**
  - topic tree with a mastery bar per topic (from attempts, mistakes and flashcards);
  - recent activity;
  - resources by type.
- **Library:**
  - every source, filterable by type, year and personal/shared;
  - the paper viewer opens any of them.
- **Paper viewer (signature feature):**
  - **Layout:** PDF page on the left; a right inspector with tabs Question | Solution | Examiner report | My attempts | Notes.
  - **Hover/click:** hovering a question region highlights it; clicking pins it in the inspector. Hovering a worked example in a textbook shows its answer.
  - **Practice:** a "Practise this" button opens the question in practice mode.
  - **Search:** search inside the document.
- **Questions:**
  - filter by topic, year, marks, difficulty, state average, unattempted, bookmarked or got wrong;
  - cards render KaTeX;
  - "Build a set" drops the selected questions into a practice set.
- **Practice mode:**
  - **Answering:** one question at a time, answer box with Markdown + KaTeX (CodeMirror), optional timer.
  - **Marking:** reveal the solution and examiner report, self-mark per part with checkboxes from the marking points, confidence 1–4.
  - **Logging:** any lost mark offers "Log a mistake" (type, note, fix). AI mode adds "Mark my answer" (a strict examiner, using the official marking guide or examiner report the user imported; returns marks per part plus feedback).
- **Mistakes / error log:**
  - a table and a board view by type and status;
  - review queue with spaced reminders;
  - "Turn into flashcard";
  - weekly "top 3 recurring mistakes".
- **Flashcards:**
  - SM-2 review with keyboard (1–4) and KaTeX;
  - generate from notes, mistakes or a topic (AI);
  - import/export CSV.
- **Notes:**
  - Markdown + KaTeX editor with live preview, linked to topics;
  - "Summarise this source into notes" (AI);
  - formula sheet / data book view for science and maths subjects.
- **Ask (subject tutor, AI):**
  - chat grounded in that subject's own library: retrieve top FTS5 matches and pass them as numbered sources;
  - answers cite inline (clickable chips that open the viewer at the page);
  - **modes:**
    - Explain;
    - Exam answer (full-mark response in the style of that subject's official papers);
    - Solve step by step;
    - Check my working;
    - Syllabus check ("Is this examinable?", answered from the user's own syllabus/study design);
  - the user can attach images or PDFs;
  - every answer has: copy, regenerate, save to notes, make flashcards, share as PNG (a clean card render of question + answer).


### Annotations and paper submissions (signature feature)
- **Annotate anything:** every PDF page and note supports highlight, pen (pressure where available), box, tick/cross, text comment and sticky comment pins.
  - Comments have threads and resolve states.
  - The comment sidebar lists everything on the document; clicking jumps to the spot.
  - Annotations never modify the original PDF; they're stored in `annotations` and can be exported as an annotated PDF.
- **Submit a paper:**
  - the student photographs or scans their handwritten answers (drag-and-drop, phone photos, multi-page PDF);
  - Atlas auto-crops, straightens and orders the pages;
  - the student links them to an exam (or Atlas detects which one);
  - then it's marked (below).
- **AI marking:**
  - the marker reads each page image against the official solutions and examiner report;
  - it returns per-part marks plus annotations with coordinates (tick/cross, comment boxes next to the line where marks were lost, the missing marking point, the exact phrase examiners want);
  - these render as an overlay on the student's own pages, like a teacher's marked paper, and the total and per-topic breakdown update mastery and the error log automatically.
- **Self and teacher marking:** the same overlay tools work for self-marking and for typing in a teacher's comments. Teacher feedback is tagged `teacher` and weighted highest in the study-next ranking.
- **Paper history:** a timeline of every submitted paper per subject with score trend, average time per mark, and the 3 most repeated lost-mark reasons.

### Assistant (the personal copilot)
- **Access:** a global assistant panel (Cmd/Ctrl+J) that knows everything in Atlas through in-process tools:
  - search, read questions/answers/pages, get the timetable, get results, get weak topics;
  - create flashcards, notes and study blocks; log mistakes; start the timer; build an exam; open a page.
- **Approval:** every action that writes data shows an inline "Do it" button the user approves (or auto-approve, a setting).
- **Memory:** a local long-term memory (the `memories` table). The assistant proposes memories ("You lose marks on command terms in Chemistry"), and the user can see, edit and delete them in Settings → Memory.
- **Daily briefing:** at a set time, it writes:
  - today's lessons, what to bring (from lesson plans), anything due or new on Compass;
  - a 3-item study plan sized to the free time in the calendar;
  - one micro-quiz on yesterday's weakest topic.
  - It's delivered as a notification plus a card on Today.
- **Weekly review (Sunday):** hours vs goal per subject, results this week, mistakes fixed vs new, next week's assessments, and a proposed week of study blocks to drag onto the calendar.
- **Agents:** specialist agents per subject, like Operon's — Examiner, Explainer, Marker, Study-design checker, Quizmaster, Planner. A message clearly meant for another agent offers to hand it over.
- **No AI:** the briefing and weekly review still generate from rules and data, with no prose.

### Planner and calendar
- **Calendar:** week and month views combining Compass iCal events, SACs/exams, manual events and study blocks.
- **Auto-plan:** fills free time before each assessment with spaced, interleaved study blocks weighted by weak topics. The student drags blocks to adjust; finishing a block logs a study session.
- **Countdowns and exam mode:** in the last 14 days before an exam, the subject switches to "exam mode": daily timed papers, error-log replays and examiner-report traps.
- **Notifications:** lesson in 10 minutes, SAC tomorrow, flashcards due, study block starting (all configurable, quiet hours).

### Results and grade tracker
- **Inputs:** results per subject (SACs, practice exams, trials) and goals.
- **Shows:**
  - trend lines;
  - an estimated study score range per subject from practice exam percentages, with clearly labelled assumptions;
  - an estimated overall rank or grade for their system (ATAR, HSC, IB, GPA), using a configurable scaling/conversion table the user can edit or import, labelled "estimate". Hide it when the system is "none".
- **What-if:** "what if I raise Chemistry by 3" shows the effect on the estimate, and the planner shifts hours to where marks are cheapest to gain.

### Learning science built in
- **Recall:** active recall by default (questions before answers), spaced repetition on everything (questions, mistakes, cards), and interleaved practice sets.
- **Mistakes:** an error log replay — re-attempt old wrong questions after 1, 3, 7 and 21 days until they're right twice.
- **Exam technique:** command-term drills, a reading-time planner, mark-per-minute pacing, and "examiner traps" collected from every imported examiner report.
- **Feynman mode:** explain a topic in your own words and AI finds the gaps.

### Media studio (visuals, animations, videos — coded frame by frame)
Language models can't paint pixels, but they can write code that draws every frame. The studio turns a prompt or a textbook concept into visuals:
- **Image mode:** the AI writes SVG or HTML/CSS (diagrams, labelled biology/chemistry figures, maths graphs with exact plots, infographics, summary posters), previewed live and exported as PNG/SVG/PDF.
- **Animation/video mode:**
  - the AI writes a scene script in a small Atlas scene API (JS: timeline, shapes, text, KaTeX equations, arrows, graphs, camera moves; Manim-like);
  - the offscreen renderer steps time frame by frame at the chosen fps and resolution, captures each frame, and ffmpeg encodes MP4/WebM/GIF;
  - include a scrubber preview, scene list, and "edit this scene" by prompt or by hand in the code editor.
- **3D mode:** three.js scenes (molecules, cells, 3D graphs, vectors for Specialist) with orbit preview, rendered frame by frame to video.
- **Voiceover:**
  - narration script per scene;
  - voices from OS TTS, downloadable offline Piper voices (installed from the app; voices listed from a GitHub-hosted index), or imported audio files;
  - timings align scene lengths to narration, and subtitles export as SRT.
- **From your resources:** "Explain this page as a 60-second video" builds the script from the selected textbook or notes text.
- **Safety:** scene code runs in a sandboxed offscreen window with no Node access and no network. Only the Atlas scene API is exposed.

### Plugins and skills (make it extensible)
- **Plugin format:** a plugin is a folder or GitHub repo with `atlas-plugin.json` containing:
  - id, name, version, description, author;
  - permissions: `read:subjects`, `read:questions`, `write:notes`, `ai`, `network:<domain>`, `files`;
  - entry points:
    - **prompts/agents:** extra assistant agents and modes defined as Markdown prompt files;
    - **skills:** `SKILL.md` folders in Claude's skill format, copied into a `.claude/skills` folder in the agent's working directory, with the Agent SDK loading project settings, so community Claude skills (e.g. 3D/Blender-style motion skills) work inside Atlas when Claude is the provider. For other providers, the skill's Markdown is injected as instructions;
    - **UI panels:** a sandboxed iframe page talking to Atlas through a postMessage API limited to the granted permissions;
    - **media templates:** scene API templates for the studio.
- **Installing:**
  - Settings → Plugins shows built-ins and a "Install from GitHub URL" field (downloads a release zip, shows permissions, asks to approve);
  - a local folder can be installed for development;
  - plugins can be enabled, disabled and removed, and an update check runs per plugin.
- **Defaults:** ship 3 built-in plugins as examples: Formula sheet builder, Essay quote bank, Video explainer template.

### Focus mode
- **During a focus timer:** full-screen minimal view with the task, the timer and the mascot.
- **Distractions:** an optional blocklist reminder when you switch apps for too long (no system-level blocking).
- **After a session:** a session summary ("What did you get done?") feeds the weekly review.

### Exam builder
- **Pick:**
  - subject, topics, number of multiple-choice questions, extended-response marks and time;
  - source mix: past questions only, past + AI-written, or AI-written only.
- **Output:**
  - **format templates** in the style of the official papers the user imported (cover page, instructions, sections, mark allocations, answer lines/boxes, consistent numbering);
  - Atlas learns the layout from one imported official paper (the AI extracts a template JSON) and the user can tweak it;
  - ship one generic template;
  - a separate solutions booklet.
- **Rendering:** KaTeX on screen. **PDF export** via a print-styled HTML template + Electron `printToPDF` (A4, proper page breaks, no orphaned questions). **.tex export** too, so the user can compile with LaTeX.
- **Maths checking:** for maths subjects, every AI-written question with a numeric answer is checked with mathjs (and a second AI "verify" pass). If it fails, it's regenerated or flagged.
- **Timed sitting:** a full-screen exam timer (reading time + writing time, reminders), then the self-marking flow above.

### Subject-kind specifics
- **essay (English):**
  - essay workspace with a timer;
  - criteria-based feedback against the assessment criteria the user imports;
  - quote bank per text, with tags;
  - argument-analysis annotator (highlight techniques in a pasted article).
- **maths:**
  - a CAS-style "check my answer" box (mathjs);
  - working-out checker (AI);
  - a formula sheet.
- **science:**
  - a data book viewer;
  - "explain this graph" from an attached image.
- **accounting:**
  - ledger, balance sheet, income statement and cash flow templates as editable tables;
  - marking checks the working, not just totals.

### Study timer and stats
- **Timer:**
  - focus timer (Pomodoro with editable lengths) and stopwatch, tagged by subject + topic;
  - a menu-bar / tray mini timer;
  - keeps running if the window closes;
  - idle detection asks "Were you studying?".
- **Stats:**
  - GitHub-style yearly heatmap;
  - hours per subject per week (stacked bars);
  - streaks;
  - time-of-day histogram;
  - a "Hours vs results" scatter per subject (study hours before each assessment against the score).
- **Export:** export all sessions + assessments as CSV for my own analysis later.

### Global
- **Command palette (Cmd/Ctrl+K):** search everything across questions, pages, notes, cards and topics, with actions ("Start timer: Methods", "New note", "Build exam").
- **Settings:** profile, subjects, AI mode + status + test button, storage location, backups, updates, Compass, theme, keyboard shortcuts, about.

---

## 8. Open source, GitHub and updates

- **Repo:** a public GitHub repository, MIT licence, with these files:
  - `README.md` (what it is, screenshots placeholders, install steps, privacy promise);
  - `CONTRIBUTING.md`;
  - `PLUGINS.md` (plugin API);
  - `SECURITY.md`;
  - issue and PR templates;
  - a code of conduct.
- **No content in the repo:** no copyrighted content ever goes in it. The repo ships the app, the study-system preset lists (subject names only), sample fixture PDFs made by us, and empty schemas.
- **CI:** a GitHub Actions workflow builds macOS (arm64 + x64) and Windows on every tag, runs tests, and uploads artifacts to a GitHub Release with auto-generated notes.

- **Auto-update:** use `electron-updater` against GitHub Releases. Check on launch and every 6 hours. Show a non-blocking "Update ready, restart to install" toast with release notes.
- **Manual updates:** installing a newer installer over the old one keeps all data, because data lives in userData, never in the app folder.
- **Migrations:** every release runs pending database migrations after an automatic backup. A migration failure restores the backup and shows a clear message.
- **Content packs** (section 9) update separately from the app.
- **Release script:** `npm run release` bumps the version, builds both platforms and drafts the GitHub release.
- **Signing:** document in `README.md` how to code-sign later. Until then, document the "right-click → Open" (Mac) and "More info → Run anyway" (Windows) steps for friends.

---

## 9. Packs and the public library (no server)

- **Packs:** an `.atlaspack` is a zip with `manifest.json` (id, name, subject code, version, author, description, licence note, contents counts) plus JSON data, with optional PDFs for shareable official documents only.
- **Export:** "Export pack" lets the user tick what to include:
  - topic tree, questions + answers + tags, notes, flashcards, official PDFs;
  - personal sources are always excluded, and the UI says why.
- **Import:**
  - "Install pack" previews the contents, de-duplicates by checksum/IDs, then merges;
  - user data always wins conflicts;
  - packs can be uninstalled cleanly.
- **Public library (optional, read-only):**
  - Settings holds a library URL pointing to a public GitHub repo's `index.json`, which lists packs with download URLs.
  - The Library tab shows them as cards (subject, author, version, size, description); one click installs.
- **Publishing:** the app makes the pack file and opens the repo's upload or issue page with instructions. **No server and no accounts.** If the URL isn't set, the tab says how to share packs over Discord or Drive instead.

---

## 10. School portals: Compass first (optional, per user)

- **Level 1 — iCal (default, safest):**
  - the user pastes their Compass calendar subscription link (the onboarding tutorial shows where to find it);
  - Atlas fetches it on launch and every hour with node-ical, maps events to subjects by name matching (with a mapping screen to fix mismatches), and fills the calendar and Today;
  - the link is stored in safeStorage because it's a private URL.
- **Level 2 — read-only adapter (advanced):** lesson plans, learning tasks, results, feedback and the newsfeed, behind the interface below. The interface is generic (`SchoolPortalSource`), with Compass as the first adapter, so Canvas, Classroom and others can be added as plugins.

- **Code location:** `src/main/compass/` with a `CompassSource` interface: `fetchLessons`, `fetchTasks`, `fetchNews`, `fetchFeedback`, `fetchEvents`. All read-only.
- **Credentials:** the user's own Compass login, stored only in safeStorage.
- **Sync:** on launch and every 2 hours.
- **What it feeds:**
  - map items to subjects by name;
  - tasks/SACs go into `assessments`; feedback goes into assessment feedback;
  - "Bring tomorrow" items are extracted from lesson plans (AI if available, keyword fallback).
- **Status:** ship the interface, settings UI, storage and mapping fully. Implement the fetchers as a clearly marked adapter I'll finish myself, with a fixture-based mock so the UI is testable now.
- **Off switch:** turning it off deletes the stored credentials.

---

## 11. Local MCP server (bonus)

`src/main/mcp/` provides a stdio MCP server over the active profile's database. The tools:

- `search`, `get_question`, `get_topic_tree`;
- `log_attempt`, `add_mistake`, `add_flashcards`;
- `get_weak_topics`, `get_schedule`, `start_timer`.

Settings shows "Connect to Claude Desktop / ChatGPT / other MCP clients" with the config snippet for each (with Copy), so the user can study in those apps on their normal plan using their own Atlas data. Writes require the app to be running and the profile unlocked.

---

## 12. Design system (make it feel premium)

- **Look:** calm, confident, minimal. Think Linear + Things + ChatGPT.
  - Light and dark themes, following the system by default.
  - Inter for UI; KaTeX for maths; JetBrains Mono for code/LaTeX.
- **Layout:**
  - collapsible left sidebar (Today, subjects with colour dots, Exam builder, Timer, Library, Settings);
  - top bar with breadcrumbs, the command palette trigger and the timer pill;
  - content max-width 1100 px for reading views, full width for the viewer.
- **Tokens** (CSS variables):
  - an 8-pt spacing scale and radius 10/14/20;
  - neutral greys plus one accent, with each subject's own colour used sparingly;
  - shadows soft and rare;
  - focus rings visible.
- **Motion:** 150–220 ms ease-out, no bouncing on core UI, `prefers-reduced-motion` respected.
- **Mascot:** a small animated blob character the user picks in onboarding (colour + accessory). It blinks and glances, celebrates finished sessions, and thinks while AI runs. It's never in the way.
- **States:** every list has a designed empty state with one clear action, a skeleton loader and an error state with Retry. Toasts are used for success, and inline messages for errors.
- **Accessibility:** full keyboard navigation, ARIA on custom controls, WCAG AA contrast, and everything usable at 1280×800 and on a 13" laptop.
- **Copy:** short and human. No exclamation marks in errors. Every error says what happened and what to do next.

---

## 13. Quality bar

- TypeScript strict, no `any` in shared types, zod at every IPC and AI boundary.
- React error boundaries per route with a "Something went wrong — reload this view" fallback that also writes to a local log (`userData/logs`, rotated, no personal content).
- **Unit tests:**
  - SM-2;
  - study-next ranking;
  - mastery calculation;
  - pack export/import round-trip;
  - migrations;
  - heuristic document-type detection;
  - question-boundary detection on fixture PDFs.
- **End-to-end tests (Playwright for Electron):**
  - first-run onboarding with AI = none;
  - import a fixture exam + solutions and see questions appear (manual mode);
  - practise a question and log a mistake;
  - run the timer and see stats update;
  - export and reimport a pack;
  - mock the AI provider and run the full ingestion path.
- **More tests:**
  - iCal parsing and subject mapping;
  - annotation coordinate round-trip (rendered at any zoom);
  - plugin permission enforcement;
  - the scene renderer producing the right number of frames for duration × fps;
  - the planner never double-booking calendar time.
- **Performance:** launch to interactive in under 2 s on an M1, searching 10k pages in under 100 ms, and the viewer stays smooth on 300-page PDFs (virtualised pages).
- **Clean code:** `npm run check` runs lint + typecheck + tests, with zero warnings before each commit.

---

## 14. Build order (commit after each, keep the app runnable at every step)

1. Scaffold Electron + Vite + React + TS + Tailwind, secure IPC, design tokens, app shell, theme, command palette skeleton. Set up the GitHub repo files and the CI workflow.
2. Database, migrations, profiles (create/unlock/switch), backups, settings.
3. Onboarding steps 1–3 and 7–8, plus the subject catalogue.
4. Resource import and Stage A ingestion; Library and paper viewer, with page rendering and search.
5. Manual question editor and linking (the no-AI path, end to end).
6. AI adapters (claude-code, codex, gemini-cli, ollama, API keys, none), router, status UI and onboarding step 4.
7. Stage B AI ingestion (study design → topics, exam → questions, answers matching, tagging, review queue).
8. Questions browser, practice mode, self-marking, mistakes, mastery.
9. Flashcards (SM-2), notes editor with KaTeX, and formula/data book view.
10. Timer + tray, stats, and the hours-vs-results chart.
11. Today dashboard and study-next ranking.
12. Ask (subject tutor) with grounded sources, modes, attachments and share-as-PNG.
13. Exam builder with PDF and .tex export, maths checks and the timed sitting.
14. Subject-kind specifics (essay, maths, science, accounting).
15. Packs export/import plus the public library tab.
16. Updater, release script and README (install steps for friends, signing notes).
17. Compass: iCal sync + mapping screen, the adapter interface + mock, and the MCP server.
18. Calendar + planner + notifications + exam mode.
19. Annotations on PDFs and notes; paper submission with auto-crop and AI marking overlay; paper history.
20. Assistant panel with in-process tools, approvals, memory, daily briefing and weekly review.
21. Results and grade tracker with what-if.
22. Media studio: image mode, then the scene API + frame-by-frame video render + ffmpeg, then voices (OS TTS, Piper download) and subtitles, then 3D mode.
23. Plugin system (manifest, permissions, GitHub install, skills loading, sandboxed panels) + 3 example plugins.
24. Focus mode and the learning-science features (error-log replay, command-term drills, Feynman mode).
25. Polish pass: empty states, keyboard shortcuts, reduced motion, dark mode audit, then run the full test suite and fix everything.

At the end, write:
- `README.md`: how to run, build, release, and install on Mac/Windows for friends;
- `DECISIONS.md`;
- `KNOWN_ISSUES.md`.

If time runs short, finish stages 1–13 to a high standard first. For the later stages, build the foundation (schema, interfaces, UI shell, one working path) and leave clear TODOs, rather than doing everything badly. Each piece should be ready for a later session to complete.

Then print a short summary of what's done, what's a foundation only, what's stubbed (Compass adapter fetchers) and the next 5 things you'd do.

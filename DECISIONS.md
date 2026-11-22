# Decisions

Choices made while building Atlas from `BUILD_PROMPT.md`, newest phase last. Each entry says what was chosen and why.

## Phase 1: scaffold, shell, design system

### D-001 Design direction: "quiet ink on soft grey"

One system with two registers that share tokens (full notes in `random-inspo/NOTES.md`):

- **Working app:** Inter, light grey canvas, white surfaces, hairline borders, pill controls, soft shadows only on floating things.
- **Editorial moments** (onboarding, welcome/empty states, weekly review): warm paper, Newsreader headings, JetBrains Mono labels, hairline rules.
- **Accent:** ink (near-black, taken from the app icon). It inverts to off-white in the dark theme. The brief asks for "neutral greys plus one accent"; the icon and every reference are monochrome, so the accent is ink rather than a hue.
- **Focus ring:** the light blue from the code-input reference, the only hue in the chrome. Subject colours show only as dots and thin strips.

### D-002 Build tooling: electron-vite

`electron-vite` builds main, preload and renderer from one config and gives hot reload in dev. Output goes to `out/`; installers go to `release/`.

### D-003 Versions

Latest stable of everything on 2026-11-16, with two deliberate holds:

- **React 18.3** because the brief names React 18.
- **TypeScript 6.0** rather than 7.0, because `typescript-eslint` 8 supports TypeScript below 6.1 and the brief requires lint with zero warnings.

### D-004 CommonJS output for main and preload

`package.json` has no `"type": "module"`, so the main process and preload build to CommonJS. A sandboxed preload must be CommonJS, and this keeps both bundles on one module system. Config files that need ESM use `.mjs`/`.ts`.

### D-005 Renderer is served from a custom `atlas://` scheme

In production the renderer loads from `atlas://app/…` (a privileged, standard scheme handled in the main process) instead of `file://`. That gives the page a real origin so the CSP can say `'self'`, and the handler refuses any path outside the built renderer folder.

### D-006 Content Security Policy

- **Production:** `default-src 'none'`; scripts, styles, fonts, images and connections from `'self'` only (plus `data:`/`blob:` for images and fonts). KaTeX fonts are bundled, so they count as `'self'`.
- **Inline styles are allowed (`style-src 'self' 'unsafe-inline'`)** because Radix dialogs inject a small `<style>` to lock scrolling and KaTeX writes inline `style` attributes. The end-to-end tests caught the stricter policy breaking the command palette. Inline and remote scripts stay blocked.
- **Development only:** the Vite dev server needs inline scripts/styles and a WebSocket for hot reload, so dev uses a relaxed policy limited to the local dev server origin.
- The renderer cannot navigate away, open windows, or request permissions; external links open in the system browser from the main process after an `https:` check.

### D-007 IPC contract

- One contract file (`src/shared/ipc.ts`) lists every channel with a zod schema for the request and the response.
- The preload exposes only `atlas.invoke(channel, payload)` and `atlas.on(event, listener)`, and rejects channel names that are not in the contract.
- The main process validates the sender (must be the app's own page), the request and the response. Handlers return a result envelope (`ok` + data, or `ok: false` + a typed error) so the renderer never sees a raw exception.

### D-008 App-level preferences live in a JSON file, not SQLite

`userData/prefs.json` holds the few things needed before a profile is unlocked: theme, sidebar state, window bounds, last profile. Writes are atomic (temp file + rename). Everything profile-specific goes in that profile's SQLite database from phase 2.

### D-009 Fonts are bundled

Inter, Newsreader and JetBrains Mono ship inside the app through `@fontsource-variable/*`. No font is fetched from the network, which keeps the "only these network calls" rule intact.

### D-010 Reference videos stay out of git

`random-inspo/**` media files (videos and frame sheets) are ignored by git. They are recordings of other companies' products and the repo is public; the written notes (`NOTES.md`, `REFERENCES.md`) are committed instead.

### D-011 No GitHub remote yet

The repo is initialised locally and commits are made after each phase. Creating the public GitHub repository and pushing is left to the owner; `electron-builder` and the updater read the repo from `package.json` `repository` once it is set.

### D-012 Sidebar scope

The sidebar starts with the brief's list (Today, subjects, Exam builder, Timer, Library, Settings). Planner, Results, Studio and the assistant are added to the navigation in the phase that builds them, so nothing in the shell leads to a dead end.

## Phases 2 to 13 (working app pass)

### D-013 Built-in SQLite instead of better-sqlite3 and Drizzle

The database uses Node's built-in `node:sqlite` (shipped in Electron 45, with FTS5) through a small typed repository (`src/main/db/`), not `better-sqlite3` + Drizzle as the brief names. A native module would need rebuilding for every Electron version and architecture, and one Mac could not build both Apple silicon and Intel installers. The schema, versioned migrations, transactions and FTS5 search are the same; swapping the driver later only touches `src/main/db/database.ts`.

### D-014 PDF text is extracted in the interface

pdf.js runs in the renderer (where it is designed to run) for both viewing and text extraction; the extracted text is sent to the main process and stored. Imports are queued in the database, so a quit mid-import resumes on the next launch.

### D-015 AI adapters

- Subscription sign-ins run the provider's own CLI (`claude`, `codex`, `gemini`) in an empty temp folder with a minimal environment. Atlas never reads their credential files. The Claude path is verified live; the Codex and Gemini paths are written from their documented interfaces and not yet run against a real install.
- API keys use the official SDKs: `@anthropic-ai/sdk` for Anthropic (default model `claude-opus-5-5`, server-side refusal fallback on), and the `openai` SDK for OpenAI, OpenRouter, Google's OpenAI-compatible endpoint, Ollama and LM Studio.
- Keys are encrypted with Electron `safeStorage` in `userData/secrets.json`, per profile, and never returned to the interface.
- Profile passwords are hashed with scrypt (Node built-in) rather than argon2, to avoid a native module. The password gates the profile; it does not encrypt the database file.

### D-016 Generic, schema-checked data channels

Instead of one IPC channel per operation per table, `db:list/get/create/update/remove` take an entity name from a fixed list and validate values against that entity's zod schema. Table and column names never come from the interface.

### D-017 Look revised toward Apple and ChatGPT

At the owner's request the look moved away from the warm editorial paper: cool neutral greys (`#f5f5f7`), the system font (San Francisco on Mac, Segoe UI on Windows, Inter as the bundled fallback) for both body and headings, a plain grey pill for the selected sidebar item, and Apple blue for focus. Ink stays the accent. The token names are unchanged, so a fuller redesign from the owner's reference screenshots only needs new values.

### D-018 More helpers, school calendar, exam layout

- **Helpers:** 26 assistants grouped by purpose, with subject-specific ones (English, Maths, Science, Accounting, Languages) shown first inside a matching subject.
- **School calendar:** read-only sync from an iCal subscription link (Compass and other portals), hourly, with events matched to subjects by name or code. The link is kept in the keychain. Times with a named time zone are read as this computer's local time.
- **Exam layout:** practice papers follow the layout of a current written examination, measured from a 2025 paper the owner supplied: the cover (label box, grouped student-number boxes, a colour band in the subject's colour, contents lines), a running header with page numbers, left-aligned section headings with instructions and a rule, parts with marks in a right-hand column, 8.5 mm answer lines, and a "Do not write in this area" strip that swaps sides on left and right pages (drawn with CSS page-margin boxes). Only the layout is copied: no examining body's name, logo or official wording appears, and the cover says it is an AI-written practice paper. Maths subjects get blank working space instead of lines; essay subjects get more lines.

### D-019 Redesign: white, grey sidebar, black buttons, blue for selection

The owner asked for a look closer to their earlier app (the Operon screenshot kept locally as `random-inspo/references/06-operon-exam-viewer.webp`) and to Apple, ChatGPT, Codex and Claude. This replaces the warm editorial register and the all-pill controls (D-001, D-017):

- **Colour:** white content, a `#f7f7f8` sidebar with a hairline edge, zinc greys, solid black primary buttons, and one blue for selection, links, focus, the active tool and tags.
- **Type and shape:** system font at 14 px, semibold headings; 8 px controls, 12 px cards, 16 px dialogs. The brief's 10/14/20 radii and pill buttons are retired; pills remain only for count badges.
- **Shell:** the sidebar has the app and study system at the top, search, the main places, subjects, a quieter group of study tools, and the study buddy with the next-exam countdown at the bottom. The top bar shows the page name, AI status with a dot, search, the timer, an Ask button and the profile.
- **Today:** opens with an ask box and one-tap helpers (ChatGPT-style), then today's progress, the next exam and shortcuts.
- A reply in progress now keeps its text in the main process, so a chat opened from another screen mid-reply shows what has streamed so far.

### D-020 Exam system modelled on the owner's earlier exam viewer

The owner's brief asks for an exam home, a three-pane paper workspace (questions, the paper, an inspector) and an exam-conditions mode, for every subject. The reference screenshots and code it names (`reference/operon-exam/`, `EXAM_SYSTEM_PROMPT.md`) were not on this computer, so the layout follows the written brief and `random-inspo/references/06-operon-exam-viewer.webp`.

- **Papers** are their own table. Exam files in the library become papers automatically, paired with their examiner report and solutions by file name; papers from before the current study design are grouped apart.
- **Questions** keep page-fraction boxes on the paper and on the report, multiple-choice state percentages, command terms, parts with mark tables, and the report's comments on common mistakes.
- **Question boxes do not block text selection.** The PDF pane reports pointer positions as page fractions and the workspace hit-tests them, so the text layer stays selectable underneath.
- **Solutions stay hidden** behind a blurred cover until revealed; a reveal is remembered.
- **Answers per subject:** maths shows a LaTeX preview, accounting a ledger grid with running totals, English a word count and time.
- **Three ways to check an answer:** an instant check with no AI (command term, length against marks, key words from the solution), ticking the report's marking points, or marking by the connected AI ("Score: n/max").
- **Exam mode** runs outside the app frame, with reading time that locks answers, warnings, autosave and resume.
- Small UI state (open panes, revealed answers, drafts, notes) lives in the settings table, not in new tables.

### D-021 In-app updates from GitHub releases

The owner wants a banner when a new version is published, with one button that installs it, and a copy of everyone's data made first.

- **Source:** the "latest" published release of `ArmanKundu/atlas`. Drafts are ignored, so a version reaches people only when the owner clicks Publish on the draft that CI makes.
- **When:** 15 seconds after launch, then every 6 hours, in packaged builds only. The request carries no personal data.
- **Look:** a slim bar under the top bar ("Atlas 0.2.0 is ready. What's new · Later · Update now"). Later hides it until the next version.
- **Before installing:** every profile is copied to `Documents/Atlas Backups/Atlas-before-v<version>-<time>/` (the open database through SQLite, others as folders, without the rolling backups), and the open profile also gets a `pre-update` snapshot. Data lives in the user-data folder, which installs never touch, so this copy is a second safety net.
- **Checked download:** the installer's SHA-512 must match the release's `latest.yml` / `latest-mac.yml`.
- **Mac:** builds are ad-hoc signed, which Electron's built-in Squirrel updater rejects. The new `Atlas.app` is unzipped and a small script swaps it in after Atlas quits, then reopens it; on failure the old app is put back. When Atlas runs from the disk image or a folder it cannot write to, the bar shows Download instead.
- **Windows:** the NSIS installer runs silently over the current install and starts Atlas again.

### D-022 Shared library on Supabase

The owner wants a small, invite-only library where about ten friends share and remix notes and resources, with the most features and storage on a free plan.

- **Host:** one free Supabase project ("Atlas Library", Sydney). It covers sign-in, Postgres with full-text search, file storage and row-level security. Google Drive offers more space but none of these features. Schema, rules and storage live in `supabase/library.sql`.
- **Exception to local-first:** this is the only feature that goes online, and only after the person signs in on the Shared screen. Nothing from their profile leaves the laptop unless they press Share on it.
- **Who gets in:** an email-and-password account, then a library code. The code is stored hashed, and `join_library` checks it. Without membership, row-level security returns nothing. Email confirmation is off, because Supabase's free email only reaches team members.
- **Session:** the sign-in session is stored encrypted with the OS keychain (`safeStorage`), next to the AI keys. All calls run in the main process; the renderer's CSP allows no outside requests.
- **Limits:** on the free plan, files can be up to 50 MB each, with 1 GB of storage in total. A file shared by several people is stored once (by SHA-256). Anything bigger is shared as a link. A meter shows space used.
- **Remix:** a note becomes your own note, with credit at the bottom. A file goes into your Library. A deck becomes flashcards in the matching subject. "Share my version" posts a remix linked to the original.
- **Look:** cards by default, with a list view (the owner asked for both), and a preview panel on the right. The screen sits under Library in the sidebar as "Shared".

### D-023 Built-in AI model and phone scanner

The owner wants AI that works on weak laptops with no account or limits, and a way to scan paper work from a phone.

- **Built-in model:** `node-llama-cpp` runs a GGUF model in the main process. Two choices: Qwen3 1.7B (Q4_K_M, about 1 GB, 4 GB RAM) and Qwen3 4B Instruct 2507 (Q4_K_M, about 2.3 GB, 8 GB RAM). Models download once from Hugging Face into the user data folder; nothing else goes online. It is a normal provider (`atlas-local`), so every AI feature can use it, and it gets the same context (notes, resources) as other providers. Thinking is discouraged so short answers stay fast.
- **Phone scanner:** a one-time link on the home network, shown as a QR code. Atlas serves a small page from a local HTTP server that accepts only private-network addresses, needs a random token and closes after 30 minutes or when the dialog closes. No relay server and no app to install.
- **Camera:** phones only allow a live camera on https pages, and a self-signed certificate would show a scary warning. So the page uses the phone's own camera (flash and flip work there) and adds live auto-capture only where the browser allows it.
- **Files:** the library reads PDFs, so pages become one multi-page PDF, or in photos mode one single-page PDF each. They are filed as class notes in the chosen subject.

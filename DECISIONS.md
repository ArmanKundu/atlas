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
- **Exam layout:** practice papers follow the layout conventions of an official written examination (cover with student-number boxes and a structure table, section instructions, answer lines sized by marks, a "Do not write in this area" strip). They carry no examining body's name or branding and are labelled as AI-written practice papers.

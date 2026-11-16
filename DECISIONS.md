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

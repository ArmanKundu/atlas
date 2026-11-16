# Atlas

An open-source, local-first AI study assistant for any subject. Everything stays on your laptop, and AI runs on your own plan: Claude, ChatGPT, Gemini, a local model, or your own API key.

> Screenshots: run `npm run build && node scripts/screenshots.mjs` to generate them into `docs/screenshots/`.

## What it does today

- **Profiles.** Each person gets their own profile, database and AI connection, with an optional password.
- **Subjects.** Add anything you study. Each subject has its own workspace: overview, library, notes, flashcards and a tutor.
- **Library.** Import your own PDFs, text and Markdown files (or whole folders). Files are copied onto your laptop, de-duplicated, sorted by type and made searchable. A viewer opens any of them with find and zoom.
- **Assistant.** Eleven helpers (Tutor, Step-by-step solver, Examiner, Marker, Working checker, Notes maker, Flashcard maker, Quizmaster, Syllabus checker, Planner, Feynman coach). Chats are saved so you can read back through them, and answers cite pages from your own library.
- **Notes** in Markdown with maths, **flashcards** with spaced repetition, a **focus timer** with stats and a yearly heatmap, a **week planner** with a to-do list, and an **exam builder** that writes a practice paper plus solutions and saves both as PDFs.
- **Backups.** A daily backup of each profile (14 kept), restore from any of them, and "Export everything".
- **Works without AI.** Everything except the assistant, AI summaries and the exam builder works with no AI connected.

## Privacy

No account, no server, no telemetry. Your subjects, files and results stay on your laptop. The only network calls Atlas makes are to the AI provider you connect. API keys are stored in your computer's keychain. Subscription sign-ins go through the provider's own app, and Atlas never sees your password or tokens.

No subject content, textbooks, exams or personal data ever go in this repo. Each user adds their own inside the app.

## Install (for friends)

Download the latest installer from the [Releases](../../releases) page.

**Mac.** Open the `.dmg` (choose `arm64` for Apple silicon, `x64` for Intel) and drag Atlas to Applications. Atlas is not code-signed yet, so the first time: right-click the app, choose **Open**, then **Open** again. If macOS says the app is damaged, run this once in Terminal:

```bash
xattr -cr /Applications/Atlas.app
```

**Windows.** Run the `.exe`. On the blue SmartScreen window click **More info**, then **Run anyway**.

Installing a newer version over an old one keeps all your data: it lives in your user data folder, never in the app folder.

## Connect AI

Open **Settings → AI** (or the "Connect AI" step during setup) and pick one:

| Option                     | What you need                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| Claude (Pro or Max plan)   | The official Claude Code app: `npm install -g @anthropic-ai/claude-code`, then **Sign in** |
| ChatGPT (Plus or Pro plan) | The official Codex CLI: `npm install -g @openai/codex`, then **Sign in**                   |
| Gemini (Google account)    | The official Gemini CLI: `npm install -g @google/gemini-cli`, then **Sign in**             |
| Your own API key           | A key from Anthropic, OpenAI, Google AI or OpenRouter                                      |
| A local model              | [Ollama](https://ollama.com) or [LM Studio](https://lmstudio.ai) running on your computer  |

Press **Test** to check it, then **Use this**.

## Development

Needs Node 22.12 or newer.

```bash
npm install
```

```bash
npm run dev
```

| Command                                | What it does                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run check`                        | Lint, typecheck and unit tests. Run before every commit.                                                        |
| `npm run e2e`                          | Builds the app and runs the end-to-end tests against it.                                                        |
| `npm run dist:mac`                     | Builds the Mac installers (Apple silicon and Intel) into `release/`.                                            |
| `npm run dist:win`                     | Builds the Windows installer into `release/` (run on Windows, or let CI do it).                                 |
| `npm run release`                      | Bumps the version and pushes a tag. GitHub Actions then builds Mac and Windows installers and drafts a release. |
| `node scripts/ai-smoke.mjs <provider>` | Sends one real request through a provider in the built app. Uses a little of your own plan.                     |

See `CONTRIBUTING.md` for how the code is organised, `DECISIONS.md` for the choices made so far, `KNOWN_ISSUES.md` for what is not built yet, `SECURITY.md` for the security model and `PLUGINS.md` for the planned plugin format.

## Code signing (later)

Installers carry only an ad-hoc signature for now (no Apple or Microsoft certificate). To sign them, add these secrets to the GitHub repository and remove `identity: '-'` from `electron-builder.yml`:

- **Mac:** `CSC_LINK` (base64 of a Developer ID Application `.p12`), `CSC_KEY_PASSWORD`, and for notarisation `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
- **Windows:** `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` for a code-signing certificate.

## Folders

| Folder            | What goes in it                                                                    |
| ----------------- | ---------------------------------------------------------------------------------- |
| `src/main/`       | Main process: database, profiles, backups, library, AI providers, IPC handlers     |
| `src/preload/`    | The one bridge exposed to the interface                                            |
| `src/renderer/`   | The React interface: shell, routes, design system, features                        |
| `src/shared/`     | Types, zod schemas and constants used by both sides                                |
| `tests/`          | Unit tests (Vitest), end-to-end tests (Playwright) and fixtures we wrote ourselves |
| `BUILD_PROMPT.md` | The full build brief                                                               |
| `random-inspo/`   | Design notes (`NOTES.md`). Reference media stays local and is not committed        |
| `build/`          | App icon files used by the installers                                              |

## Licence

MIT. See `LICENSE`.

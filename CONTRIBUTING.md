# Contributing to Atlas

Thanks for helping. Atlas is a local-first study app: everything a student adds stays on their laptop. Contributions are welcome as long as they keep that promise.

## Getting started

You need Node 22.12 or newer.

```bash
npm install
npm run dev
```

`npm run dev` starts the app with hot reload. Other commands:

| Command                                 | What it does                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run check`                         | Lint, typecheck and unit tests. Must pass with no warnings before every commit.    |
| `npm run e2e`                           | Builds the app and runs the end-to-end tests against it (Playwright for Electron). |
| `npm run format`                        | Formats the code with Prettier.                                                    |
| `npm run build`                         | Builds the app into `out/`.                                                        |
| `npm run dist:mac` / `npm run dist:win` | Builds an installer into `release/`.                                               |

## Hard rules

These come from the build brief and are not negotiable in a pull request:

1. **Local-first.** No backend, telemetry or analytics. The only network calls allowed are: the AI provider the user connected, the update check, the optional public library index (read-only GET), and the school calendar sync if the user turns it on. All of them happen in the main process.
2. **AI sign-in goes through the provider's official CLI or SDK.** Atlas never reads, copies, logs, stores or sends a provider's tokens or session files, and never shows its own login screen for a provider.
3. **Secrets live only in the operating system keychain** (Electron `safeStorage`). Never in SQLite, logs, exports or packs.
4. **No content in the repo.** No subject content, textbooks, exam papers or personal data, in code, tests, fixtures, issues or screenshots. Test fixtures are documents we wrote ourselves.
5. **No data loss.** Every write is transactional; migrations and updates are preceded by a backup.
6. **Works without AI.** Every non-AI feature must work with no provider connected. AI controls hide or explain what they need.

## How the code is organised

```
src/main/        main process: database, files, AI jobs, secrets, IPC handlers
src/preload/     the one bridge exposed to the renderer
src/renderer/    React UI: shell, routes, design system, features
src/shared/      types, zod schemas and constants used by both sides
tests/unit/      Vitest
tests/e2e/       Playwright for Electron
```

- The renderer is sandboxed. It has no Node or Electron access and talks to the main process only through `window.atlas` (see `src/shared/ipc.ts`).
- To add a channel: add its name to `src/shared/ipc-channels.ts`, its request and response schemas to `src/shared/ipc.ts`, and a handler under `src/main/ipc/handlers/`. The compiler tells you if one of the three is missing.
- TypeScript is strict. No `any` in shared types. Validate with zod at every IPC and AI boundary.

## Design

Read `random-inspo/NOTES.md` and the D-001 entry in `DECISIONS.md` before changing UI. In short: Inter for the working app, neutral greys with ink as the only accent, pill controls, soft shadows only on floating things. The editorial style (warm paper, serif headings) is only for onboarding, welcome and empty states, and the weekly review. Open the command palette and run "Open the design system" to see every token and component.

Every list needs an empty state with one clear action, a skeleton loader and an error state with Retry. Everything must work with the keyboard, in light and dark, and with "reduce motion" on.

## Writing

Interface text is short and human. Errors say what happened and what to do next, with no exclamation marks. Estimates (entrance ranks, study scores, grades) are always labelled as estimates.

## Pull requests

- Keep each pull request to one change.
- Add a test for new behaviour: a unit test for logic, an end-to-end test for a user flow.
- Record any notable choice in `DECISIONS.md`.
- Fill in the checklist in the pull request template.

By contributing you agree that your work is released under the MIT licence.

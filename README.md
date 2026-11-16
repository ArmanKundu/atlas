# Atlas

An open-source, local-first AI study assistant for any subject. Everything stays on your laptop, and AI runs on your own plan (Claude, ChatGPT, Gemini, a local model, or your own API key).

## Start here (building it)

1. Put this whole folder somewhere permanent (e.g. `~/Projects/Atlas`).
2. Drop any UI/UX inspiration into `random-inspo/`: screenshots, screen recordings, links in a `.txt`. Five reference videos are already in `random-inspo/references/`.
3. Your icon is already in `build/` (`icon.png`, `icon.icns`, `icon.ico`). Replace them any time with the same names.
4. Open a terminal in this folder and run `claude` (Claude Code), then say:

   > Read BUILD_PROMPT.md and build Atlas, following it phase by phase. Start by reviewing everything in random-inspo/.

5. When it's done: `npm install`, then `npm run dev` to run it, and `npm run release` to build the Mac/Windows installers.

## Development

Needs Node 22.12 or newer.

```bash
npm install
npm run dev
```

- `npm run check`: lint, typecheck and unit tests (run before every commit).
- `npm run e2e`: builds the app and runs the end-to-end tests against it.
- `npm run dist:mac` / `npm run dist:win`: build an installer into `release/`.

See `CONTRIBUTING.md` for how the code is organised, `DECISIONS.md` for the choices made so far, and `SECURITY.md` for the security model.

## Folders

| Folder                     | What goes in it                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `BUILD_PROMPT.md`          | The full build brief for Claude Code                                                              |
| `CLAUDE.md`                | Short rules Claude Code reads every session                                                       |
| `build/`                   | App icon files used by the installers                                                             |
| `random-inspo/`            | Your design inspiration (any files). Claude Code reads it and writes `random-inspo/NOTES.md`      |
| `random-inspo/references/` | The reference patterns already chosen (toolbars, editorial style, code input, calendar, composer) |
| `docs/`                    | Notes, decisions and screenshots as the project grows                                             |

## Privacy

No subject content, textbooks, exams or personal data ever go in this repo. Each user adds their own inside the app, and it stays on their laptop.

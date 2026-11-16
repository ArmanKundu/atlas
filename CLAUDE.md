# Atlas: rules for Claude Code

- The full spec is `BUILD_PROMPT.md`. Follow it, phase by phase; record choices in `DECISIONS.md`.
- Before any UI work, review `random-inspo/` (including `references/`) and keep `random-inspo/NOTES.md` up to date. You can view images, not videos: use the `*-frames.jpg` sheets, or extract frames with ffmpeg if it is installed.
- Local-first: no backend, no telemetry. Never read, store or log AI provider tokens; sign-ins go through each provider's official CLI/SDK.
- Never commit subject content, textbooks, exams or personal data.
- Keep the app runnable after every step; run `npm run check` (lint + typecheck + tests) before each commit.
- App icon lives in `build/`; the mascot is based on it.

# Known issues and what is not built yet

Atlas follows the 25-phase plan in `BUILD_PROMPT.md`. This lists where it stands, honestly.

## Working

Phases 1 to 4, 6, and the core of 8 to 13: scaffold and security, database and profiles, onboarding, library import with search and a viewer, AI providers and routing, notes, flashcards, timer and stats, Today, the assistant with grounded sources, and the exam builder with PDF export.

## Built differently from the brief

- **Database:** Node's built-in SQLite instead of `better-sqlite3` + Drizzle (`DECISIONS.md` D-013).
- **Passwords:** scrypt instead of argon2. The password gates the profile; it does not encrypt the database file on disk.
- **PDF text** is extracted in the interface with pdf.js, not in the main process (D-014).
- **Claude subscription** uses the Claude Code CLI rather than the Agent SDK's `query()`. The assistant therefore cannot yet take actions (create flashcards, start the timer) through in-process tools.

## Not verified

- **ChatGPT (Codex CLI) and Gemini CLI adapters** are written from their documented interfaces but have not been run against a real install. Their flags live in `src/main/ai/adapters/<id>/cli.ts`.
- **API-key providers and local models** (Anthropic, OpenAI, Google, OpenRouter, Ollama, LM Studio) compile and are wired end to end, but have not been run with a real key or server.
- **Windows** has not been run at all. The installer is built by CI only.
- **Installers are unsigned**, so macOS and Windows show a warning on first open (see the README).

## Added after the first release

- **26 assistant helpers**, grouped, with subject-specific ones for English, Maths, Science, Accounting and Languages.
- **School calendar sync** from an iCal subscription link (Compass and other portals). Level 1 only: timetable and events. Tasks, results, feedback and the newsfeed (the read-only adapter) are not built. Times with a named time zone are read as this computer's local time.
- **Exam paper layout** matched to a 2025 written examination (cover, running headers, alternating edge strip, marks column, answer lines). Not yet done: per-subject variants beyond lines versus working space (for example an English task book with a separate script book, or Accounting answer tables), "Question N continues on the next page" notes, and formula or data sheets.
- **Look** moved toward Apple and ChatGPT (neutral greys, system font). A full redesign from the owner's reference screenshots is still to come.

## Wanted next (from the owner)

- **Paper viewer like the Operon screenshot:** question regions drawn on the PDF, a right-hand inspector with Overview, Practice and More, the solution and examiner report hidden until you try, annotation tools (highlight, pen, underline, comment), and marking your own paper. This needs the question bank (stage B ingestion or the manual question editor) first.
- **Downloaded past papers** for Chemistry, English, Mathematical Methods and Specialist Mathematics are in `~/Downloads/Atlas-exams/` (outside this repo, never committed). Accounting papers could not be listed from the archive. Import the folder through Library to use them.

## Not built yet

- **Ingestion stage B:** AI extraction of topic trees from study designs, questions from exams, answers from solutions and examiner reports, and tagging. Questions, answers, attempts and mistakes have tables but no screens.
- **Manual question editor** (draw a box on a page, set marks, link a solution).
- **Practice mode, self-marking, the mistakes log and mastery.**
- **OCR for scanned PDFs** (`tesseract.js`) and `.docx` import (`mammoth`). A scanned PDF imports and opens, but its text is not searchable.
- **Study-next ranking** on Today (it shows progress, countdowns and shortcuts, not a ranked list).
- **Subject-kind specifics** (essay workspace, CAS check, data book view, accounting tables).
- **Packs and the public library** (export, install, share on GitHub).
- **Auto-update** (`electron-updater`). For now, install a newer release over the old one.
- **School portals:** Compass iCal sync, the read-only adapter and its mock.
- **Local MCP server.**
- **Notifications, tray timer, idle detection, exam mode, auto-plan** in the planner.
- **Annotations, paper submissions and AI marking overlays.**
- **Daily briefing, weekly review and assistant memory proposals** (the `memories` table is read by the assistant, but nothing writes to it yet).
- **Results and grade tracker, media studio, plugin system, focus mode, learning-science drills.**
- **Command palette search across content.** It runs commands and navigation; searching pages, notes and cards from it is not wired (the search itself works and is used by the assistant and the viewer).
- **Share-as-PNG, attachments in chat, per-chat provider picker, CSV export of sessions.**
- **Segmented PIN input** (reference 3). The profile uses a normal password field.

## Smaller things

- The timer keeps counting across reloads, but not after the app is fully quit.
- Chat history sent to the model is capped at the last 24 messages.
- Summarising a source sends at most the first 120,000 characters.
- The exam builder writes its own practice questions; it does not yet draw from imported past papers.

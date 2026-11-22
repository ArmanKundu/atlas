# Atlas roadmap

The build checklist. `[x]` done and tested, `[~]` working foundation (more to do), `[ ]` not started.
Phases follow `BUILD_PROMPT.md` §14; extra work the owner asked for is listed after them.

## Now

**Exam system (Operon clone), see the brief in the session notes.** Phase 5 and 8 work feeds straight into it.

## Phases

- [x] **1. Scaffold.** Electron, React, TypeScript, Tailwind, secure IPC, design tokens, shell, command palette, CI.
- [x] **2. Data.** SQLite, migrations, profiles (create, unlock, switch), backups, settings.
- [x] **3. Onboarding.** Steps 1–3 and 7–8, subject catalogue, study buddy.
- [x] **4. Library.** Import, text extraction, search, paper viewer.
- [x] **5. Manual question editor.** Draw a box around a question; number, marks and text read from it; solution and examiner comments; multi-page questions.
- [x] **6. AI providers.** Claude, ChatGPT and Gemini sign-ins through their own apps, API keys, local models, routing.
- [ ] **7. AI reading of papers (stage B).** Study design → topic tree; exam → questions; report → answers and mistakes; tagging; review queue.
- [~] **8. Practice.** Questions page, practice sessions (weakest first), self-marking, mistakes log. _Still to do: mastery per topic, spaced review of mistakes._
- [~] **9. Flashcards and notes.** Spaced repetition, Markdown notes with maths. _Still to do: formula sheet and data book view._
- [~] **10. Timer and stats.** Focus timer, streaks, study goal. _Still to do: menu-bar timer, hours-vs-results chart._
- [~] **11. Today.** Ask box, progress, next exam, shortcuts. _Still to do: "study next" ranking._
- [~] **12. Assistant.** 26 helpers, answers grounded in your files with sources. _Still to do: attachments, share as image, per-chat AI choice._
- [~] **13. Exam builder.** Practice papers in the official layout, PDF export, maths and chemistry notation. _Still to do: .tex export, CAS checks, drawing from your question bank, the owner's crash course._
- [ ] **14. Subject specifics.** Essay workspace (English), LaTeX answers and CAS check (Maths), data book (Chemistry), ledgers and statements (Accounting).
- [ ] **15. Packs.** Export and import subject packs; public library on GitHub.
- [~] **16. Updates and releases.** Tag-triggered Mac and Windows installers on GitHub, README. In-app update bar with a data copy first. _Still to do: signing._
- [~] **17. Compass.** Calendar sync from the iCal link. _Still to do: full Compass connection (below), local MCP server._
- [~] **18. Planner.** Calendar, to-dos, school events. _Still to do: notifications, exam mode in the planner, auto-plan._
- [ ] **19. Annotations and marking.** Annotate PDFs and notes; submit a written paper; auto-crop answers; AI marking overlay; paper history.
- [ ] **20. Assistant that acts.** Tools with approval (make flashcards, start a timer, plan a week), memory, daily briefing, weekly review.
- [ ] **21. Results.** Grade tracker with what-if.
- [ ] **22. Media studio.** Diagrams and images, then narrated videos with subtitles.
- [ ] **23. Plugins.** Manifest, permissions, install from GitHub, three examples.
- [ ] **24. Focus and learning science.** Focus mode, error-log replay, command-term drills, Feynman mode.
- [ ] **25. Polish.** Empty states, shortcuts, reduced motion, dark mode audit, full test pass.

## Exam system (Operon clone)

- [x] Papers table; each exam paired automatically with its report (official file names understood)
- [x] Question fields: report boxes, multiple choice with state percentages, command terms, type, report quotes, parts with mark tables
- [x] Annotations stored as page fractions, with undo and redo
- [x] Exam home: find a question (fuzzy and by reference, e.g. "2019 B4"), more practice, paper library with Report / Sit it / Open
- [x] Paper workspace: header, two-row PDF toolbar, pages with text selection, question boxes, thumbnails, find, zoom, split view
- [x] Question navigator: sections, topic / status / command filters, keyboard
- [x] Inspector: Overview (crop, chips, command terms, hidden solution), Practice (answer boxes, instant check, self-mark, mark with AI), More (similar questions)
- [x] Ask drawer on a question
- [~] Sit it: timed exam mode with reading time, autosave and resume, warnings, submit to marking
- [x] Keyboard: 1–4 views, [ ] questions, R reveal, A answer
- [~] Playwright tests for the brief's "done means" list (paper, boxes, keys, practice, deep link done; sit-it test still to add)
- [ ] Side-by-side comparison with Operon (needs the reference screenshots and code, not found on disk yet)

## Later (owner's requests)

- [ ] **Full Compass connection.** You follow in-app steps and sign in to Compass yourself; Atlas then reads your calendar, learning tasks, results, resources, lesson plans and the newsfeed. Your own AI subscription can then answer "what's due this week", sort grades and set reminders. Possibly also as an MCP server.
- [ ] **Study design answers.** Ask "is this in the Methods study design?" and get an answer from the official study design you imported, with the dot point quoted.
- [ ] **Exam formatting from the owner's crash course.**
- [ ] **Business readiness.** Signed installers, licence key or one-off purchase, privacy policy, website.

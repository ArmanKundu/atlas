# Atlas roadmap

The build checklist. `[x]` done and tested, `[~]` working foundation (more to do), `[ ]` not started.
Phases follow `BUILD_PROMPT.md` §14; extra work the owner asked for is listed after them.

## Now

**Group library for up to five friends (owner's plan, 23 Nov).** Atlas becomes one shared, public library for six subjects, with the exam system and AI on top. Done: scanner, whiteboard, subjects, shared library, in-app web links, packaged-app test. Next: shared VCAA exams (waiting on the owner's go-ahead to download), timetables in the Planner, subject tools.

## Group library (owner's plan, 23 Nov)

- [x] **Six subjects only:** English, Mathematical Methods, General Mathematics, Chemistry, Biology, Accounting. Each has Units 1, 2, 3 and 4.
- [x] **Public by default:** everything people add is shared with the group. Only grades, results and private settings stay on your laptop.
- [x] **Upload form:** title, short description, subject, units (1–4), type (PDF, PowerPoint, image, video, audio, notes, link, exam, timetable), and the teacher who made it.
- [~] **AI summary, on by default:** the uploader's own AI reads the file (handwriting too), writes a text version and a summary, and both are shared. Can be turned off per upload. _Done for PDF, PowerPoint, Word, notes, photos and scans. Not yet: video and audio transcription; not yet tried against a real AI end to end._
- [~] **Teachers:** tag who made a resource and filter by teacher; later the assistant and exam builder can prefer a teacher's material. _Tagging and filtering done; the assistant preference is still to do._
- [x] **Web links that open inside Atlas:** Google Drive, Docs, Slides and other sites in an in-app browser tab.
- [ ] **Shared exams in Supabase:** VCAA and other past papers stored once in the cloud for everyone, with their reports. The VCAA site is down, so papers may come from the Wayback Machine (needs the owner's go-ahead).
- [~] **Timetables:** a place to upload class and exam timetables, shared with the group, used later for "what's coming up". _Uploading as type Timetable works; reading it into the Planner is still to do._
- [x] **Phone scanner like Genius Scan:** automatic page edges and crop, straightened pages, page-by-page capture, filters, better design; scans can go straight to the shared library.
- [~] **Whiteboard for maths, chemistry and biology:** live "drafting" view while the AI works, accurate shapes (squares, right angles, labels outside lines), diagrams for each subject. _Shapes and the drafting view are done; not yet tried with a live AI stream._
- [x] **Test the packaged app,** not only the development build. _macOS Intel build tested (setup, PDF import and reading, scanner). Apple silicon and Windows builds are made but not run here._
- [ ] **Later: subject tools.** Graphing calculator (Maths), scientific calculator, data booklet and periodic table (Chemistry). The owner will send inspiration.

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
- [~] **15. Packs and sharing.** Shared library for your group (Supabase, invite code, share, remix). _Still to do: export and import subject packs; large files over 50 MB._
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

## Added on request

- [x] Account cap with an approved waitlist, admin screen
- [x] Bug reports and ideas with a screenshot or screen recording
- [x] Auto helper picker and grouped helpers
- [x] Whiteboard explainer with an on-device voice (Kokoro)
- [x] Atlas built-in AI (Qwen3 via node-llama-cpp)
- [x] Scan with your phone (QR, PDF or photos, Check my work)
- [ ] Scanner: mistakes found in a scan go straight into the review loop and study plan without asking in chat

## Later (owner's requests)

- [ ] **Full Compass connection.** You follow in-app steps and sign in to Compass yourself; Atlas then reads your calendar, learning tasks, results, resources, lesson plans and the newsfeed. Your own AI subscription can then answer "what's due this week", sort grades and set reminders. Possibly also as an MCP server.
- [ ] **Study design answers.** Ask "is this in the Methods study design?" and get an answer from the official study design you imported, with the dot point quoted.
- [ ] **Exam formatting from the owner's crash course.**
- [ ] **Business readiness.** Signed installers, licence key or one-off purchase, privacy policy, website.

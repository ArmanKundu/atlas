# Design inspiration notes

Reviewed 2026-11-16. Everything in `random-inspo/` so far is the five reference clips in `references/`
(viewed through their `*-frames.jpg` sheets) plus the app icon in `build/icon.png`.
Add a section here whenever a new file lands in this folder.

## What to take from each

### build/icon.png (brand source)

- **Colour:** soft black body `#1C1C1C` to `#262626` on light grey `#EBEBEB`. No hue at all. This sets the palette: neutral greys, ink as the accent.
- **Shape:** rounded spiky blob, about seven soft spikes, tips and valleys both rounded. Sits off-centre, cropped by the tile.
- **Eyes:** two large white circles, the right one slightly bigger and higher, dark pupils pushed up and to the right (a curious glance). The pupil is cut by the eye edge, never floating in the middle.
- **Use:** the mascot is this silhouette drawn as SVG. Default is black on light grey.

### 01-floating-pill-toolbars

- **Canvas:** flat light grey (`#EDEDEB` range). Toolbars float on it; no panels or chrome behind them.
- **Pills:** white, fully rounded for single-row bars (radius about half the height), larger rounded rectangles (radius ~14) for stacked vertical controls. Height about 36 to 40 px.
- **Shadow:** very soft and wide, low opacity, plus a hairline edge. Never a hard drop shadow.
- **Grouping:** related actions share one pill, separated by thin vertical dividers (1 px, light grey, inset top and bottom). Unrelated actions get their own pill with an 8 px gap.
- **Primary action:** a dark pill (`#262626`, white text) with a trailing icon ("Reply ↩"). One per cluster.
- **Icons:** 1.5 px stroke line icons, same weight as the label text. Label + icon pairs for AI actions ("Improve", "Explain"), icon-only for formatting.
- **Find bar:** text field, a quiet "2/7" counter, up / down / close.
- **Zoom:** a vertical pill with +, −, fit, split by horizontal dividers.
- **Hover:** a light grey rounded square behind the icon, inside the pill.
- **Type:** geometric sans at medium weight, dark grey rather than pure black.
- **Motion:** pills ease in with a small rise and fade.
- **Where:** PDF viewer, annotation layer, notes editor, text-selection menu.

### 02-editorial-paper-style

- **Paper:** warm off-white (`#F4F1EA` range) with soft natural light. Feels printed.
- **Type:** a classic serif at large sizes with tight leading for headlines; small monospace for labels, dates and bylines; serif body with thin rules between entries.
- **Layout:** generous margins, narrow text column, hairline rules, underlined nav words. Lots of empty paper.
- **Illustration:** fine engraved-style line art (waves, kelp, a pufferfish) in muted ink tones, used sparingly as a header or corner piece.
- **Accent:** one deep colour block (teal, ochre) as a rare highlight card, not as UI chrome.
- **Where:** onboarding, welcome and empty states, the weekly review, README/website. Not the working app.

### 03-segmented-code-input

- **Boxes:** two groups of three digits. Each group is one rounded box (radius ~14) with a light grey fill.
- **Digits:** large, heavy, tabular. Placeholder zeros in pale grey; the next digit to type is a shade darker.
- **Active:** the active group gets a 2 px light blue ring and a slightly lighter fill.
- **Layout:** centred column: small icon, bold title, two lines of grey help text, the code, then a quiet secondary link.
- **Where:** profile PIN/unlock and the "pair a device" code.

### 04-calendar-planner

- **Structure:** light grey sidebar, white content card, no heavy borders. Three columns: sidebar, to-do panel, week grid.
- **Sidebar:** workspace switcher at top, search field with a ⌘K hint, section labels in small grey text ("Essentials", "Projects"), items with a small icon and one selected row on a white rounded background. Collapsible sections with a "+" on hover.
- **Header:** small grey breadcrumb above a large page title. On the right: "Today", prev / next chevrons, and a black rounded "+" button.
- **To-do panel:** tabs ("To-do list" / "Events"), collapsible groups (This week, This month, Unscheduled, Personal) each with a "+", checkbox rows in small text.
- **Week grid:** day number with a small weekday label under it; the current day is underlined. All-day row, hour lines in very light grey, time labels in small grey caps.
- **Event cards:** soft grey rounded cards (radius ~10), small emoji/icon top left, bold-ish title, grey time, and a coloured progress strip along the bottom of some cards.
- **Density:** small type (12 to 13 px) with generous whitespace. Calm rather than cramped.
- **Where:** the Planner, and the sidebar pattern for the whole app shell.

### 05-composer-model-picker

- **Composer:** one rounded container (radius ~20). A placeholder line on top; a row of controls underneath.
- **Controls:** "+ Add files" (collapses to "+"), a mode dropdown pill, a model/effort picker with the provider mark, then mic and a round send arrow on the right.
- **Picker popover:** search field, an "Auto" toggle, a list of models with the provider icon, the effort in grey after the name, and a tick on the selected row. A second small popover sets the effort level.
- **Hover:** controls expand to show their label ("Record").
- **Ours:** build the light-theme version: white container, soft shadow, grey control pills, dark send button. The mode pill maps to Ask modes; the model picker maps to connected providers.
- **Where:** the Ask tab and the assistant panel.

### 06-operon-exam-viewer (added 2026-11-16, the owner's own earlier app)

This is the look the owner wants for Atlas, together with "Apple, ChatGPT, Codex, Claude".

- **Frame:** white app on a very light grey sidebar. Hairline dividers, almost no shadows.
- **Sidebar:** app icon with name and a small subtitle; a search field with a ⌘K hint; primary items with outline icons at about 15 px; the selected item is a light grey rounded rectangle; count badges as small grey pills; a divider; a second group in lighter grey; at the bottom the mascot with its name and a line under it, an exam countdown ("0 days to go · Mon, 2 Nov"), then Shortcuts and Settings.
- **Top bar:** page name with a quiet sub-label on the left; on the right small status items with a coloured dot ("Claude", "Synced"), text buttons ("Full screen", "Talk", "Ask") and the mascot avatar.
- **Controls:** rounded rectangles (about 8 px), not pills. Primary is solid black ("Answer it", "View"); secondary is white with a hairline border ("Ask about it"). A segmented switch sits in a light grey track with the active side white.
- **Accent:** blue for selection (the question box outline and tint, the active tool, links, the question tab) and for topic tags (blue tint). A green outlined pill for difficulty.
- **Type:** system-style sans, bold headings around 20 px, body around 15 px, secondary text in mid grey.
- **Paper viewer:** an Adobe-style two-row toolbar (page controls, find, zoom; then select, highlight, underline, comment, pen, undo/redo, delete, bookmark); the active tool in a blue-tinted square. The question is boxed in blue with a "Q1" tab. The right inspector has Overview / Practice / More tabs, the question cropped from the paper, "Answer it" and "Ask about it", and the solution blurred behind "Hidden so you can try it first" with a View button.

## The one direction (revised 2026-11-16)

**Clean white, grey sidebar, black buttons, blue for selection.** The warm editorial register below is retired at the owner's request; references 1 to 5 still apply for their patterns (toolbars, code input, calendar, composer), restyled to this look.

- **Colour:** white surfaces, `#f7f7f8` sidebar, zinc greys for text and lines, black primary buttons, one blue for selection, links, focus and tags.
- **Type:** the system font (San Francisco on Mac, Segoe UI on Windows), 14 px base, semibold headings.
- **Shape:** 8 px controls, 12 px cards, 16 px dialogs. Pills only for tags and badges.
- **Shadow:** only on popovers, dialogs and floating toolbars.

## The first direction (superseded)

**Quiet ink on soft grey.** One system, two registers that share the same tokens:

1. **Working register (the app).** Inter. Light grey canvas, white surfaces, hairline borders, soft rare shadows. Ink (near-black, from the icon) is the only accent: primary buttons, the selected state, the "+" button. Controls are pills. Subject colours appear only as dots and thin strips.
2. **Editorial register (moments).** The same ink and greys, warmed: paper background, Newsreader for headings, JetBrains Mono for small labels, hairline rules. Used only for onboarding, welcome/empty states and the weekly review.

Shared rules:

- **Colour:** neutral greys + ink. One focus colour (the light blue ring from reference 3). No gradients, no coloured chrome.
- **Type:** Inter for UI, Newsreader for editorial headings, JetBrains Mono for labels and code. Small UI type (13 px base).
- **Spacing:** 8-pt scale. Radius 10 (controls, cards), 14 (panels, code boxes), 20 (composer, dialogs), full (pills).
- **Shadow:** only on floating things (pills, popovers, dialogs).
- **Motion:** 150 to 220 ms ease-out, small rise + fade. No bounce except the mascot.
- **Dark theme:** the same system inverted: near-black canvas, dark grey surfaces, ink becomes off-white.

The decision is recorded in `DECISIONS.md` (D-001).

## VideoTutor (videotutor.io), studied 2026-11-23

Their site was down when tried (its settings API returned 500 and the credit service 503), so this
comes from their home screen and their two YouTube videos (frames and transcripts).

- **Home:** one big prompt card on a soft lilac-to-blue wash: "Welcome back! Let's keep going.",
  a rotating example question as placeholder, a tutor persona chip (Funny Pi: jokes; Professional Pi:
  patient), an **Exam Mode** switch (fast strategies and common traps), a mic for voice input, and
  a dashed **Upload your question** drop zone (JPG, PNG, PDF up to 20 MB). Below: daily challenge,
  streak, fun facts, recent learning. A second tab, "Learning studio", lists past lessons.
- **Lesson look:** a 16:9 board, one idea per scene. Maths scenes put the title on top, the working
  on the **left** (a line of plain text, then a coloured LaTeX line), and the **diagram on the right**
  (circle split into coloured quarters with labels, a triangle filled in yellow, the sliver shaded).
  Colours carry meaning: the same colour for a quantity in the working and in the diagram.
- **Rendering:** Manim-style (Computer Modern serif labels, smooth axes, graphs drawn on, dark or
  flat backgrounds) for maths and physics; flat illustrations (sun, Earth, a chloroplast, a lipid
  bilayer with labelled photosystems, arrows) for science. Level-aware: the same question drawn
  for Year 3 (cartoon tree, sun, water drop) or Year 12 (cell with labelled organelles).
- **Player:** previous scene / pause / next scene, voice-over per scene, captions. Follow-up
  questions make new videos. Several languages.
- **What Atlas does better:** the lesson is live, not a rendered video, so it starts playing as soon
  as the first scene is written and you can stop at any scene and ask "why?"; graphs, areas and
  intersections are computed by Atlas, not guessed by the AI; questions can come from your own
  exams, scans and library; lessons are shared with the group and voted on; it runs on your own AI
  with a free offline voice; and it exports an MP4.

## MathFlo (math-flo.com), studied 2026-11-23

Tried live with two questions ("middle term of (x + 1/x)^10" and a visual one, the area under
y = x² from 0 to 2 with thinner and thinner rectangles).

- **Home:** dark page, one prompt box, level chips (K–8, High School, SAT/AP, Undergrad), language
  chips, example questions. Credit balance pill top right (about $0.50 per lesson).
- **Start:** "The lesson has already begun." A glowing voice waveform and a progress line
  ("Reading your doubt… Planning your lesson… Drawing your first diagrams…"). The tutor talks
  straight away, so the wait never feels dead.
- **Lesson screen:** warm paper-textured board on the left; a dark right rail with **The Ledger**
  (numbered cards with a coloured left edge, one formula each in serif KaTeX, a small caption) and
  **The Dialogue** (a live transcript where maths words are coloured to match the board). LIVE and
  END pills top left; END asks "End the lesson?" with Keep going / End it.
- **Board:** Manim-like, drawn step by step: a title card, then axes, the curve with its label, the
  interval edges, the shaded area marked A, Δx = ½. Finished boards shrink into thumbnails at the
  bottom left like a filmstrip.
- **Voice only:** it talks and listens through the microphone and waits for spoken answers (no
  text box). Socratic: it keeps asking the student questions.
- **Weak spots seen:** about 6 minutes before the first real diagram, filled with questions; it
  re-asked things already answered; it said "Exactly" to a garbled "It's"; a ledger formula ran off
  its card; it took around 10 minutes and still had not drawn the rectangles. When told "just show
  me", it switched to narrating and went faster.
- **For Atlas:** keep our instant start and continuous board, and add the best parts: a tutor that
  speaks while the board is being prepared; a key-formulas rail beside the board; a coloured live
  transcript; a "just explain" vs "quiz me" switch; spoken back-and-forth as an option. Never let
  questions hold up the visuals.

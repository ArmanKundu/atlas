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

## The one direction

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

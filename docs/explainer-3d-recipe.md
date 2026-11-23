# 3D explainer recipe

A repeatable formula for Explainer lessons that use a 3D model. It is what the lesson prompt
teaches the AI, written out for people. Update it whenever a render audit finds a new mistake
(see "Lessons learned" at the bottom), so the same mistake is not made twice.

## The formula

1. **One question, one model.** Pick a concept whose picture is truly three-dimensional
   (solids, planes and lines, surfaces, molecules, cells, apparatus). Build one continuous model
   for the whole story instead of a new model per scene, so the camera can travel.
2. **Open wide, then go in.** Scene 1 sets the model with a far `camera` and a `shot` to the
   establishing view, so the lesson opens with a slow push-in.
3. **Everything else waits off stage.** Give parts ids and list the later ones in
   `model.hidden`. Bring them in with `show` exactly when the narrator mentions them.
4. **Direct the camera like a documentary.** Each idea gets its own `shot`: close on the part
   being explained, edge-on to reveal a right angle, high to show a whole system. Return wide
   for summaries.
5. **Show the process happening.** `move` an ion off an electrode, a point down a line; `flow`
   electrons along a wire; `show "id@t"` and `hide "id@t"` for sequences (water rising, discs
   stacking).
6. **Point with light, not words.** `glow` the part the narrator is talking about.
7. **Working on the left, colour-matched.** Each quantity keeps one colour in the working, the
   labels and the model. Use `clearText` to start fresh working without losing the model.
8. **Teach in this order:** hook question, build the idea visually, the key fact, the maths,
   the answer, a check question, the exam method with the common slip.

## Checklist before a lesson ships

- [ ] Every `show`, `hide`, `move`, `glow` id exists in the model (the lesson test checks this).
- [ ] Every shot frames its subject: nothing important cut off at the edges or hidden behind
      glass.
- [ ] Labels are 2 to 4 words and do not cover the part they describe or the working column.
- [ ] Narration and picture agree: the part the narrator names is on screen and glowing.
- [ ] Each scene's narration is 1 to 4 spoken sentences; nothing silent for long.
- [ ] Maths checked by hand (every number in the narration matches the working).
- [ ] One or two check questions, never in the first scene.
- [ ] Rendered and audited: frames pulled from every scene (see below).

## Rendering and auditing

```
npm run build
node scripts/render-lesson.mjs lesson.json out.mp4
ffmpeg -i out.mp4 -vf fps=1/4,scale=640:-1,tile=4x3 sheet-%02d.jpg
```

On an Intel Mac a render draws about 10 frames a second, so a 2.5 minute lesson takes about
8 minutes (narration first, then frames). Also check the narration level:
`ffmpeg -i out.mp4 -vn -af volumedetect -f null -` should show a mean near −23 dB.

Look at every contact sheet: framing, labels, overlaps, text legibility, colours on the theme,
lighting, and whether the narration matches what is on screen at that moment.

## Lessons learned

- Clearing the board (`clear: true`) also removes the 3D model. Use `clearText` to keep it.
- Long `show`/`hide` lists are capped at 80 ids; longer lists are dropped entirely.
- A hide at the same moment as a show cancels it; use `id@seconds` to sequence them.
- The renderer drives the camera from the lesson clock, so spins and glides are identical in
  the app and in the exported video.
- The voice model can take up to a minute to warm up before the first render.
- Write chemistry in labels with real sub- and superscripts (ZnSO₄, Zn²⁺, NO₃⁻), never
  "ZnSO4" or "Zn2+": labels are plain text, not LaTeX.
- To show a plane, keep the camera on the same side as the point and about 60 to 65° off the
  normal (check: camera · n̂ / |camera| ≈ 0.45). Near 0 the plane collapses to a sliver; near 1
  it fills the frame face-on and the point seems to sit on it; below 0 you see its back.
- Close-ups need room: a camera closer than about 5 units to a 1-unit part crops it and pushes
  neighbouring labels into the frame edge.
- Labels that cannot find a clear spot are now hidden (the part being talked about always
  wins), so a cluttered wide shot stays readable. Still keep labels to the parts that matter.
- A bare box reads as a placeholder. Give apparatus a face and a detail (a voltmeter gets a
  dial and needle).
- Electron launch in the render script needs first-run setup marked done, or every window
  shows the onboarding screen instead of the lesson.
- Faint glass (opacity 0.5 or less) no longer writes depth, so a cone or liquid inside a
  translucent can or beaker stays visible from every angle.
- Graph y-axis numbers with three or more digits used to be clipped at the left; the plot now
  makes room for its widest tick label.

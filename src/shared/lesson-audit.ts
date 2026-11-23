import { compileFormula, unknownDirectionIds, type Lesson, type LessonItem } from './lesson'
import { overlap, textWidth, type Box } from './label-layout'

/**
 * Looks over a finished lesson the way a careful teacher would before showing it: boxes on top of
 * each other, words that do not fit their box, things drawn off the board, formulas that cannot be
 * drawn. Each problem names the scene and the items so the AI can fix just those.
 * Measurements match the board: 1600 × 900, a 700 px diagram beside the working, 1280 px alone.
 */
export function auditLesson(lesson: Lesson): string[] {
  const issues: string[] = []
  let shown: { item: LessonItem; scene: number }[] = []
  let graph = false
  let split = false

  lesson.scenes.forEach((scene, i) => {
    const n = i + 1
    if (scene.clear || i === 0) {
      shown = []
      // Work out the layout for this stretch the way the board does.
      const stretch = lesson.scenes.slice(i)
      const end = stretch.findIndex((s, k) => k > 0 && s.clear)
      const part = end > 0 ? stretch.slice(0, end) : stretch
      split =
        part.some((s) => s.items.some((it) => it.t === 'text' || it.t === 'math')) &&
        part.some((s) => s.graph || s.items.some((it) => it.t !== 'text' && it.t !== 'math'))
    }
    if (scene.graph) graph = true
    for (const item of scene.items) {
      if (item.t === 'remove') shown = shown.filter((s) => s.item.id !== item.id)
      else if (item.t !== 'focus') shown.push({ item, scene: n })
      if (item.t === 'curve' && !compileFormula(item.fn))
        issues.push(
          `Scene ${n}: the curve "${item.fn}" cannot be drawn; write it as a plain formula in x.`,
        )
    }
    if (graph) return

    // Without a graph, diagram coordinates are a 0–100 square.
    const unit = (split ? 700 : 1280) / 100
    const boxes: { name: string; box: Box; scene: number }[] = []
    for (const { item, scene: from } of shown) {
      // Items from earlier scenes still count for overlaps, but are only reported once.
      if (item.t === 'box') {
        const box = {
          x: (item.at[0] - item.w / 2) * unit,
          y: (item.at[1] - item.h / 2) * unit,
          w: item.w * unit,
          h: item.h * unit,
        }
        const lines = Math.max(1, Math.floor((box.h - 16) / 32))
        if (textWidth(item.text, 26) > (box.w - 20) * lines)
          issues.push(
            `Scene ${from}: the words "${item.text}" do not fit their box; make the box wider or taller, or use fewer words.`,
          )
        boxes.push({ name: `box "${item.text}"`, box, scene: from })
      } else if (item.t === 'icon' || item.t === 'atom') {
        const s = item.size * unit
        boxes.push({
          name: item.t === 'icon' ? `icon "${item.label || item.name}"` : `atom ${item.symbol}`,
          box: { x: item.at[0] * unit - s / 2, y: item.at[1] * unit - s / 2, w: s, h: s },
          scene: from,
        })
      } else if (item.t === 'label' && item.text) {
        const w = textWidth(item.text, 28 * item.size)
        boxes.push({
          name: `label "${item.text}"`,
          box: { x: item.at[0] * unit - w / 2, y: item.at[1] * unit - 18, w, h: 36 },
          scene: from,
        })
      }
      const at = 'at' in item ? item.at : null
      if (at && (at[0] < -2 || at[0] > 102 || at[1] < -2 || at[1] > 102) && from === n)
        issues.push(
          `Scene ${n}: an item at (${at[0]}, ${at[1]}) is off the board; keep x and y between 0 and 100.`,
        )
    }
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const A = boxes[a]
        const B = boxes[b]
        if (!A || !B || (A.scene !== n && B.scene !== n)) continue
        const area = overlap(A.box, B.box)
        const smaller = Math.min(A.box.w * A.box.h, B.box.w * B.box.h)
        if (smaller > 0 && area / smaller > 0.08)
          issues.push(`Scene ${n}: ${A.name} overlaps ${B.name}; move them apart.`)
      }
    }
  })
  // 3D directions that name a part the model does not have silently do nothing.
  for (const miss of unknownDirectionIds(lesson))
    issues.push(`${miss.replace(/^scene/, 'Scene')} is not the id of any part in the 3D model`)
  return [...new Set(issues)].slice(0, 20)
}

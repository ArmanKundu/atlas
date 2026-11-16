/** SM-2 style spaced repetition. Grades: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type Grade = 1 | 2 | 3 | 4

export interface CardSchedule {
  ease: number
  /** Days until the next review. 0 means "again in this session". */
  interval: number
  reps: number
  lapses: number
  due: number
}

const DAY = 86_400_000
const MIN_EASE = 1.3
const AGAIN_DELAY = 10 * 60_000

export function reviewCard(
  card: Omit<CardSchedule, 'due'>,
  grade: Grade,
  now: number,
): CardSchedule {
  if (grade === 1) {
    return {
      ease: Math.max(MIN_EASE, card.ease - 0.2),
      interval: 0,
      reps: 0,
      lapses: card.lapses + 1,
      due: now + AGAIN_DELAY,
    }
  }
  const ease = Math.max(MIN_EASE, card.ease + (grade === 2 ? -0.15 : grade === 4 ? 0.15 : 0))
  let interval: number
  if (card.reps === 0) interval = grade === 4 ? 4 : 1
  else if (card.reps === 1) interval = grade === 2 ? 2 : grade === 4 ? 6 : 3
  else {
    const factor = grade === 2 ? 1.2 : grade === 4 ? ease * 1.3 : ease
    interval = Math.max(card.interval + 1, Math.round(card.interval * factor))
  }
  return { ease, interval, reps: card.reps + 1, lapses: card.lapses, due: now + interval * DAY }
}

/** Label for a review button, e.g. "10 min", "3 d", "2 mo". */
export function intervalLabel(card: Omit<CardSchedule, 'due'>, grade: Grade): string {
  const next = reviewCard(card, grade, 0)
  if (next.interval === 0) return '10 min'
  if (next.interval < 30) return `${next.interval} d`
  if (next.interval < 365) return `${Math.round(next.interval / 30)} mo`
  return `${(next.interval / 365).toFixed(1)} y`
}

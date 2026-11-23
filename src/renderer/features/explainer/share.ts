import type { Lesson } from '@shared/lesson'
import { call } from '@/lib/ipc'
import { unitsFor } from './names'

/**
 * Shares a finished lesson with the group, tagged by unit (or "extra" when it is beyond the
 * syllabus). Quietly does nothing when signed out or not in the group.
 */
export async function shareLesson(input: {
  lessonId: string
  lesson: Lesson
  prompt: string
  subject: string | null
  level: string | null
}): Promise<string | null> {
  const status = await call('shared:status')
  if (!status.signedIn || status.access !== 'approved') return null
  const spaces = await call('shared:spaces')
  const group = spaces.find((s) => s.isGroup) ?? spaces[0]
  if (!group) return null
  const units = unitsFor(input.level)
  const card = await call('shared:publish', {
    kind: 'lesson',
    lessonId: input.lessonId,
    spaceId: group.id,
    title: input.lesson.title.slice(0, 200) || 'Explainer',
    description: input.prompt.slice(0, 2000),
    subject: (input.subject ?? input.lesson.subject).slice(0, 80),
    units,
    tags: units.length ? ['explainer'] : ['explainer', 'extra'],
    material: 'lesson',
    aiSummary: false,
  })
  return card.id
}

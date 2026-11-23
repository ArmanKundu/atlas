import { Check } from 'lucide-react'
import { GROUP_SUBJECTS, groupSubjectFor, type GroupSubject } from '@shared/group-subjects'
import type { Subject } from '@shared/models'
import { SubjectDot } from '@/design/Form'
import { db, useAction, useLive } from '@/lib/api'
import { cn } from '@/lib/cn'

/**
 * Tick the subjects you take. Atlas only offers the group's six subjects, so shared resources
 * file into the same place for everyone. Unticking hides a subject and keeps its work.
 */
export function GroupSubjectPicker({ tone = 'surface' }: { tone?: 'surface' | 'paper' }) {
  const all = useLive(['subjects'], () => db.list('subjects', { orderBy: 'createdAt' }))
  const existing = (g: GroupSubject): Subject | undefined =>
    (all.data ?? []).find((s) => groupSubjectFor(s.name, s.code)?.key === g.key)

  const toggle = useAction(async (g: GroupSubject) => {
    const found = existing(g)
    if (!found) {
      await db.create('subjects', { name: g.name, code: g.code, kind: g.kind, colour: g.colour })
    } else {
      await db.update('subjects', found.id, { active: !found.active })
    }
  })

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {GROUP_SUBJECTS.map((g) => {
          const found = existing(g)
          const on = !!found?.active
          return (
            <button
              key={g.key}
              type="button"
              aria-pressed={on}
              disabled={toggle.pending || !all.data}
              onClick={() => void toggle.run(g)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left font-medium ring-1 transition-colors ring-inset',
                on
                  ? 'bg-surface text-ink shadow-pill ring-transparent'
                  : tone === 'paper'
                    ? 'text-paper-ink-2 ring-paper-rule hover:bg-surface'
                    : 'text-ink-2 ring-line hover:bg-hover',
              )}
            >
              <SubjectDot colour={found?.colour ?? g.colour} />
              <span className="min-w-0 flex-1 truncate">{g.name}</span>
              <span
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full',
                  on ? 'bg-ink text-surface' : 'ring-1 ring-line ring-inset',
                )}
              >
                {on ? <Check className="size-3" aria-hidden /> : null}
              </span>
            </button>
          )
        })}
      </div>
      {toggle.error ? (
        <p role="alert" className="mt-3 text-danger">
          {toggle.error}
        </p>
      ) : null}
    </div>
  )
}

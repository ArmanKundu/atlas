import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Paper, Question } from '@shared/models'
import { Button } from '@/design/Button'
import { Dialog } from '@/design/Dialog'
import { Field, Input } from '@/design/Form'
import { Segmented } from '@/design/Segmented'

type Scope = 'full' | 'section' | 'mini'

/** The sheet before sitting a paper: how much of it, reading time, the timer, or paper-only. */
export function SitSetup({
  paper,
  questions,
  onClose,
}: {
  paper: Paper
  questions: Question[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const sections = [
    ...new Set(questions.map((q) => q.section).filter((s): s is string => Boolean(s))),
  ].sort()
  const [scope, setScope] = useState<Scope>('full')
  const [section, setSection] = useState(sections[0] ?? '')
  const [reading, setReading] = useState(true)
  const [minutes, setMinutes] = useState(String(paper.minutes ?? 120))
  const [paperOnly, setPaperOnly] = useState(questions.length === 0)

  const start = (): void => {
    const params = new URLSearchParams({
      scope,
      minutes: String(Math.max(1, Number(minutes) || 1)),
      reading: reading ? String(paper.readingMinutes ?? 15) : '0',
      paperOnly: paperOnly ? '1' : '0',
    })
    if (scope === 'section' && section) params.set('section', section)
    onClose()
    void navigate(`/sit/${paper.id}?${params.toString()}`)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Sit ${paper.title}`}
      description="Exam conditions: the paper full screen, a timer, and your answers saved as you go."
      width={520}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={start}>
            Start
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1.5 font-medium text-ink">How much</p>
          <Segmented
            label="How much of the paper"
            value={scope}
            onChange={(next) => {
              setScope(next)
              const total = paper.minutes ?? 120
              setMinutes(
                String(next === 'full' ? total : next === 'section' ? Math.round(total * 0.6) : 20),
              )
            }}
            options={[
              { value: 'full', label: 'Full paper' },
              ...(sections.length > 1 ? [{ value: 'section' as const, label: 'One section' }] : []),
              ...(questions.length >= 6 ? [{ value: 'mini' as const, label: 'Mini mock' }] : []),
            ]}
          />
          {scope === 'section' ? (
            <div className="mt-2 flex gap-1.5">
              {sections.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === section ? 'primary' : 'secondary'}
                  onClick={() => setSection(s)}
                >
                  Section {s}
                </Button>
              ))}
            </div>
          ) : null}
          {scope === 'mini' ? (
            <p className="mt-1.5 text-ink-3">
              Six questions from this paper, weakest topics first.
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Writing time (minutes)">
            <Input
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
            />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2">
            <input
              type="checkbox"
              checked={reading}
              onChange={(e) => setReading(e.target.checked)}
              className="size-4 accent-[var(--atlas-blue)]"
            />
            <span className="text-ink">{paper.readingMinutes ?? 15} min reading time</span>
          </label>
        </div>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={paperOnly}
            onChange={(e) => setPaperOnly(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--atlas-blue)]"
          />
          <span>
            <span className="block text-ink">On paper, just a timer</span>
            <span className="text-ink-3">Write on a printed copy; Atlas only keeps time.</span>
          </span>
        </label>
        {questions.length === 0 ? (
          <p className="rounded-lg bg-sunken p-3 text-ink-2">
            No questions are marked on this paper yet, so answers can’t be typed in Atlas. Sit it on
            paper with the timer, then mark it against the report.
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}

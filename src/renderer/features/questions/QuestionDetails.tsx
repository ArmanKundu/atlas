import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Answer, Question } from '@shared/models'
import { Button } from '@/design/Button'
import { Field, Input, Select, Textarea } from '@/design/Form'
import { useToast } from '@/design/Toast'
import { db } from '@/lib/api'
import { useSubjects } from '@/lib/app-state'
import { saveAnswer } from './data'

const num = (value: string): number | null => {
  const n = Number(value)
  return value.trim() === '' || !Number.isFinite(n) ? null : n
}

/** Edit a question: its number, marks, subject, text, solution and examiner comments. */
export function QuestionDetails({
  question,
  answers,
  onDeleted,
}: {
  question: Question
  answers: Answer[]
  onDeleted?: () => void
}) {
  const toast = useToast()
  const subjects = useSubjects()
  const solution = answers.find((a) => a.kind === 'official_solution')
  const report = answers.find((a) => a.kind === 'examiner_report')
  const [draft, setDraft] = useState({
    number: question.number ?? '',
    label: question.label ?? '',
    marks: question.marks === null ? '' : String(question.marks),
    year: question.year === null ? '' : String(question.year),
    subjectId: question.subjectId,
    stemMd: question.stemMd,
    solution: solution?.contentMd ?? '',
    report: report?.contentMd ?? '',
  })
  const [saving, setSaving] = useState(false)
  const set = (key: keyof typeof draft) => (value: string) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await db.update('questions', question.id, {
        number: draft.number.trim() || null,
        label: draft.label.trim() || null,
        marks: num(draft.marks),
        year: num(draft.year),
        subjectId: draft.subjectId,
        stemMd: draft.stemMd.trim() || 'Question',
      })
      await saveAnswer(question.id, 'official_solution', solution, draft.solution)
      await saveAnswer(question.id, 'examiner_report', report, draft.report)
      toast({ title: 'Question saved' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="grid grid-cols-3 gap-2">
        <Field label="Number">
          <Input
            value={draft.number}
            onChange={(e) => set('number')(e.target.value)}
            placeholder="3a"
          />
        </Field>
        <Field label="Marks">
          <Input
            value={draft.marks}
            onChange={(e) => set('marks')(e.target.value)}
            inputMode="numeric"
            placeholder="4"
          />
        </Field>
        <Field label="Year">
          <Input
            value={draft.year}
            onChange={(e) => set('year')(e.target.value)}
            inputMode="numeric"
            placeholder="2024"
          />
        </Field>
      </div>
      <Field label="Subject">
        <Select value={draft.subjectId} onChange={(e) => set('subjectId')(e.target.value)}>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Title" hint="Optional, for example “Section B, Question 3”.">
        <Input value={draft.label} onChange={(e) => set('label')(e.target.value)} />
      </Field>
      <Field
        label="Question text"
        hint="Read from the box you drew. Used for search and the assistant."
      >
        <Textarea value={draft.stemMd} onChange={(e) => set('stemMd')(e.target.value)} />
      </Field>
      <Field label="Solution" hint="Hidden until you check your answer. Markdown and $maths$ work.">
        <Textarea value={draft.solution} onChange={(e) => set('solution')(e.target.value)} />
      </Field>
      <Field label="Examiner comments" hint="Optional: what the report said about this question.">
        <Textarea
          value={draft.report}
          onChange={(e) => set('report')(e.target.value)}
          className="min-h-16"
        />
      </Field>
      <div className="flex items-center justify-between pt-1">
        <Button
          type="button"
          variant="ghost"
          icon={<Trash2 className="size-4" />}
          onClick={() => {
            void db.remove('questions', question.id).then(() => {
              toast({ title: 'Question removed' })
              onDeleted?.()
            })
          }}
        >
          Remove
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          Save
        </Button>
      </div>
    </form>
  )
}

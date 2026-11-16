import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Plus, X } from 'lucide-react'
import { SUBJECT_COLOURS, STUDY_SYSTEMS, type StudySystem } from '@shared/models'
import { SYSTEM_PRESETS } from '@shared/presets'
import { Button } from '@/design/Button'
import { Field, Input, Select, SubjectDot } from '@/design/Form'
import { AiProviders } from '@/features/ai/AiProviders'
import { db, useAction } from '@/lib/api'
import { useAppState, useSubjects } from '@/lib/app-state'
import { cn } from '@/lib/cn'
import { Mascot } from '@/mascot/Mascot'
import {
  MASCOT_ACCESSORIES,
  MASCOT_COLOURS,
  MASCOT_COLOUR_IDS,
  type MascotAccessory,
  type MascotColour,
} from '@/mascot/options'

const STEPS = [
  'Welcome',
  'About you',
  'Subjects',
  'Connect AI',
  'Goals',
  'Your mascot',
  'Ready',
] as const

function Heading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children?: React.ReactNode
}) {
  return (
    <header className="mb-7">
      <p className="eyebrow text-paper-ink-2">{eyebrow}</p>
      <h1 className="mt-2 text-[1.75rem] leading-9 font-semibold tracking-[-0.025em] text-balance">
        {title}
      </h1>
      {children ? (
        <p className="mt-3 max-w-[56ch] text-[0.9375rem] leading-6 text-paper-ink-2">{children}</p>
      ) : null}
    </header>
  )
}

function SubjectsStep({ system }: { system: StudySystem }) {
  const subjects = useSubjects()
  const [custom, setCustom] = useState('')
  const preset = SYSTEM_PRESETS[system]
  const taken = new Set(subjects.map((s) => s.name.toLowerCase()))

  const add = useAction(
    async (
      name: string,
      kind: (typeof preset.subjects)[number]['kind'] = 'other',
      code?: string,
    ) => {
      if (!name.trim() || taken.has(name.trim().toLowerCase())) return
      await db.create('subjects', {
        name: name.trim(),
        kind,
        code: code ?? null,
        colour: SUBJECT_COLOURS[subjects.length % SUBJECT_COLOURS.length],
      })
    },
  )

  return (
    <div>
      <div className="mb-5 flex min-h-10 flex-wrap gap-2">
        {subjects.length === 0 ? (
          <p className="text-paper-ink-2">
            Nothing added yet. Pick from the suggestions or type your own.
          </p>
        ) : null}
        {subjects.map((subject) => (
          <span
            key={subject.id}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-surface pr-1 pl-3 font-medium text-ink shadow-pill"
          >
            <SubjectDot colour={subject.colour} />
            {subject.name}
            <button
              type="button"
              aria-label={`Remove ${subject.name}`}
              onClick={() => void db.remove('subjects', subject.id)}
              className="flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-hover hover:text-ink"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
      </div>

      <form
        className="mb-6 flex max-w-md gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void add.run(custom).then(() => setCustom(''))
        }}
      >
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Type any subject name"
          aria-label="Subject name"
          maxLength={120}
        />
        <Button
          type="submit"
          disabled={!custom.trim()}
          icon={<Plus className="size-3.5" aria-hidden />}
        >
          Add
        </Button>
      </form>

      {preset.subjects.length > 0 ? (
        <>
          <p className="eyebrow mb-2 text-paper-ink-2">Suggestions for {preset.label}</p>
          <div className="flex flex-wrap gap-2">
            {preset.subjects
              .filter((s) => !taken.has(s.name.toLowerCase()))
              .map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => void add.run(s.name, s.kind, s.code)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-paper-ink ring-1 ring-paper-rule ring-inset hover:bg-surface"
                >
                  <Plus className="size-3.5 text-paper-ink-2" aria-hidden />
                  {s.name}
                </button>
              ))}
          </div>
        </>
      ) : null}
      {add.error ? (
        <p role="alert" className="mt-3 text-danger">
          {add.error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * First-run setup. Each step saves as it goes, so quitting midway resumes on the same step.
 * Importing resources happens in the Library afterwards; the last step links there.
 */
export function Onboarding() {
  const { meta, updateMeta } = useAppState()
  const [step, setStep] = useState(Math.min(meta?.onboardingStep ?? 0, STEPS.length - 1))
  const save = useAction(updateMeta)
  if (!meta) return null

  const go = (next: number): void => {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, next))
    setStep(clamped)
    void save.run({ onboardingStep: clamped })
  }
  const preset = SYSTEM_PRESETS[meta.studySystem]
  const goals = meta.studyGoals

  return (
    <div className="flex h-full bg-paper text-paper-ink">
      <nav
        aria-label="Setup steps"
        className="app-drag flex w-[232px] shrink-0 flex-col border-r border-paper-rule px-6 pt-16 pb-8"
      >
        <ol className="app-no-drag flex flex-col gap-1">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                disabled={index > step}
                aria-current={index === step ? 'step' : undefined}
                onClick={() => go(index)}
                className={cn(
                  'flex h-8 w-full items-center gap-3 rounded-md px-2 text-left',
                  index === step ? 'font-semibold text-paper-ink' : 'text-paper-ink-2',
                  index < step && 'hover:bg-hover',
                )}
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-2xs',
                    index < step
                      ? 'bg-accent text-accent-fg'
                      : index === step
                        ? 'ring-1 ring-paper-ink ring-inset'
                        : 'ring-1 ring-paper-rule ring-inset',
                  )}
                >
                  {index < step ? <Check className="size-3" aria-hidden /> : index + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
        <div className="mt-auto">
          <Mascot
            size={64}
            colour={meta.avatarColour as MascotColour}
            accessory={meta.avatarAccessory as MascotAccessory}
            mood={step === STEPS.length - 1 ? 'celebrating' : 'idle'}
          />
        </div>
      </nav>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="app-drag h-12 shrink-0" />
        <div className="min-h-0 flex-1 overflow-y-auto px-14 pb-8">
          <div className="mx-auto max-w-[860px]">
            {step === 0 ? (
              <Heading eyebrow={`Hello, ${meta.name}`} title="Let’s set up your study space">
                A few quick questions so Atlas fits what you study. You can skip anything and change
                it all later in Settings. Nothing you enter leaves this computer.
              </Heading>
            ) : null}

            {step === 1 ? (
              <>
                <Heading eyebrow="About you" title="What are you studying towards?">
                  This only sets the wording Atlas uses (for example {preset.assessment}) and the
                  subject suggestions. No content is shipped with any system.
                </Heading>
                <div className="grid max-w-xl grid-cols-2 gap-4">
                  <Field label="Study system" className="col-span-2">
                    <Select
                      value={meta.studySystem}
                      onChange={(e) =>
                        void save.run({ studySystem: e.target.value as StudySystem })
                      }
                    >
                      {STUDY_SYSTEMS.map((id) => (
                        <option key={id} value={id}>
                          {SYSTEM_PRESETS[id].label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Year level">
                    <Input
                      list="year-levels"
                      defaultValue={meta.yearLevel ?? ''}
                      onBlur={(e) => void save.run({ yearLevel: e.target.value.trim() || null })}
                      placeholder={preset.yearLevels.at(-1) ?? 'e.g. Year 12'}
                    />
                    <datalist id="year-levels">
                      {preset.yearLevels.map((level) => (
                        <option key={level} value={level} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Exam year">
                    <Input
                      type="number"
                      min={2020}
                      max={2100}
                      defaultValue={meta.examYear ?? ''}
                      onBlur={(e) =>
                        void save.run({ examYear: e.target.value ? Number(e.target.value) : null })
                      }
                      placeholder={String(new Date().getFullYear())}
                    />
                  </Field>
                  <Field label="School (optional)" className="col-span-2">
                    <Input
                      defaultValue={meta.school ?? ''}
                      maxLength={120}
                      onBlur={(e) => void save.run({ school: e.target.value.trim() || null })}
                    />
                  </Field>
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Heading eyebrow="Subjects" title="Which subjects are you taking?">
                  Add as many as you like. Each one gets its own workspace for resources, notes,
                  flashcards and questions.
                </Heading>
                <SubjectsStep system={meta.studySystem} />
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Heading eyebrow="Connect AI" title="Bring your own AI">
                  Optional. Connect one or more, then choose which one Atlas uses. Skip this to use
                  Atlas without AI.
                </Heading>
                <div className="rounded-xl bg-canvas p-5 text-ink">
                  <AiProviders />
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <Heading eyebrow="Goals" title="What are you aiming for?">
                  Goals steer what Atlas suggests you study next. Any score or rank Atlas shows from
                  them is an estimate, never a prediction.
                </Heading>
                <div className="grid max-w-xl grid-cols-2 gap-4">
                  {preset.overall ? (
                    <Field
                      label={`Target ${preset.overall}`}
                      className="col-span-2"
                      hint="Optional"
                    >
                      <Input
                        defaultValue={goals.targetOverall}
                        maxLength={40}
                        placeholder={preset.overallHint}
                        onBlur={(e) =>
                          void save.run({
                            studyGoals: { ...goals, targetOverall: e.target.value.trim() },
                          })
                        }
                      />
                    </Field>
                  ) : null}
                  <Field label="Study goal per day" hint="Minutes">
                    <Input
                      type="number"
                      min={0}
                      max={960}
                      step={15}
                      defaultValue={goals.dailyMinutes}
                      onBlur={(e) =>
                        void save.run({
                          studyGoals: {
                            ...goals,
                            dailyMinutes: Math.max(0, Math.min(960, Number(e.target.value) || 0)),
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Focus session length" hint="Minutes">
                    <Input
                      type="number"
                      min={5}
                      max={180}
                      step={5}
                      defaultValue={goals.focusMinutes}
                      onBlur={(e) =>
                        void save.run({
                          studyGoals: {
                            ...goals,
                            focusMinutes: Math.max(5, Math.min(180, Number(e.target.value) || 25)),
                          },
                        })
                      }
                    />
                  </Field>
                </div>
              </>
            ) : null}

            {step === 5 ? (
              <>
                <Heading eyebrow="Your mascot" title="Pick a study companion">
                  It keeps you company in the timer, thinks while AI works and celebrates finished
                  sessions. It never gets in the way.
                </Heading>
                <div className="flex items-center gap-10">
                  <div className="flex size-48 shrink-0 items-center justify-center rounded-xl bg-surface shadow-pill">
                    <Mascot
                      size={148}
                      colour={meta.avatarColour as MascotColour}
                      accessory={meta.avatarAccessory as MascotAccessory}
                      label="Your mascot"
                    />
                  </div>
                  <div className="flex flex-col gap-5">
                    <div>
                      <p className="eyebrow mb-2 text-paper-ink-2">Colour</p>
                      <div className="flex gap-2.5">
                        {MASCOT_COLOUR_IDS.map((id) => (
                          <button
                            key={id}
                            type="button"
                            aria-label={MASCOT_COLOURS[id].label}
                            aria-pressed={meta.avatarColour === id}
                            onClick={() => void save.run({ avatarColour: id })}
                            className="size-8 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-paper aria-pressed:ring-paper-ink"
                            style={{ background: MASCOT_COLOURS[id].body }}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="eyebrow mb-2 text-paper-ink-2">Accessory</p>
                      <div className="flex gap-2">
                        {MASCOT_ACCESSORIES.map(({ id, label }) => (
                          <Button
                            key={id}
                            variant={meta.avatarAccessory === id ? 'primary' : 'secondary'}
                            onClick={() => void save.run({ avatarAccessory: id })}
                          >
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {step === 6 ? (
              <Heading eyebrow="Ready" title="Your study space is set up">
                Next, import your own resources in the Library: study designs, past exams,
                solutions, examiner reports, textbooks and notes. Atlas copies them onto this
                laptop, makes them searchable, and uses them to ground the AI’s answers.
              </Heading>
            ) : null}

            {save.error ? (
              <p role="alert" className="mt-4 text-danger">
                {save.error}
              </p>
            ) : null}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-paper-rule px-14 py-4">
          <Button
            variant="ghost"
            disabled={step === 0}
            onClick={() => go(step - 1)}
            icon={<ArrowLeft className="size-3.5" aria-hidden />}
          >
            Back
          </Button>
          <div className="flex items-center gap-2">
            {step > 0 && step < STEPS.length - 1 ? (
              <Button variant="ghost" onClick={() => go(step + 1)}>
                Skip
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button
                variant="primary"
                onClick={() => go(step + 1)}
                trailingIcon={<ArrowRight className="size-3.5" aria-hidden />}
              >
                {step === 0 ? 'Get started' : 'Next'}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={save.pending}
                onClick={() => void save.run({ onboardingDone: true })}
                trailingIcon={<ArrowRight className="size-3.5" aria-hidden />}
              >
                Open Atlas
              </Button>
            )}
          </div>
        </footer>
      </main>
    </div>
  )
}

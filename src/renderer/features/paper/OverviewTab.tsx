import { useState } from 'react'
import { Copy, Eye, EyeOff, FileSearch, Sparkles } from 'lucide-react'
import type { Answer, Paper, Question } from '@shared/models'
import { Button } from '@/design/Button'
import { Markdown } from '@/design/Markdown'
import { Segmented } from '@/design/Segmented'
import { useToast } from '@/design/Toast'
import { RegionImage } from '@/features/questions/RegionImage'
import { call } from '@/lib/ipc'
import { cn } from '@/lib/cn'
import { useSetting } from '@/lib/settings'
import { isMultipleChoice, questionContext, termsOf } from './data'
import { COMMAND_TERMS } from './terms'

/** A card the AI fills on request; the result is kept so it is only written once. */
function AiCard({
  title,
  settingKey,
  task,
  prompt,
  cta,
  empty,
}: {
  title: string
  settingKey: string
  task: 'explain_options' | 'model_answer' | 'sample'
  prompt: string
  cta: string
  empty?: string
}) {
  const [text, setText] = useSetting<string | null>(settingKey, null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const res = await call('ai:complete', { task, prompt })
      setText(res.text)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The AI could not answer.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="rounded-lg p-3 ring-1 ring-line ring-inset">
      <p className="mb-1.5 flex items-center gap-1.5 text-2xs font-semibold text-ink-2">
        <Sparkles className="size-3.5 text-blue" aria-hidden />
        {title}
      </p>
      {text ? (
        <Markdown>{text}</Markdown>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-ink-3">{empty ?? 'Not written yet.'}</p>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run()}>
            {busy ? 'Writing…' : cta}
          </Button>
        </div>
      )}
      {error ? <p className="mt-1.5 text-danger">{error}</p> : null}
    </div>
  )
}

function ReportPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-warn">
      ◆ Examiner report
    </span>
  )
}

/** The revealed solution: multiple choice or written, from the report, with AI extras. */
function Solution({
  paper,
  question,
  answers,
  onOpenReport,
}: {
  paper: Paper
  question: Question
  answers: Answer[]
  onOpenReport?: () => void
}) {
  const [reportView, setReportView] = useState<'image' | 'text'>('image')
  const ctx = questionContext(question, paper, answers)
  const solution = answers.find((a) => a.kind === 'official_solution')
  const report = answers.find((a) => a.kind === 'examiner_report')
  const hasReportCrop = Boolean(paper.reportSourceId && question.reportRegions.length)

  return (
    <div className="flex flex-col gap-4">
      {hasReportCrop ? (
        <div>
          <Segmented
            label="Report view"
            value={reportView}
            onChange={setReportView}
            options={[
              { value: 'image', label: 'Report image' },
              { value: 'text', label: 'Text' },
            ]}
          />
          {reportView === 'image' && paper.reportSourceId ? (
            <div className="mt-2 rounded-lg p-2 ring-1 ring-line ring-inset">
              <RegionImage
                sourceId={paper.reportSourceId}
                regions={question.reportRegions}
                width={400}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {isMultipleChoice(question) && question.mc.answer ? (
        <>
          <p className="text-[0.9375rem] text-ink">
            Answer: <span className="font-semibold">{question.mc.answer}</span>
          </p>
          {question.mc.pct ? (
            <div
              className="flex flex-col gap-1.5"
              aria-label="Share of students choosing each option"
            >
              {(question.mc.options ?? Object.keys(question.mc.pct)).map((o) => {
                const pct = question.mc.pct?.[o] ?? 0
                const right = o === question.mc.answer
                return (
                  <div key={o} className="flex items-center gap-2">
                    <span
                      className={cn('w-4 font-semibold', right ? 'text-success' : 'text-ink-2')}
                    >
                      {o}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-active">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          right ? 'bg-success' : 'bg-line-strong',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-2xs text-ink-3 tabular-nums">{pct}%</span>
                  </div>
                )
              })}
            </div>
          ) : null}
          {question.mc.comment ? (
            <div>
              <ReportPill />
              <div className="mt-1.5 rounded-r-lg border-l-[3px] border-warn bg-sunken p-3 text-ink">
                {question.mc.comment}
              </div>
            </div>
          ) : null}
          <div className="rounded-lg bg-sunken p-3">
            <p className="font-medium text-ink">Confused by the other options?</p>
            <p className="mb-2 text-ink-3">Get why each one is right or wrong.</p>
            <AiCard
              title="Every option explained"
              settingKey={`ai.options.${question.id}`}
              task="explain_options"
              prompt={ctx}
              cta="Explain every option"
            />
          </div>
        </>
      ) : (
        <>
          {question.parts.length
            ? question.parts.map((part) => (
                <div key={part.part} className="flex flex-col gap-2">
                  <p className="font-semibold text-ink">
                    Question {question.number}
                    {part.part}
                  </p>
                  {part.stats ? (
                    <table className="w-full overflow-hidden rounded-md text-center text-2xs tabular-nums ring-1 ring-line">
                      <thead>
                        <tr className="bg-blue text-white">
                          <th className="px-2 py-1 text-left font-semibold">Marks</th>
                          {part.stats.labels.map((l) => (
                            <th key={l} className="px-2 py-1 font-semibold">
                              {l}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-2 py-1 text-left text-ink-2">%</td>
                          {part.stats.pct.map((p, i) => (
                            <td key={i} className="px-2 py-1 text-ink">
                              {p}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  ) : null}
                  {part.text ? <Markdown>{part.text}</Markdown> : null}
                </div>
              ))
            : null}
          {solution ? (
            <div>
              <p className="mb-1 text-2xs font-semibold text-ink-3">Marking notes</p>
              <Markdown>{solution.contentMd}</Markdown>
            </div>
          ) : null}
          {!solution && !question.parts.some((p) => p.text) ? (
            <p className="rounded-lg bg-sunken p-3 text-ink-2">
              No marking notes stored for this question. Add them with the pencil above, or draw its
              box in the report.
            </p>
          ) : null}
          {onOpenReport ? (
            <button
              type="button"
              onClick={onOpenReport}
              className="flex items-center gap-1 self-start text-2xs font-medium text-blue hover:underline"
            >
              <FileSearch className="size-3.5" aria-hidden />
              Open the full report
            </button>
          ) : null}
          <div className="rounded-lg p-3 ring-1 ring-line ring-inset">
            <p className="mb-1.5 flex items-center justify-between text-2xs font-semibold text-ink-2">
              Full-mark sample response <span className="font-normal text-ink-3">AI-written</span>
            </p>
            {question.sampleMd ? (
              <Markdown>{question.sampleMd}</Markdown>
            ) : (
              <AiCard
                title="Sample response"
                settingKey={`ai.sample.${question.id}`}
                task="sample"
                prompt={ctx}
                cta="Write a full-mark sample"
                empty="There’s no stored sample for this question yet. Atlas can write one that hits every marking point."
              />
            )}
          </div>
        </>
      )}
      {report ? (
        <div>
          <ReportPill />
          <div className="mt-1.5 rounded-r-lg border-l-[3px] border-warn bg-sunken p-3">
            <Markdown>{report.contentMd}</Markdown>
          </div>
        </div>
      ) : null}
      <AiCard
        title="AI model answer"
        settingKey={`ai.model.${question.id}`}
        task="model_answer"
        prompt={ctx}
        cta="Write a model answer"
      />
      {question.reportMistakes.length ? (
        <div>
          <p className="mb-1 text-[0.9375rem] font-semibold text-ink">Common mistakes</p>
          <p className="mb-2 text-2xs text-ink-3">
            ◆ Examiner report — sentences quoted from the report
          </p>
          <ul className="flex flex-col gap-1.5">
            {question.reportMistakes.map((m, i) => (
              <li key={i} className="flex gap-2 text-ink">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-warn text-[0.625rem] font-bold text-white">
                  !
                </span>
                {m}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/** Overview: the crop from the paper, command terms, extracted text, and the hidden solution. */
export function OverviewTab({
  paper,
  question,
  answers,
  revealed,
  onReveal,
  onHide,
  onAnswer,
  onAsk,
  onOpenReport,
}: {
  paper: Paper
  question: Question
  answers: Answer[]
  revealed: boolean
  onReveal: () => void
  onHide: () => void
  onAnswer: () => void
  onAsk: () => void
  onOpenReport?: () => void
}) {
  const toast = useToast()
  const terms = termsOf(question)
  const official = paper.grp !== 'mine'
  const latex = question.parts
    .map((p) => p.latex)
    .filter(Boolean)
    .join('\n\n')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-2xs">
        <span className="flex items-center gap-1.5 font-medium text-ink-2">
          <span
            className={cn('size-2 rounded-[2px]', official ? 'bg-blue' : 'bg-warn')}
            aria-hidden
          />
          {official ? 'Official VCAA' : 'Your upload'}
        </span>
        {question.regions.length ? (
          <span className="text-ink-3">cropped from the original paper</span>
        ) : null}
      </div>
      {question.regions.length ? (
        <div className="overflow-hidden rounded-xl bg-white p-2 ring-1 ring-line">
          <RegionImage sourceId={paper.paperSourceId} regions={question.regions} width={400} />
        </div>
      ) : null}
      {terms.length ? (
        <div className="rounded-lg bg-sunken p-3">
          {terms.map((t) => (
            <p key={t} className="text-ink">
              <span className="font-semibold">{t}:</span> {COMMAND_TERMS[t] ?? ''}
            </p>
          ))}
        </div>
      ) : null}
      <details className="group">
        <summary className="cursor-pointer text-ink-2 select-none hover:text-ink">
          Extracted text (selectable)
        </summary>
        <div className="mt-2 rounded-lg p-3 whitespace-pre-wrap text-ink select-text ring-1 ring-line ring-inset">
          {question.stemMd}
        </div>
        {latex ? (
          <div className="mt-2">
            <Markdown>{latex}</Markdown>
            <Button
              size="sm"
              variant="ghost"
              icon={<Copy className="size-3.5" />}
              onClick={() =>
                void navigator.clipboard
                  .writeText(latex)
                  .then(() => toast({ title: 'LaTeX copied' }))
              }
            >
              Copy LaTeX
            </Button>
          </div>
        ) : null}
      </details>
      <div className="flex gap-2">
        <Button variant="primary" onClick={onAnswer}>
          Answer it
        </Button>
        <Button variant="secondary" icon={<Sparkles className="size-4" />} onClick={onAsk}>
          Ask about it
        </Button>
      </div>

      <section className="mt-2 border-t border-line pt-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-[1.0625rem] font-semibold text-ink">Solution</h3>
          <span className="flex items-center gap-2 text-2xs text-ink-3">
            {paper.reportSourceId ? 'from the VCAA examiner report' : 'from your notes'}
            {revealed ? (
              <button
                type="button"
                onClick={onHide}
                className="flex items-center gap-1 text-blue hover:underline"
              >
                <EyeOff className="size-3" aria-hidden /> Hide again
              </button>
            ) : null}
          </span>
        </div>
        <div className="relative">
          <div
            className={cn(
              !revealed && 'pointer-events-none max-h-72 overflow-hidden blur-[7px] select-none',
            )}
            aria-hidden={!revealed}
          >
            <Solution
              paper={paper}
              question={question}
              answers={answers}
              onOpenReport={onOpenReport}
            />
          </div>
          {revealed ? null : (
            <div className="absolute inset-x-0 top-6 mx-auto flex w-[88%] items-center justify-between gap-3 rounded-xl bg-surface/95 p-4 shadow-pop ring-1 ring-line">
              <div>
                <p className="font-semibold text-ink">
                  {isMultipleChoice(question)
                    ? 'Answer and examiner report'
                    : 'Suggested answer and marking notes'}
                </p>
                <p className="text-ink-3">Hidden so you can try it first.</p>
              </div>
              <Button variant="primary" icon={<Eye className="size-4" />} onClick={onReveal}>
                View
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

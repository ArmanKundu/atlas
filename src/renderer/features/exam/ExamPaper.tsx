import { useMemo } from 'react'
import { answerSpace, parseExam, type ExamChunk } from '@shared/exam-format'
import { Markdown } from '@/design/Markdown'

export interface ExamPaperProps {
  title: string
  bodyMd: string
  subjectName: string
  /** Subject kind: decides lines (sciences, essays) or blank working space (maths). */
  kind: string
  minutes: number
  /** Subject colour name, used for the band down the cover. */
  colour?: string
  /** A solutions booklet has a cover but no answer space. */
  solutions?: boolean
}

const STRIP = '#3b3838'

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return (
    [h ? `${h} hour${h === 1 ? '' : 's'}` : '', m ? `${m} minutes` : '']
      .filter(Boolean)
      .join(' ') || '0 minutes'
  )
}

function AnswerSpace({ marks, kind }: { marks: number; kind: string }) {
  const space = answerSpace(marks, kind)
  if (space.count === 0) return null
  if (space.type === 'blank')
    return <div className="exam-blank" style={{ height: `${space.count * 8.5}mm` }} aria-hidden />
  return (
    <div className="exam-lines" aria-hidden>
      {Array.from({ length: space.count }, (_, i) => (
        <div key={i} className="exam-line" />
      ))}
    </div>
  )
}

function Part({ chunk, kind }: { chunk: ExamChunk; kind: string }) {
  if (!chunk.label && chunk.marks === 0)
    return chunk.markdown ? <Markdown>{chunk.markdown}</Markdown> : null
  return (
    <div className={chunk.label ? 'exam-part' : 'exam-part exam-part-plain'}>
      {chunk.label ? <div className="exam-part-label">{chunk.label}</div> : null}
      <div className="exam-part-main">
        <div className="exam-part-row">
          <div className="exam-part-text">
            {chunk.markdown ? <Markdown>{chunk.markdown}</Markdown> : null}
          </div>
          <div className="exam-part-marks">
            {chunk.marks > 0 ? `${chunk.marks} mark${chunk.marks === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        <AnswerSpace marks={chunk.marks} kind={kind} />
      </div>
    </div>
  )
}

/** Page furniture for the PDF: running headers, page numbers and the strip, which swaps sides. */
function printCss(header: string): string {
  const text = JSON.stringify(header)
  const head =
    'font: 9pt Arial, Helvetica, sans-serif; color: #000; vertical-align: bottom; padding-bottom: 1.5mm; border-bottom: 0.3mm solid #000; margin-bottom: 4.2mm;'
  const strip = (side: 'left' | 'right'): string =>
    `background: ${STRIP}; color: #fff; font: 700 11.5pt Arial, Helvetica, sans-serif; text-align: center; margin-${side === 'right' ? 'left' : 'right'}: 12.4mm;`
  const fill = (side: 'left' | 'right'): string =>
    `content: ""; background: ${STRIP}; margin-${side === 'right' ? 'left' : 'right'}: 12.4mm;`
  return `@media print {
  @page { size: A4; margin: 19.5mm 12.4mm 15mm 29.6mm; }
  @page :left {
    margin: 19.5mm 29.6mm 15mm 12.4mm;
    @top-left { content: "Page " counter(page) " of " counter(pages); ${head} }
    @top-center { content: ""; ${head} }
    @top-right { content: ${text}; ${head} }
    @right-middle { content: "Do not write in this area."; writing-mode: vertical-rl; ${strip('right')} }
    @right-top { ${fill('right')} }
    @right-bottom { ${fill('right')} }
    @top-right-corner { ${fill('right')} }
    @bottom-right-corner { ${fill('right')} }
  }
  @page :right {
    margin: 19.5mm 12.4mm 15mm 29.6mm;
    @top-left { content: ${text}; ${head} }
    @top-center { content: ""; ${head} }
    @top-right { content: "Page " counter(page) " of " counter(pages); ${head} }
    @left-middle { content: "Do not write in this area."; writing-mode: sideways-lr; ${strip('left')} }
    @left-top { ${fill('left')} }
    @left-bottom { ${fill('left')} }
    @top-left-corner { ${fill('left')} }
    @bottom-left-corner { ${fill('left')} }
  }
  @page :first {
    margin: 0;
    @top-left { content: none; border: 0; }
    @top-center { content: none; border: 0; }
    @top-right { content: none; border: 0; }
    @left-middle { content: none; background: none; }
    @left-top { content: none; background: none; }
    @left-bottom { content: none; background: none; }
    @top-left-corner { content: none; background: none; }
    @bottom-left-corner { content: none; background: none; }
  }
}`
}

/**
 * A practice paper in the layout of a current written examination: a cover with the label box,
 * student-number boxes and a contents list; a running header with page numbers; left-aligned
 * section headings with instructions and a rule; parts with marks in a right-hand column and
 * ruled answer lines; and a "Do not write in this area" strip on the outer edge of every page.
 * It copies the layout only. It carries no examining body's name, logo or wording that would
 * make it look official, and says on the cover that it is an AI-written practice paper.
 */
export function ExamPaper({
  title,
  bodyMd,
  subjectName,
  kind,
  minutes,
  colour,
  solutions = false,
}: ExamPaperProps) {
  const exam = useMemo(() => parseExam(bodyMd), [bodyMd])
  const now = new Date()
  const subject = subjectName || title
  const header = `${now.getFullYear()} Practice ${subject}`
  const date = now.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  const sectionName = (full: string, index: number): string =>
    /^section\s+\w+/i.exec(full)?.[0] ?? `Section ${String.fromCharCode(65 + index)}`
  const sectionRest = (full: string): string => full.replace(/^section\s+\w+\s*[-–—:]?\s*/i, '')

  return (
    <article className="exam-paper">
      <style>{printCss(header)}</style>
      <div className="exam-band" aria-hidden>
        <span>Do not write in this area.</span>
      </div>

      <section className="exam-cover">
        <div
          className="exam-cover-band"
          style={{ background: colour ? `var(--atlas-subject-${colour})` : STRIP }}
          aria-hidden
        />
        <div className="exam-label-box">
          SUPERVISOR TO ATTACH
          <br />
          PROCESSING LABEL HERE
        </div>
        <div className="exam-number">
          <div className="exam-number-boxes" aria-hidden>
            {[2, 3, 3, 1].map((count, group) => (
              <span key={group}>
                {Array.from({ length: count }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
            ))}
          </div>
          <div className="exam-number-caption">
            <span>
              Write your <b>student number</b> in the boxes above.
            </span>
            <b>Letter</b>
          </div>
        </div>

        <div className="exam-cover-body">
          <h1>{subject}</h1>
          <p className="exam-book">
            {solutions ? 'Solutions and Marking Guide' : 'Question and Answer Book'}
          </p>
          <p className="exam-date">Practice Examination – {date}</p>
          <hr />
          {solutions ? (
            <p>
              Answers and marking points for the practice paper of the same name, one line per mark.
            </p>
          ) : (
            <>
              <ul>
                <li>
                  Reading time is <b>15 minutes</b>
                </li>
                <li>
                  Writing time is <b>{duration(minutes)}</b>
                </li>
              </ul>
              <h3>Approved materials</h3>
              <ul>
                <li>
                  {kind === 'essay' || kind === 'language'
                    ? 'An English and/or bilingual printed dictionary'
                    : kind === 'maths'
                      ? 'One scientific calculator, unless this is a technology-free paper'
                      : 'One scientific calculator'}
                </li>
              </ul>
              <h3>Materials supplied</h3>
              <ul>
                <li>Question and Answer Book</li>
              </ul>
              <h3>Instructions</h3>
              <ul>
                <li>Answer all questions in the spaces provided in this book.</li>
                <li>Write your responses in English.</li>
              </ul>
              <p>
                Students are <b>not</b> permitted to bring mobile phones and/or any unauthorised
                electronic devices into the examination room.
              </p>
              {exam.structured ? (
                <>
                  <hr />
                  <div className="exam-contents-head">
                    <b>Contents</b>
                    <span>marks</span>
                  </div>
                  {exam.sections.map((section, i) => (
                    <div key={i} className="exam-contents-row">
                      <span>
                        <b>{sectionName(section.title, i)}</b> ({section.questions.length} question
                        {section.questions.length === 1 ? '' : 's'})
                      </span>
                      <i />
                      <span>{section.marks}</span>
                    </div>
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
        <p className="exam-cover-foot">
          {title}. A practice paper written with AI in Atlas. Not an official examination.
        </p>
      </section>

      {exam.structured && !solutions ? (
        exam.sections.map((section, i) => (
          <section key={i} className="exam-section">
            <h2 className="exam-section-title">
              <b>{sectionName(section.title, i)}</b>
              {sectionRest(section.title) ? ` – ${sectionRest(section.title)}` : ''}
            </h2>
            <h3 className="exam-instructions-title">Instructions</h3>
            <div className="exam-instructions">
              {section.instructions.trim() ? (
                <Markdown>{section.instructions.trim()}</Markdown>
              ) : section.multipleChoice ? (
                <ul>
                  <li>
                    Answer <b>all</b> questions.
                  </li>
                  <li>
                    Choose the response that is <b>correct</b> or that <b>best answers</b> the
                    question.
                  </li>
                  <li>A correct answer scores 1; an incorrect answer scores 0.</li>
                  <li>
                    Marks will <b>not</b> be deducted for incorrect answers.
                  </li>
                  <li>
                    No marks will be given if more than one answer is completed for any question.
                  </li>
                </ul>
              ) : (
                <ul>
                  <li>
                    Answer <b>all</b> questions in the spaces provided.
                  </li>
                  <li>Write your responses in English.</li>
                  {kind === 'maths' || kind === 'science' || kind === 'accounting' ? (
                    <li>
                      Show all working in your answers to numerical questions; no marks will be
                      given for an incorrect answer unless it is accompanied by details of the
                      working.
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
            <hr className="exam-rule" />
            {section.questions.map((question, q) => (
              <div key={q} className="exam-question">
                <p className="exam-question-heading">
                  <b>{question.heading}</b>
                  {section.multipleChoice
                    ? null
                    : ` (${question.marks} mark${question.marks === 1 ? '' : 's'})`}
                </p>
                {question.chunks.map((chunk, c) => (
                  <Part key={c} chunk={chunk} kind={kind} />
                ))}
              </div>
            ))}
            <p className="exam-end">
              {i === exam.sections.length - 1
                ? 'End of Question and Answer Book'
                : `End of ${sectionName(section.title, i)}`}
            </p>
          </section>
        ))
      ) : (
        <section className="exam-section">
          <Markdown>{bodyMd.replace(/^#\s+.*$/m, '')}</Markdown>
        </section>
      )}
    </article>
  )
}

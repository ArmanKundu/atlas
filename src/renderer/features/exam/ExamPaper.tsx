import { useMemo } from 'react'
import { answerSpace, parseExam } from '@shared/exam-format'
import { Markdown } from '@/design/Markdown'

export interface ExamPaperProps {
  title: string
  bodyMd: string
  subjectName: string
  /** Subject kind: decides lines (sciences, essays) or blank working space (maths). */
  kind: string
  minutes: number
  /** A solutions booklet has no cover structure table and no answer space. */
  solutions?: boolean
}

function AnswerSpace({ marks, kind }: { marks: number; kind: string }) {
  const space = answerSpace(marks, kind)
  if (space.count === 0) return null
  if (space.type === 'blank')
    return <div className="exam-blank" style={{ height: `${space.count * 9}mm` }} aria-hidden />
  return (
    <div className="exam-lines" aria-hidden>
      {Array.from({ length: space.count }, (_, i) => (
        <div key={i} className="exam-line" />
      ))}
    </div>
  )
}

/**
 * A practice paper laid out like an official written examination: cover page with student
 * number boxes and a structure table, a page per section with instructions, questions with
 * answer space sized by marks, and a "Do not write in this area" strip down the edge.
 * It copies the layout conventions only: it carries no examining body's name or branding.
 */
export function ExamPaper({
  title,
  bodyMd,
  subjectName,
  kind,
  minutes,
  solutions = false,
}: ExamPaperProps) {
  const exam = useMemo(() => parseExam(bodyMd), [bodyMd])
  const year = new Date().getFullYear()

  return (
    <article className="exam-paper">
      <div className="exam-band" aria-hidden>
        <span>Do not write in this area.</span>
      </div>

      <section className="exam-cover">
        {solutions ? null : (
          <div className="exam-student">
            <div className="exam-student-label">STUDENT NUMBER</div>
            <div className="exam-student-boxes">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} />
              ))}
              <em>Letter</em>
              <span />
            </div>
          </div>
        )}
        <h1>{(subjectName || title).toUpperCase()}</h1>
        <p className="exam-kind">
          {solutions ? 'Solutions and marking guide' : 'Practice written examination'}
        </p>
        <p className="exam-meta">{year}</p>
        {solutions ? null : (
          <>
            <p className="exam-meta">Reading time: 15 minutes</p>
            <p className="exam-meta">Writing time: {minutes} minutes</p>
            <h2>QUESTION AND ANSWER BOOK</h2>
            {exam.structured ? (
              <>
                <p className="exam-table-title">Structure of book</p>
                <table className="exam-table">
                  <thead>
                    <tr>
                      <th>Section</th>
                      <th>Number of questions</th>
                      <th>Number of questions to be answered</th>
                      <th>Number of marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exam.sections.map((section, i) => (
                      <tr key={i}>
                        <td>
                          {section.title.replace(/^section\s+/i, '').split(/\s[-–—:]\s/)[0] ||
                            String.fromCharCode(65 + i)}
                        </td>
                        <td>{section.questions.length}</td>
                        <td>{section.questions.length}</td>
                        <td>{section.marks}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={3} className="exam-total">
                        Total
                      </td>
                      <td>{exam.totalMarks}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            ) : null}
            <ul className="exam-rules">
              <li>
                Students are permitted to bring into the examination room: pens, pencils,
                highlighters, erasers, sharpeners and rulers
                {kind === 'maths' || kind === 'science' || kind === 'accounting'
                  ? ', and one scientific calculator'
                  : ''}
                .
              </li>
              <li>
                Students are NOT permitted to bring into the examination room: blank sheets of paper
                and/or correction fluid/tape.
              </li>
            </ul>
            <p className="exam-rules-title">Instructions</p>
            <ul className="exam-rules">
              <li>
                Write your <strong>student number</strong> in the space provided above on this page.
              </li>
              <li>Answer all questions in the spaces provided in this book.</li>
              <li>All written responses must be in English.</li>
            </ul>
          </>
        )}
        <p className="exam-footnote">
          {title}. A practice paper written with AI in Atlas. It is not an official examination.
        </p>
      </section>

      {exam.structured && !solutions ? (
        exam.sections.map((section, i) => (
          <section key={i} className="exam-section">
            {section.title ? <h2 className="exam-section-title">{section.title}</h2> : null}
            <div className="exam-instructions">
              <p className="exam-instructions-title">
                Instructions for {section.title.split(/\s[-–—:]\s/)[0] || 'this section'}
              </p>
              {section.instructions.trim() ? (
                <Markdown>{section.instructions.trim()}</Markdown>
              ) : section.multipleChoice ? (
                <ul>
                  <li>
                    Answer <strong>all</strong> questions.
                  </li>
                  <li>
                    Choose the response that is <strong>correct</strong> or that{' '}
                    <strong>best answers</strong> the question.
                  </li>
                  <li>A correct answer scores 1; an incorrect answer scores 0.</li>
                  <li>
                    Marks will <strong>not</strong> be deducted for incorrect answers.
                  </li>
                </ul>
              ) : (
                <ul>
                  <li>
                    Answer <strong>all</strong> questions in the spaces provided.
                  </li>
                  <li>Write using blue or black pen.</li>
                  {kind === 'maths' ? (
                    <li>
                      In questions where more than one mark is available, appropriate working{' '}
                      <strong>must</strong> be shown.
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
            {section.questions.map((question, q) => (
              <div key={q} className="exam-question">
                <p className="exam-question-heading">
                  {question.heading}
                  {section.multipleChoice ? null : (
                    <span>
                      {' '}
                      ({question.marks} mark{question.marks === 1 ? '' : 's'})
                    </span>
                  )}
                </p>
                {question.chunks.map((chunk, c) => (
                  <div key={c} className="exam-chunk">
                    {chunk.markdown ? <Markdown>{chunk.markdown}</Markdown> : null}
                    <AnswerSpace marks={chunk.marks} kind={kind} />
                  </div>
                ))}
              </div>
            ))}
            <p className="exam-end">
              {i === exam.sections.length - 1
                ? 'END OF QUESTION AND ANSWER BOOK'
                : `End of ${section.title.split(/\s[-–—:]\s/)[0] || 'section'}`}
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

/**
 * Reads an exam written in Markdown with these conventions (the exam prompt asks for them):
 *   # Title
 *   ## Section A - Multiple-choice questions      (a section; text under it is its instructions)
 *   ### Question 3 (5 marks)                      (a question)
 *   **a.** Explain ... (2 marks)                  (a part; a line ending in marks gets answer space)
 */
export interface ExamChunk {
  /** Part label such as "a." or "ii.", when the chunk is a labelled part. */
  label: string | null
  markdown: string
  /** Marks this chunk is worth; answer space is sized from it. 0 means no answer space. */
  marks: number
}

export interface ExamQuestion {
  heading: string
  marks: number
  chunks: ExamChunk[]
}

export interface ExamSection {
  title: string
  multipleChoice: boolean
  instructions: string
  questions: ExamQuestion[]
  marks: number
}

export interface ParsedExam {
  title: string
  sections: ExamSection[]
  totalMarks: number
  /** False when the text does not follow the conventions; show it as plain Markdown instead. */
  structured: boolean
}

const PART_LABEL = /^\s*(?:\*\*)?\(?([a-h]|[ivx]{1,4})[.)](?:\*\*)?\s+/

/** Splits a part into its label ("a."), its text without the marks suffix, and its marks. */
function toChunk(text: string, marks: number): ExamChunk {
  let markdown = text.trim()
  const label = PART_LABEL.exec(markdown)
  if (label) markdown = markdown.slice(label[0].length)
  if (marks > 0) markdown = markdown.replace(MARKS_AT_END, '').trim()
  return { label: label ? `${label[1]}.` : null, markdown, marks }
}

const MARKS_AT_END = /\((\d+)\s*marks?\)\s*\**\s*$/i

export function parseExam(markdown: string): ParsedExam {
  const lines = markdown.replace(/\r/g, '').split('\n')
  let title = ''
  const sections: ExamSection[] = []
  let section: ExamSection | null = null
  let question: { heading: string; lines: string[] } | null = null

  const closeQuestion = (): void => {
    if (!question || !section) return
    const headingMarks = Number(MARKS_AT_END.exec(question.heading)?.[1] ?? 0)
    const chunks: ExamChunk[] = []
    let buffer: string[] = []
    for (const line of question.lines) {
      // A labelled part starts a new chunk, so the stem above it stands on its own.
      if (PART_LABEL.test(line) && buffer.join('').trim()) {
        chunks.push(toChunk(buffer.join('\n'), 0))
        buffer = []
      }
      buffer.push(line)
      const marks = MARKS_AT_END.exec(line.trim())
      if (marks && !section.multipleChoice) {
        chunks.push(toChunk(buffer.join('\n'), Number(marks[1])))
        buffer = []
      }
    }
    const rest = buffer.join('\n').trim()
    const partMarks = chunks.reduce((sum, c) => sum + c.marks, 0)
    if (rest)
      chunks.push(toChunk(rest, partMarks === 0 && !section.multipleChoice ? headingMarks : 0))
    else if (chunks.length === 0)
      chunks.push(toChunk('', section.multipleChoice ? 0 : headingMarks))
    const marks = partMarks || headingMarks || (section.multipleChoice ? 1 : 0)
    section.questions.push({
      heading: question.heading.replace(MARKS_AT_END, '').trim(),
      marks,
      chunks,
    })
    section.marks += marks
    question = null
  }

  for (const line of lines) {
    if (/^#\s+/.test(line) && !title) {
      title = line.replace(/^#\s+/, '').trim()
    } else if (/^##\s+/.test(line)) {
      closeQuestion()
      const name = line.replace(/^##\s+/, '').trim()
      section = {
        title: name,
        multipleChoice: /multiple/i.test(name),
        instructions: '',
        questions: [],
        marks: 0,
      }
      sections.push(section)
    } else if (/^###\s+/.test(line)) {
      closeQuestion()
      if (!section) {
        section = { title: '', multipleChoice: false, instructions: '', questions: [], marks: 0 }
        sections.push(section)
      }
      question = { heading: line.replace(/^###\s+/, '').trim(), lines: [] }
    } else if (question) {
      // Options and parts each start their own paragraph, as they do on a printed paper.
      const option = /^\s*\(?([A-E])[.)]\s+(.*)$/.exec(line)
      if (option) question.lines.push('', `**${option[1]}.**\u2003${option[2]}`, '')
      else if (/^\s*(\*\*)?\(?[a-h ivx]{1,4}[.)]/.test(line)) question.lines.push('', line)
      else question.lines.push(line)
    } else if (section) section.instructions += `${line}\n`
  }
  closeQuestion()

  const questionCount = sections.reduce((n, s) => n + s.questions.length, 0)
  return {
    title,
    sections,
    totalMarks: sections.reduce((n, s) => n + s.marks, 0),
    structured: questionCount > 0,
  }
}

/** How much writing room a response gets, by the kind of subject. */
export function answerSpace(
  marks: number,
  kind: string,
): { type: 'lines' | 'blank'; count: number } {
  if (marks <= 0) return { type: 'lines', count: 0 }
  // Measured from current papers: a short response gets its marks plus two lines.
  if (kind === 'maths') return { type: 'blank', count: Math.min(16, Math.max(4, marks * 2 + 2)) }
  if (kind === 'essay' || kind === 'language')
    return { type: 'lines', count: Math.min(60, Math.max(6, marks * 3)) }
  return { type: 'lines', count: Math.min(28, marks + 2) }
}

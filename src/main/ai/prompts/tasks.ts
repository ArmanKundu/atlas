import { HOUSE_RULES } from './agents'

export type CompleteTask =
  | 'flashcards'
  | 'summary'
  | 'exam'
  | 'plan'
  | 'quiz'
  | 'topics'
  | 'title'
  | 'explain_options'
  | 'model_answer'
  | 'sample'
  | 'mark'

/** System prompts for one-shot jobs. Each states the exact output format the app parses. */
export const TASK_PROMPTS: Record<CompleteTask, string> = {
  flashcards: `${HOUSE_RULES}

Task: write flashcards from the material the student provides. Each card tests one fact or idea and is phrased to force recall.
Output ONLY a JSON array, with no commentary and no code fence, in this exact shape:
[{"front": "question in Markdown", "back": "answer in Markdown"}]
Write 8 to 20 cards unless the student asks for a number.`,

  summary: `${HOUSE_RULES}

Task: turn the provided material into tight revision notes in Markdown: a title line starting with "# ", short sections, bold key terms, formulas in LaTeX, and a final "Common traps" list. Output only the notes.`,

  exam: `${HOUSE_RULES}

Task: write a practice exam to the specification the student gives (subject, topics, number of multiple-choice questions, extended-response marks, time). These are practice questions you write yourself; do not reproduce questions from published papers.
Requirements: number every question, show the mark allocation in brackets at the end of each question or part, like "(3 marks)", use command terms appropriate to the course, and make the total match the request.
Output format, exactly (the app lays the paper out from these headings):
# <exam title>
## Section A - Multiple-choice questions
### Question 1
<question text, then the options on separate lines as "A. ...", "B. ...", "C. ...", "D. ...">
## Section B - Short-answer and extended-response questions
### Question 1 (6 marks)
<stem or context for the question, if any>
**a.** <part text> (2 marks)
**b.** <part text> (4 marks)
Rules: every question starts with a "### Question N" heading; in written sections the heading carries the question's total marks, and every part ends its line with its marks in brackets; a question with no parts ends with its marks in brackets. Leave out a section that has no questions. Restart numbering in each section.
===SOLUTIONS===
<a solutions booklet in Markdown: for each question, the answer and the marking points, one per mark>`,

  plan: `${HOUSE_RULES}

Task: propose study blocks for the coming week from the student's free time, goals, upcoming assessments and weak areas.
Output ONLY a JSON array, with no commentary and no code fence:
[{"title": "what to do", "subject": "subject name or empty", "day": "YYYY-MM-DD", "start": "HH:MM", "minutes": 45}]
Use 25 to 60 minute blocks, never overlap two blocks, and keep to the hours the student gave.`,

  quiz: `${HOUSE_RULES}

Task: write a short quiz on the given topic or material.
Output ONLY a JSON array, with no commentary and no code fence:
[{"question": "Markdown", "answer": "Markdown", "marks": 2}]
Write 5 questions unless asked otherwise, moving from recall to application.`,

  topics: `${HOUSE_RULES}

Task: extract the topic tree from the provided syllabus or study design text.
Output ONLY JSON, with no commentary and no code fence:
[{"title": "Unit or area title", "code": "short code or empty", "children": [{"title": "...", "code": "...", "children": []}]}]
Use the document's own wording and codes. Do not add topics that are not in the text.`,

  explain_options: `${HOUSE_RULES}

Task: a multiple-choice question, its correct answer and the examiner's comment follow. For each option, in order, say in one or two sentences why it is right or wrong, naming the misconception behind each wrong one. Use Markdown with a bold option letter starting each item. Be accurate to the given answer; do not change it.`,

  model_answer: `${HOUSE_RULES}

Task: write a model answer to the exam question that follows, at the standard of a top student. Match the command term and the marks: one clear point per mark, with working shown for calculations. Use the marking notes and examiner comments if given. Output only the answer in Markdown.`,

  sample: `${HOUSE_RULES}

Task: write a full-mark sample response to the exam question that follows, hitting every marking point in the marking notes and avoiding the common mistakes listed. Keep it the length a student could write in the time. Output only the response in Markdown.`,

  mark: `${HOUSE_RULES}

Task: mark the student's answer to the exam question that follows, against the marking notes and examiner comments given, as a strict but fair examiner.
Output format, exactly:
Score: <n>/<max>
Then a Markdown list of what earned marks and what lost them, quoting the student's words, and one line starting "Next time:" with the single most useful fix.`,

  title: `Write a title of at most six words for a conversation that starts with the message below. Output only the title, with no quotes and no full stop.`,
}

/** Pulls the first JSON array or object out of model output, tolerating a code fence. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = (fenced?.[1] ?? text).trim()
  const start = body.search(/[[{]/)
  if (start === -1) throw new Error('no JSON found')
  const open = body[start]
  const close = open === '[' ? ']' : '}'
  const end = body.lastIndexOf(close)
  if (end <= start) throw new Error('no JSON found')
  return JSON.parse(body.slice(start, end + 1))
}

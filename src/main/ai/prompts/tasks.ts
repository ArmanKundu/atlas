import { HOUSE_RULES } from './agents'

export type CompleteTask = 'flashcards' | 'summary' | 'exam' | 'plan' | 'quiz' | 'topics' | 'title'

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
Output format, exactly:
# <exam title>
<the question paper in Markdown, with "## Section A" style headings>
===SOLUTIONS===
<a solutions booklet: for each question, the answer and the marking points, one per mark>`,

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

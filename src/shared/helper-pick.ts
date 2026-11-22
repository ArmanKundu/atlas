/**
 * Auto mode for the assistant: picks the helper that fits a message, without asking the AI.
 * Rules are checked in order; the first helper whose words match wins. Subject helpers only
 * count when the student is in a subject of that kind (or no subject at all).
 */

export const AUTO_HELPER = 'auto'

interface Rule {
  id: string
  /** Matched against the lower-cased message. */
  pattern: RegExp
  /** Only for subjects of these kinds. */
  kinds?: string[]
}

const RULES: Rule[] = [
  {
    id: 'marker',
    pattern: /\b(mark|grade|score|assess) (my|this)\b|\bhow many marks would\b|\bmark it\b/,
  },
  {
    id: 'checker',
    pattern: /\b(check|is this right|is my answer|did i get|find (my )?mistakes?)\b/,
  },
  {
    id: 'exam-maker',
    pattern:
      /\b(make|write|create|generate) (me )?(an? )?(practice |mock |trial )?(exam|test|paper|sac)\b/,
  },
  { id: 'examiner', pattern: /\b(quiz me|test me|ask me|grill me|examine me)\b/ },
  { id: 'cards', pattern: /\bflash ?cards?\b|\banki\b/ },
  { id: 'quiz', pattern: /\b(multiple choice|mcqs?|quiz)\b/ },
  {
    id: 'notes',
    pattern: /\b(summari[sz]e|summary|make (me )?notes|study notes|cheat ?sheet|condense)\b/,
  },
  { id: 'mnemonics', pattern: /\b(mnemonic|remember (the|all|these)|memori[sz]e|acronym)\b/ },
  { id: 'calendar', pattern: /\b(calendar|schedule|timetable|due dates?|when is)\b/ },
  { id: 'planner', pattern: /\b(study plan|plan my|revision plan|what should i study|plan for)\b/ },
  {
    id: 'syllabus',
    pattern: /\b(study design|syllabus|key knowledge|key skills|dot points?|outcomes?)\b/,
  },
  {
    id: 'command-terms',
    pattern:
      /\b(command (terms?|words?)|what does (explain|evaluate|analyse|analyze|discuss|justify) mean)\b/,
  },
  { id: 'question-types', pattern: /\b(question types?|types of questions|extended response)\b/ },
  {
    id: 'exam-strategy',
    pattern: /\b(exam (tips|strategy|technique)|reading time|time management in|in the exam)\b/,
  },
  { id: 'feynman', pattern: /\b(eli5|like i'?m (5|five)|simple terms|teach it back|feynman)\b/ },
  { id: 'proof-coach', pattern: /\b(prove|proof|show that|induction)\b/, kinds: ['maths'] },
  {
    id: 'maths-coach',
    pattern:
      /\b(solve|equation|derivative|integra|differentiat|graph|function|matri|probability|calculus|algebra)\b/,
    kinds: ['maths'],
  },
  {
    id: 'experiment-designer',
    pattern: /\b(experiment|hypothesis|variables?|method|prac(tical)?|investigation)\b/,
    kinds: ['science'],
  },
  {
    id: 'chem-partner',
    pattern:
      /\b(reaction|equation|mole|stoichiometr|organic|titration|redox|equilibrium|enzyme|cell|dna|protein)\b/,
    kinds: ['science'],
  },
  {
    id: 'argument-analyst',
    pattern: /\b(argument|persuasive|opinion piece|media analysis|language analysis)\b/,
    kinds: ['essay'],
  },
  {
    id: 'text-analyst',
    pattern: /\b(quote|theme|character|text response|novel|poem|film|author)\b/,
    kinds: ['essay'],
  },
  {
    id: 'essay-coach',
    pattern: /\b(essay|paragraph|thesis|introduction|conclusion|topic sentence)\b/,
    kinds: ['essay', 'language'],
  },
  {
    id: 'accounting-tutor',
    pattern: /\b(ledger|journal|balance sheet|cash flow|depreciation|gst|accounts?)\b/,
    kinds: ['accounting'],
  },
  {
    id: 'language-partner',
    pattern: /\b(translate|conjugat|vocab|grammar|speak|conversation)\b/,
    kinds: ['language'],
  },
  {
    id: 'solver',
    pattern:
      /\b(solve|work out|calculate|step by step|how do i do (this|question))\b|\bq(uestion)? ?\d/,
  },
]

/**
 * The helper to use for `message`. `available` is the list of helper ids this student can use;
 * `kind` is the open subject's kind, if any. Falls back to the tutor.
 */
export function pickHelper(message: string, available: string[], kind?: string | null): string {
  const text = message.toLowerCase()
  const has = new Set(available)
  for (const rule of RULES) {
    if (!has.has(rule.id)) continue
    if (rule.kinds && kind && !rule.kinds.includes(kind)) continue
    if (rule.pattern.test(text)) return rule.id
  }
  return has.has('tutor') ? 'tutor' : (available[0] ?? 'tutor')
}

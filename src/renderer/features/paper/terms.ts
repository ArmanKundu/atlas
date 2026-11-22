/**
 * Command terms used in senior exam questions, with plain definitions. Detected from a question's
 * text when the question record does not list them.
 */
export const COMMAND_TERMS: Record<string, string> = {
  analyse: 'Identify the parts and show how they relate to each other.',
  apply: 'Use an idea or rule in a particular situation.',
  calculate: 'Work out a number, showing the steps.',
  compare: 'Give the similarities and differences, referring to both.',
  contrast: 'Show how two things are different.',
  define: 'Give the precise meaning of a word or idea.',
  describe: 'Give the features or characteristics, without explaining why.',
  determine: 'Find the answer, from given information or by calculation.',
  discuss: 'Give a considered argument with points for and against.',
  draw: 'Show clearly, with labels where needed.',
  evaluate: 'Judge the value or quality, weighing strengths and weaknesses.',
  explain: 'Say how or why something happens, giving reasons or causes.',
  find: 'Work out the answer.',
  identify: 'Name or point out, without explaining.',
  justify: 'Give reasons or evidence that support an answer.',
  label: 'Add names to the parts of a diagram.',
  list: 'Give a set of short answers, without explanation.',
  name: 'Give a word or term, without explanation.',
  outline: 'Give the main points briefly.',
  predict: 'Say what will happen, based on evidence or reasoning.',
  prove: 'Show by logical steps that it must be true.',
  'show that': 'Give every step needed to reach the stated result.',
  sketch: 'Draw the general shape, with the key features labelled.',
  solve: 'Find the value or values that make it true.',
  state: 'Give a brief, clear answer without explanation.',
  suggest: 'Put forward a sensible idea that fits the information.',
  verify: 'Check that it is true, showing the working.',
  write: 'Give the answer, for example an equation or expression.',
}

/** The command terms a question uses, in the order they appear. */
export function detectCommandTerms(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `
  return Object.keys(COMMAND_TERMS)
    .map((term) => ({ term, at: lower.search(new RegExp(`[\\s(.]${term}[\\s,.:]`)) }))
    .filter((hit) => hit.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((hit) => hit.term)
    .slice(0, 4)
}

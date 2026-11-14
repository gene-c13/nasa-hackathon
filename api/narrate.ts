/**
 * Stage 3 of /api/ask: computed result -> prose.
 *
 * By the time this runs the answer already exists. `shared/evidence.ts` has
 * graded the evidence and produced a short list of facts, every one of them
 * derived from a CSV. This stage only chooses words.
 *
 * The guard is the same one the pipeline uses, applied more strictly: every
 * number in the prose must appear in the supplied facts. The facts are the
 * only numbers in scope, so a number that fails the check was invented, and
 * an invented number discards the whole paragraph in favour of the
 * deterministic wording. We would rather read a stiff sentence than a fluent
 * false one.
 *
 * A "no-data" grade is the case most at risk of being smoothed over, so the
 * prompt forbids it explicitly and the deterministic fallback states it
 * plainly.
 */
import type Anthropic from '@anthropic-ai/sdk'
import type { Grade } from '../shared/types.ts'
import { MODEL } from './interpret.ts'

/** Bump when SYSTEM below changes. Reported in the response. */
export const NARRATE_VERSION = 1

export interface NarrationResult {
  answer: string
  /** 'model' when the prose came from the API and passed the guard. */
  mode: 'model' | 'deterministic'
  /** Numbers the model introduced that were not in the facts. */
  invented: string[]
}

const SYSTEM = `You turn an already-computed result into two or three plain sentences for a fire-safety dashboard. The analysis is finished; you are writing it up.

Rules, in order of importance:
1. Use ONLY the supplied facts. Every number in your answer must appear in them. Never add, convert, round or infer a number.
2. Never soften an absence of data. If the facts say no test exists, say no test exists. Do not estimate, interpolate or reassure. "Nobody has measured this" is a useful answer and the one engineers need.
3. Never give a safety recommendation. Report what the data shows and stop.
4. Plain English for an engineer who is not a combustion scientist. No marketing language.
5. Two or three sentences, 400 characters or fewer.`

/** Numbers in the prose that are absent from the facts. */
function inventedNumbers(answer: string, facts: string[]): string[] {
  const source = facts.join(' ')
  const nums = answer.match(/\d+(?:\.\d+)?/g) ?? []
  return [...new Set(nums)].filter((n) => !source.includes(n))
}

/**
 * Wording that needs no model. `buildFacts` already writes each fact as a
 * sentence, so this is a real answer rather than a placeholder — it is just
 * stiffer than prose a model would write.
 *
 * Lines the UI shows in its own panels are left out rather than repeated: the
 * individual nearest-test rows appear in a table, and the licence line sits in
 * the footer. Keeping them here made the answer three times longer than the
 * model's and no more informative.
 */
const SHOWN_ELSEWHERE = /^(Nearest available evidence:|Source:)/

export function narrateWithRules(facts: string[], grade: Grade): NarrationResult {
  const lead =
    grade === 'measured'
      ? 'This condition has been tested.'
      : grade === 'bounded'
        ? 'This exact condition has not been tested, but it is bracketed by tests either side.'
        : 'This condition has not been tested.'

  const body = facts.filter((f) => !SHOWN_ELSEWHERE.test(f))
  return { answer: [lead, ...body].join(' '), mode: 'deterministic', invented: [] }
}

export async function narrate(
  client: Anthropic | null,
  question: string,
  facts: string[],
  grade: Grade,
): Promise<NarrationResult> {
  if (!client) return narrateWithRules(facts, grade)

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            `Question: ${question}`,
            `Evidence grade: ${grade}`,
            '',
            'Facts (the only numbers you may use):',
            ...facts.map((f) => `- ${f}`),
            '',
            'Write the answer.',
          ].join('\n'),
        },
      ],
    })

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim()

    if (!text) return narrateWithRules(facts, grade)

    const invented = inventedNumbers(text, facts)
    if (invented.length) {
      // The whole paragraph goes. A single wrong figure makes the rest
      // untrustworthy, and silently patching it would hide the failure.
      const fallback = narrateWithRules(facts, grade)
      return { ...fallback, invented }
    }

    return { answer: text, mode: 'model', invented: [] }
  } catch {
    return narrateWithRules(facts, grade)
  }
}

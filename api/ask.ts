/**
 * POST /api/ask — grounded question answering over the PSI combustion data.
 *
 * The shape of this endpoint is the argument the project is making, so it is
 * worth stating plainly. Three stages:
 *
 *   1. interpret  English question -> structured query     (model, or rules)
 *   2. grade      structured query -> evidence + facts     (deterministic)
 *   3. narrate    facts -> prose                           (model, or rules)
 *
 * Stage 2 is where the answer is decided, and stage 2 contains no model. Every
 * number in a response is traceable to a row of a NASA CSV, through
 * `shared/evidence.ts` — the same code the dashboard runs in the browser, so
 * the endpoint and the UI cannot disagree.
 *
 * The model is used at the edges, for the two things it is actually good at:
 * reading an ambiguous sentence, and writing a clear one. Both stages have a
 * rule-based path that runs when there is no API key, when the API fails, or
 * when a guard rejects the model's output. The endpoint therefore answers
 * correctly with no credentials at all; the key buys better phrasing, not
 * better facts.
 *
 * It is also allowed to say no. A question about a material nobody has tested
 * at the oxygen level asked gets grade "no-data" and a caveat explaining what
 * the nearest evidence is and why it may not transfer. That is the useful
 * answer for habitat design, where the tested range stops at 22.2% oxygen for
 * every solid and the habitat runs at 30% or more.
 */
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Dataset, Grade, TestRow } from '../shared/types.ts'
import { blockReason, gradeEvidence } from '../shared/evidence.ts'
import { cannedReading, SUGGESTIONS } from './canned.ts'
import { buildFacts } from './facts.ts'
import {
  INTERPRET_VERSION,
  interpretWithModel,
  interpretWithRules,
  MODEL,
  type Interpretation,
} from './interpret.ts'
import { narrate, NARRATE_VERSION } from './narrate.ts'
import { findApiKey } from './key.ts'

const here = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = resolve(here, '../shared/data.json')

export const MAX_QUESTION_LENGTH = 500

// ---------------------------------------------------------------------------
// Wire format. Frozen like shared/types.ts: the UI builds against this.
// ---------------------------------------------------------------------------

/** A test row without `raw`, which the browser already has in data.json. */
export interface TestRef {
  id: string
  accession: string
  fuel: string
  material: string | null
  family: TestRow['family']
  o2Fraction: number | null
  pressureAtm: number | null
  outcome: TestRow['outcome']
  sourceFile: string
}

export interface Citation {
  accession: string
  acronym: string
  title: string
  doi: string
}

export interface AskResponse {
  question: string
  interpretation: Interpretation
  grade: Grade
  /** Prose. Never the source of a number — see `facts`. */
  answer: string
  /** The computed statements the prose is allowed to draw on. */
  facts: string[]
  matches: TestRef[]
  nearest: TestRef[]
  caveat: string | null
  /** Set when the matched rows span incomparable test families. */
  blocked: string | null
  citations: Citation[]
  meta: {
    /** Where the prose came from. */
    answerMode: 'model' | 'deterministic'
    /** Where the reading of the question came from. */
    readingMode: 'model' | 'rules'
    /** True when the question matched a pinned demo reading. */
    pinned: boolean
    /** Numbers the model introduced that were not in `facts`. Should be empty. */
    rejectedNumbers: string[]
    model: string | null
    promptVersions: { interpret: number; narrate: number }
    datasetGeneratedAt: string
  }
}

export interface AskError {
  error: string
  suggestions?: string[]
}

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

let cached: Dataset | null = null

export function dataset(): Dataset {
  return (cached ??= JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Dataset)
}

const trim = (t: TestRow): TestRef => ({
  id: t.id,
  accession: t.accession,
  fuel: t.fuel,
  material: t.material,
  family: t.family,
  o2Fraction: t.o2Fraction,
  pressureAtm: t.pressureAtm,
  outcome: t.outcome,
  sourceFile: t.sourceFile,
})

function citationsFor(rows: TestRow[], data: Dataset): Citation[] {
  const accessions = [...new Set(rows.map((r) => r.accession))]
  return accessions
    .map((a) => data.investigations.find((i) => i.accession === a))
    .filter((i): i is Dataset['investigations'][number] => Boolean(i))
    .map((i) => ({
      accession: i.accession,
      acronym: i.acronym,
      title: i.title,
      doi: i.doi,
    }))
}


/**
 * Facts for a question naming a material the dataset does not cover.
 *
 * Grading "unknown" against the rows produces sentences like "no test of
 * unknown at 30% oxygen", which read as though we had looked the material up
 * and found nothing. We had not — we failed to recognise the name. The honest
 * answer names the gap and says what is covered, so the question can be asked
 * again in terms the data uses.
 */
export function unknownMaterialFacts(data: Dataset): string[] {
  const covered = [...new Set(data.tests.map((t) => t.material).filter(Boolean))].sort()
  return [
    'The material in this question is not one the PSI combustion data covers, ' +
      'so there is nothing to grade — this is a gap in the question, not a measured absence.',
    `The ${covered.length} materials with test data are: ${covered.join(', ')}.`,
    `Source: ${data.meta.source}, ${data.meta.license}.`,
  ]
}

// ---------------------------------------------------------------------------
// The endpoint
// ---------------------------------------------------------------------------

let client: Anthropic | null | undefined

/** Lazy, and allowed to be absent. Resolved once per process. */
function getClient(): Anthropic | null {
  if (client !== undefined) return client
  const key = findApiKey()
  client = key ? new Anthropic({ apiKey: key }) : null
  return client
}

export async function ask(question: string): Promise<AskResponse> {
  const data = dataset()
  const api = getClient()

  // 1. Interpret. A pinned demo question skips straight past the model;
  //    otherwise try the model and fall back to rules on any rejection.
  const pinned = cannedReading(question)
  let reading: Interpretation
  if (pinned) {
    reading = pinned
  } else if (api) {
    try {
      reading = await interpretWithModel(api, question)
    } catch (err) {
      reading = { ...interpretWithRules(question), modelRejected: String(err) }
    }
  } else {
    reading = interpretWithRules(question)
  }

  // An unrecognised material short-circuits here. Grading it would dress a
  // parsing failure up as a finding.
  if (reading.material === 'unknown') {
    const facts = unknownMaterialFacts(data)
    const narration = await narrate(api, question, facts, 'no-data')
    return {
      question,
      interpretation: reading,
      grade: 'no-data',
      answer: narration.answer,
      facts,
      matches: [],
      nearest: [],
      caveat: 'No material in this question matched one the dataset covers.',
      blocked: null,
      citations: [],
      meta: {
        answerMode: narration.mode,
        readingMode: reading.source,
        pinned: Boolean(pinned),
        rejectedNumbers: narration.invented,
        model: api ? MODEL : null,
        promptVersions: { interpret: INTERPRET_VERSION, narrate: NARRATE_VERSION },
        datasetGeneratedAt: data.meta.generatedAt,
      },
    }
  }

  // 2. Grade. No model anywhere in this step.
  const result = gradeEvidence(data.tests, {
    material: reading.material,
    o2Fraction: reading.o2Fraction,
    pressureAtm: reading.pressureAtm,
    family: reading.family,
  })
  const facts = buildFacts(result, reading, data)

  // 3. Narrate, under the number guard.
  const narration = await narrate(api, question, facts, result.grade)

  return {
    question,
    interpretation: reading,
    grade: result.grade,
    answer: narration.answer,
    facts,
    matches: result.matches.map(trim),
    nearest: result.nearest.map(trim),
    caveat: result.caveat,
    blocked: blockReason([...result.matches, ...result.nearest]),
    citations: citationsFor([...result.matches, ...result.nearest], data),
    meta: {
      answerMode: narration.mode,
      readingMode: reading.source,
      pinned: Boolean(pinned),
      rejectedNumbers: narration.invented,
      model: api ? MODEL : null,
      promptVersions: { interpret: INTERPRET_VERSION, narrate: NARRATE_VERSION },
      datasetGeneratedAt: data.meta.generatedAt,
    },
  }
}

export interface HandlerResult {
  status: number
  body: AskResponse | AskError | { suggestions: string[]; datasetGeneratedAt: string }
}

/**
 * Transport-free request handling, so the Vite dev middleware, a serverless
 * function and the test script all run exactly the same code path.
 */
export async function handleAsk(
  method: string,
  query: string | null,
  body: unknown,
): Promise<HandlerResult> {
  if (method === 'GET' && !query) {
    return {
      status: 200,
      body: { suggestions: SUGGESTIONS, datasetGeneratedAt: dataset().meta.generatedAt },
    }
  }

  if (method !== 'GET' && method !== 'POST') {
    return { status: 405, body: { error: 'Use GET with ?q= or POST with {"question":"..."}' } }
  }

  const raw =
    method === 'GET'
      ? query
      : typeof body === 'object' && body !== null
        ? (body as { question?: unknown }).question
        : null

  const question = typeof raw === 'string' ? raw.trim() : ''

  if (!question) {
    return { status: 400, body: { error: 'A question is required.', suggestions: SUGGESTIONS } }
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return {
      status: 400,
      body: { error: `Question longer than ${MAX_QUESTION_LENGTH} characters.` },
    }
  }

  try {
    return { status: 200, body: await ask(question) }
  } catch (err) {
    console.error('[api/ask]', err)
    return { status: 500, body: { error: 'Failed to answer. See server log.' } }
  }
}

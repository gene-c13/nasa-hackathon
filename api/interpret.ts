/**
 * Stage 1 of /api/ask: question -> structured query.
 *
 * The model's ONLY job here is to read English and fill in a form. It picks a
 * material from a fixed list and copies numbers out of the question. It does
 * not look anything up, and it never decides what the answer is.
 *
 * Two guards make that claim checkable rather than aspirational:
 *
 *   1. `material` is an enum of canonical names, so an unknown material comes
 *      back as "unknown" instead of a plausible invention.
 *   2. Any number the model returns must appear literally in the question.
 *      Extraction is allowed; arithmetic and recall are not. A number that
 *      fails this test discards the whole model reading and we fall back to
 *      the rule-based parser below.
 *
 * The rule-based parser is not a degraded mode kept around for emergencies.
 * It handles the phrasing the dashboard actually produces ("PMMA at 34%
 * oxygen") perfectly well, and it is what runs when there is no API key.
 */
import type Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import type { Family } from '../shared/types.ts'
import { MATERIAL_RULES } from '../shared/materials.ts'
import { HABITAT } from '../shared/evidence.ts'

export const MODEL = 'claude-sonnet-5-5'
/** Bump when the prompt or schema below changes. Reported in the response. */
export const INTERPRET_VERSION = 1

const PSI_PER_ATM = 14.696
const CANONICAL = MATERIAL_RULES.map((r) => r.canonical)
const FAMILIES: Family[] = ['droplet', 'flame-spread', 'burner', 'aerosol']

export interface Interpretation {
  material: string
  o2Fraction: number
  pressureAtm?: number
  family?: Family
  /** How this reading was produced. Shown in the UI, not decoration. */
  source: 'model' | 'rules'
  /**
   * True when the question named no oxygen level and we supplied one.
   * The UI must say so: an assumed atmosphere answers a different question
   * from the one asked.
   */
  assumedO2: boolean
  /** Why the model reading was rejected, when it was. */
  modelRejected?: string
}

// ---------------------------------------------------------------------------
// Rule-based reading
// ---------------------------------------------------------------------------

const HABITAT_WORDS = /\bhabitat|\bmoon|\blunar|\bartemis|\bgateway\b/i

/** Oxygen as a mole fraction, from "34%", "34 % O2" or "0.34". */
function readO2(question: string): number | null {
  const percent = question.match(/(\d+(?:\.\d+)?)\s*%/)
  if (percent) {
    const value = Number(percent[1])
    if (value > 0 && value <= 100) return value / 100
  }
  // A bare fraction, but only when oxygen is the subject of the sentence.
  const fraction = question.match(/\b0?\.(\d+)\b/)
  if (fraction && /o2|oxygen/i.test(question)) {
    const value = Number(`0.${fraction[1]}`)
    if (value > 0 && value <= 1) return value
  }
  return null
}

function readPressure(question: string): number | null {
  const psi = question.match(/(\d+(?:\.\d+)?)\s*psi/i)
  if (psi) return Number(psi[1]) / PSI_PER_ATM
  const atm = question.match(/(\d+(?:\.\d+)?)\s*atm/i)
  if (atm) return Number(atm[1])
  return null
}

function readFamily(question: string): Family | null {
  if (/droplet|\bdrop\b/i.test(question)) return 'droplet'
  if (/flame[\s-]*spread|spread(ing)?\b/i.test(question)) return 'flame-spread'
  if (/burner|\bjet flame|coflow/i.test(question)) return 'burner'
  if (/aerosol|smoke|particulate/i.test(question)) return 'aerosol'
  return null
}

function readMaterial(question: string): string | null {
  // MATERIAL_RULES is ordered most-specific-first, and that order matters
  // here for the same reason it matters in the pipeline: "cotton-fiberglass"
  // must reach SIBAL before the plain cotton rule claims it.
  for (const rule of MATERIAL_RULES) {
    if (rule.pattern.test(question)) return rule.canonical
  }
  return null
}

export function interpretWithRules(question: string): Interpretation {
  const habitat = HABITAT_WORDS.test(question)
  const o2 = readO2(question)
  const pressure = readPressure(question)
  const family = readFamily(question)

  return {
    material: readMaterial(question) ?? 'unknown',
    o2Fraction: o2 ?? (habitat ? HABITAT.o2Min : 0.21),
    pressureAtm: pressure ?? (habitat ? HABITAT.pressureMaxAtm : undefined),
    family: family ?? undefined,
    source: 'rules',
    assumedO2: o2 === null,
  }
}

// ---------------------------------------------------------------------------
// Model reading
// ---------------------------------------------------------------------------

const SYSTEM = `You convert a question about NASA microgravity combustion data into a structured query. You are a parser, not an expert.

Rules:
1. Choose the material from the supplied list only. If the question names a material that is not on the list, or names none, return "unknown".
2. Copy numbers out of the question. Every number you return must appear in the question text as written. Do not convert units, do not calculate, do not recall typical values.
3. If the question gives no oxygen level, return null for oxygenPercent. Do not guess one.
4. Set testFamily only when the question clearly asks about that kind of test. Otherwise return null.
5. Never answer the question. Another system does that.`

/** Numbers the model returned that do not appear in the question text. */
function unsupportedNumbers(values: (number | null)[], question: string): string[] {
  const stripped = question.replace(/\s+/g, '')
  return values
    .filter((v): v is number => v !== null)
    .map(String)
    .filter((n) => !stripped.includes(n) && !question.includes(n))
}

export async function interpretWithModel(
  client: Anthropic,
  question: string,
): Promise<Interpretation> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM,
    output_config: {
      format: jsonSchemaOutputFormat({
        type: 'object',
        properties: {
          material: {
            type: 'string',
            enum: [...CANONICAL, 'unknown'],
            description: 'Canonical material named in the question, or "unknown".',
          },
          oxygenPercent: {
            type: ['number', 'null'],
            description:
              'Oxygen percentage exactly as written in the question, e.g. 34 for "34%". Null if absent.',
          },
          pressurePsi: {
            type: ['number', 'null'],
            description: 'Pressure in psi exactly as written in the question. Null if absent.',
          },
          testFamily: {
            type: ['string', 'null'],
            enum: [...FAMILIES, null],
            description: 'Test family, only if the question clearly asks for one.',
          },
        },
        required: ['material', 'oxygenPercent', 'pressurePsi', 'testFamily'],
        additionalProperties: false,
      }),
    },
    messages: [
      {
        role: 'user',
        content: `Materials available: ${CANONICAL.join(', ')}\n\nQuestion: ${question}`,
      },
    ],
  })

  const parsed = response.parsed_output as {
    material?: string
    oxygenPercent?: number | null
    pressurePsi?: number | null
    testFamily?: string | null
  } | null

  if (!parsed) throw new Error('no parsed output')

  const o2Percent = parsed.oxygenPercent ?? null
  const pressurePsi = parsed.pressurePsi ?? null

  const invented = unsupportedNumbers([o2Percent, pressurePsi], question)
  if (invented.length) {
    throw new Error(`numbers absent from the question: ${invented.join(', ')}`)
  }
  if (o2Percent !== null && (o2Percent <= 0 || o2Percent > 100)) {
    throw new Error(`oxygenPercent ${o2Percent} outside 0–100`)
  }

  const habitat = HABITAT_WORDS.test(question)
  const family = FAMILIES.find((f) => f === parsed.testFamily)

  return {
    material: parsed.material && parsed.material !== 'unknown' ? parsed.material : 'unknown',
    o2Fraction: o2Percent !== null ? o2Percent / 100 : habitat ? HABITAT.o2Min : 0.21,
    pressureAtm:
      pressurePsi !== null
        ? pressurePsi / PSI_PER_ATM
        : habitat
          ? HABITAT.pressureMaxAtm
          : undefined,
    family,
    source: 'model',
    assumedO2: o2Percent === null,
  }
}

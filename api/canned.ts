/**
 * Demo questions with a fixed reading.
 *
 * What is pinned here is the PARSE, not the answer. Each entry fixes how one
 * question is read; the answer behind it is still computed from the CSV data
 * at request time, so a pinned question cannot drift away from the dataset and
 * cannot be quietly wrong. A hardcoded paragraph would be both.
 *
 * The point is a demo that cannot fail on stage: no API key, no network, no
 * ambiguity between the question asked and the result shown. Everything else
 * about the request path is identical to any other question.
 *
 * Matching is deliberately strict — the question must be one of these
 * questions, give or take punctuation and capitalisation. An earlier version
 * matched on keywords, and "how much heptane droplet data is there at 25%
 * oxygen?" hit the methanol entry on the word "droplet" and was answered as a
 * methanol question. A pin that can capture a question nobody pinned is worse
 * than no pin: it silently substitutes one question for another. The UI sends
 * these labels verbatim when a suggestion chip is clicked, which is the only
 * case a pin is for.
 */
import { HABITAT } from '../shared/evidence.ts'
import type { Interpretation } from './interpret.ts'

export interface Canned {
  /** The question as we put it. Sent verbatim by the UI's suggestion chips. */
  label: string
  reading: Omit<Interpretation, 'source' | 'assumedO2'> & { assumedO2?: boolean }
}

export const CANNED: Canned[] = [
  {
    label: 'Will PMMA burn in the Moon habitat atmosphere?',
    reading: {
      material: 'PMMA',
      o2Fraction: 0.34,
      pressureAtm: HABITAT.pressureMaxAtm,
      family: 'flame-spread',
    },
  },
  {
    label: 'Has Nomex been tested above 30% oxygen?',
    reading: { material: 'Nomex', o2Fraction: 0.34, family: 'flame-spread' },
  },
  {
    label: 'What do we know about SIBAL cloth at 30% oxygen?',
    reading: { material: 'SIBAL', o2Fraction: 0.3, family: 'flame-spread' },
  },
  {
    label: 'How do methanol droplets behave at 30% oxygen?',
    reading: { material: 'Methanol', o2Fraction: 0.3, family: 'droplet' },
  },
  {
    label: 'Is there burner data for ethylene at 21% oxygen?',
    reading: { material: 'Ethylene', o2Fraction: 0.21, family: 'burner' },
  },
]

/** Lowercase, collapse whitespace, drop punctuation. Nothing else. */
const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9%.\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

const INDEX = new Map(CANNED.map((c) => [normalize(c.label), c]))

/** The pinned reading for this exact question, or null. */
export function cannedReading(question: string): Interpretation | null {
  const hit = INDEX.get(normalize(question))
  if (!hit) return null
  return { ...hit.reading, source: 'rules', assumedO2: hit.reading.assumedO2 ?? false }
}

export const SUGGESTIONS = CANNED.map((c) => c.label)

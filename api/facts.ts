/**
 * The facts — the deterministic core of an answer.
 *
 * Every sentence the prose is permitted to use, each one computed from rows.
 * This is what makes the number guard meaningful: the set of legal numbers in
 * an answer is exactly the set of numbers appearing here.
 *
 * In its own file, with no Node or SDK imports, so the browser can run it too.
 * The Ask screen grades the pinned demo questions locally when the endpoint
 * is unreachable, and it should produce the same facts the endpoint would —
 * otherwise the offline demo shows a thinner answer than the online one for
 * the same question, and someone will notice.
 */
import type { Dataset, EvidenceResult, TestRow } from '../shared/types.ts'
import { blockReason, pct } from '../shared/evidence.ts'
import type { Interpretation } from './interpret.ts'

const outcomeTally = (rows: TestRow[]): string | null => {
  const counts: Record<string, number> = {}
  for (const r of rows) if (r.outcome !== 'unknown') counts[r.outcome] = (counts[r.outcome] ?? 0) + 1
  const parts = Object.entries(counts).map(([k, n]) => `${n} ${k}`)
  return parts.length ? parts.join(', ') : null
}

/**
 * Every sentence the prose is permitted to use, each one computed from rows.
 * This is what makes the number guard meaningful: the set of legal numbers in
 * an answer is exactly the set of numbers appearing here.
 */
export function buildFacts(
  result: EvidenceResult,
  reading: Interpretation,
  data: Dataset,
): string[] {
  const facts: string[] = []
  const material = reading.material
  const familyNote = reading.family ? ` in the ${reading.family} family` : ''

  if (result.grade === 'measured') {
    facts.push(
      `${result.matches.length} test(s) of ${material}${familyNote} exist at ${pct(reading.o2Fraction)} oxygen.`,
    )
    const tally = outcomeTally(result.matches)
    if (tally) facts.push(`Recorded outcomes among those tests: ${tally}.`)
    else facts.push('Those tests record test conditions but no pass/fail outcome.')
  } else if (result.grade === 'bounded') {
    facts.push(
      `No test of ${material}${familyNote} at exactly ${pct(reading.o2Fraction)} oxygen.`,
    )
  } else {
    facts.push(
      `No test of ${material}${familyNote} at ${pct(reading.o2Fraction)} oxygen exists in the PSI combustion data.`,
    )
  }

  // The tested envelope for this material: the single most useful number when
  // the answer is "no data", because it says how far the question sits outside
  // what anyone has measured.
  const sameMaterial = data.tests.filter(
    (t) => t.material === material && t.o2Fraction !== null,
  )
  if (sameMaterial.length) {
    const values = sameMaterial.map((t) => t.o2Fraction!)
    facts.push(
      `Across all ${sameMaterial.length} ${material} tests with a recorded oxygen level, ` +
        `the tested range is ${pct(Math.min(...values))} to ${pct(Math.max(...values))} oxygen.`,
    )
  }

  if (result.caveat) facts.push(result.caveat)

  for (const row of result.nearest) {
    facts.push(
      `Nearest available evidence: ${row.fuel} at ${row.o2Fraction !== null ? pct(row.o2Fraction) : 'unrecorded'} oxygen ` +
        `(${row.family}, ${row.accession}, outcome ${row.outcome}).`,
    )
  }

  if (reading.assumedO2) {
    facts.push(
      `The question named no oxygen level, so ${pct(reading.o2Fraction)} was assumed.`,
    )
  }

  const blocked = blockReason([...result.matches, ...result.nearest])
  if (blocked) facts.push(`Comparability warning: ${blocked}`)

  facts.push(`Source: ${data.meta.source}, ${data.meta.license}.`)

  return facts
}

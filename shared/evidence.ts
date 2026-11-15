/**
 * Evidence grading and the comparability guard.
 *
 * Pure functions, no I/O, no dependencies — the pipeline runs them to
 * precompute coverage, and the web app runs the same code in the browser for
 * live queries. One implementation, so the dashboard and the analysis can
 * never disagree.
 *
 * The governing idea: an answer is only as good as the evidence behind it, so
 * every result carries a grade saying what kind of evidence that was. We would
 * rather say "nobody has tested this" than return a confident number nobody
 * measured.
 */
import type { TestRow, Family, EvidenceResult, CoverageCell } from './types.ts'
import { matchesMaterial } from './materials.ts'

/** How close a test has to be to count as testing the same condition. */
export const DEFAULT_TOLERANCE = {
  /** Mole fraction. 0.01 is one percentage point of oxygen. */
  o2: 0.01,
  /** atm. Habitat pressures differ from 1 atm by much more than this. */
  pressure: 0.05,
}

export interface EvidenceQuery {
  /** Free text; matched against canonical materials. */
  material: string
  o2Fraction: number
  pressureAtm?: number
  /** Restrict to one test family. Omit to search all, with caveats. */
  family?: Family
}

// ---------------------------------------------------------------------------
// Comparability
// ---------------------------------------------------------------------------

/**
 * Why families do not mix.
 *
 * These are not arbitrary categories — each family measures a different
 * physical quantity under a different mechanism. Plotting them on one axis
 * produces a chart that looks informative and means nothing.
 */
const INCOMPARABLE: Record<string, string> = {
  'droplet|flame-spread':
    'A droplet extinction diameter and a flame-spread rate measure different quantities. Droplets burn in still gas; solid samples depend strongly on forced flow.',
  'droplet|burner':
    'Droplet flames consume a finite fuel sphere. Burner flames are fed continuously, so "stayed lit" means something different in each.',
  'droplet|aerosol':
    'Aerosol tests measure smoke particles, not flame behaviour.',
  'flame-spread|burner':
    'Burner flames are continuously fed and anchored; a flame spreading over a solid is not. Burner data informs material flammability only indirectly, through emulation studies such as BRE.',
  'flame-spread|aerosol':
    'Aerosol tests measure smoke particles, not flame behaviour.',
  'burner|aerosol':
    'Aerosol tests measure smoke particles, not flame behaviour.',
}

export interface Comparability {
  ok: boolean
  reason: string
}

/** Can results from these two families be placed on the same axis? */
export function canCompare(a: Family, b: Family): Comparability {
  if (a === b) return { ok: true, reason: 'Same test family.' }
  // The table lists each pair once, in no particular order, so try both.
  const reason = INCOMPARABLE[`${a}|${b}`] ?? INCOMPARABLE[`${b}|${a}`]
  return {
    ok: false,
    reason: reason ?? 'Different test families measure different quantities.',
  }
}

/** Every family present in a set of rows. */
export const familiesIn = (tests: TestRow[]): Family[] => [
  ...new Set(tests.map((t) => t.family)),
]

/**
 * Guard a set of rows about to be charted together.
 * Returns the blocking reason, or null when the set is safe.
 */
export function blockReason(tests: TestRow[]): string | null {
  const families = familiesIn(tests)
  if (families.length <= 1) return null

  for (let i = 0; i < families.length; i++) {
    for (let j = i + 1; j < families.length; j++) {
      const verdict = canCompare(families[i], families[j])
      if (!verdict.ok) return verdict.reason
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

const usable = (t: TestRow) => t.o2Fraction !== null && t.material !== null

function pressureOk(t: TestRow, q: EvidenceQuery, tol: number): boolean {
  if (q.pressureAtm === undefined) return true
  if (t.pressureAtm === null) return true // unknown pressure does not disqualify
  return Math.abs(t.pressureAtm - q.pressureAtm) <= tol
}

/**
 * Grade the evidence for one material at one atmosphere.
 *
 *   measured  a test exists at these conditions
 *   bounded   tests exist above and below, so the answer is bracketed
 *   no-data   neither, and here is the closest thing we do have
 */
export function gradeEvidence(
  tests: TestRow[],
  query: EvidenceQuery,
  tolerance = DEFAULT_TOLERANCE,
): EvidenceResult {
  const sameMaterial = tests.filter(
    (t) =>
      usable(t) &&
      matchesMaterial(query.material, t.material) &&
      (query.family === undefined || t.family === query.family),
  )

  // The material is absent from PSI entirely.
  if (!sameMaterial.length) {
    const anyFamily = tests.filter(
      (t) => usable(t) && matchesMaterial(query.material, t.material),
    )
    return {
      grade: 'no-data',
      matches: [],
      nearest: nearestByO2(anyFamily, query.o2Fraction, 3),
      caveat: anyFamily.length
        ? `No test of ${query.material} in the ${query.family} family. The nearest results come from a different family, where the burning mechanism differs.`
        : `${query.material} does not appear in the PSI combustion data at all.`,
    }
  }

  // Direct hits.
  const matches = sameMaterial.filter(
    (t) =>
      Math.abs(t.o2Fraction! - query.o2Fraction) <= tolerance.o2 &&
      pressureOk(t, query, tolerance.pressure),
  )

  if (matches.length) {
    return {
      grade: 'measured',
      matches: byCloseness(matches, query.o2Fraction),
      nearest: [],
      caveat: caveatForPressure(matches, query),
    }
  }

  // Bracketed above and below.
  const below = sameMaterial.filter((t) => t.o2Fraction! < query.o2Fraction)
  const above = sameMaterial.filter((t) => t.o2Fraction! > query.o2Fraction)

  if (below.length && above.length) {
    const lo = Math.max(...below.map((t) => t.o2Fraction!))
    const hi = Math.min(...above.map((t) => t.o2Fraction!))
    return {
      grade: 'bounded',
      matches: byCloseness([...below, ...above], query.o2Fraction).slice(0, 6),
      nearest: [],
      caveat:
        `No test at exactly ${pct(query.o2Fraction)}. Bracketed by tests at ` +
        `${pct(lo)} and ${pct(hi)}, so behaviour here is interpolated, not measured.`,
    }
  }

  // Outside the tested range entirely — the important case for habitat work.
  const values = sameMaterial.map((t) => t.o2Fraction!)
  const max = Math.max(...values)
  const min = Math.min(...values)
  const beyondTop = query.o2Fraction > max

  return {
    grade: 'no-data',
    matches: [],
    nearest: nearestByO2(sameMaterial, query.o2Fraction, 3),
    caveat: beyondTop
      ? `No microgravity test of ${query.material} above ${pct(max)} oxygen. ` +
        `You are asking about ${pct(query.o2Fraction)}, which is outside the tested range — ` +
        `extrapolating upward is not supported by this data, and flammability rises sharply with oxygen.`
      : `No test of ${query.material} below ${pct(min)} oxygen.`,
  }
}

function caveatForPressure(matches: TestRow[], q: EvidenceQuery): string | null {
  if (q.pressureAtm === undefined) return null
  const known = matches.filter((t) => t.pressureAtm !== null)
  if (!known.length) return 'Matching tests do not record ambient pressure.'
  return null
}

const byCloseness = (tests: TestRow[], target: number) =>
  [...tests].sort(
    (a, b) => Math.abs(a.o2Fraction! - target) - Math.abs(b.o2Fraction! - target),
  )

const nearestByO2 = (tests: TestRow[], target: number, n: number) =>
  byCloseness(tests.filter(usable), target).slice(0, n)

/** 0.34 -> "34%" */
export const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export const O2_BINS = [
  0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
]

/** Lower edge of the bin this value falls in. */
export function binFor(o2: number): number {
  let edge = O2_BINS[0]
  for (const b of O2_BINS) if (o2 >= b) edge = b
  return edge
}

/**
 * Count tests per material and oxygen bin.
 * Empty cells are the point: they are what the gap map displays.
 */
export function coverage(tests: TestRow[]): CoverageCell[] {
  const cells = new Map<string, CoverageCell>()

  for (const t of tests) {
    if (!usable(t)) continue
    const o2Bin = binFor(t.o2Fraction!)
    const key = `${t.material}|${t.family}|${o2Bin}`

    const cell =
      cells.get(key) ??
      ({
        material: t.material!,
        family: t.family,
        o2Bin,
        count: 0,
        outcomes: {},
      } satisfies CoverageCell)

    cell.count++
    cell.outcomes[t.outcome] = (cell.outcomes[t.outcome] ?? 0) + 1
    cells.set(key, cell)
  }

  return [...cells.values()].sort(
    (a, b) => a.material.localeCompare(b.material) || a.o2Bin - b.o2Bin,
  )
}

/**
 * The planned lunar habitat atmosphere, from the challenge brief:
 * 30% oxygen or more, at 10.2 psi or less.
 */
export const HABITAT = {
  o2Min: 0.3,
  pressureMaxAtm: 10.2 / 14.696,
  label: 'Moon habitat (≥30% O₂, ≤10.2 psi)',
}

/** Tests that fall inside the planned habitat atmosphere. */
export const inHabitatBand = (tests: TestRow[]) =>
  tests.filter((t) => t.o2Fraction !== null && t.o2Fraction >= HABITAT.o2Min)

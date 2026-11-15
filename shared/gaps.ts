/**
 * Coverage gaps: what nobody has measured.
 *
 * `coverage()` in evidence.ts counts the tests that exist. This file is about
 * the cells that do not, which is the question the project exists to answer.
 * A search tool tells you what NASA knows; the useful thing for habitat design
 * is knowing where NASA does not know, because that is where a design decision
 * is being made on no evidence.
 *
 * Pure functions over `TestRow[]`, like evidence.ts, so the pipeline and the
 * browser compute the same gaps from the same rows. Deliberately NOT added to
 * the Dataset contract in types.ts: 1,995 rows is nothing to re-derive on the
 * client, and the contract is frozen by agreement with Role B.
 *
 * One rule worth stating. `gradeEvidence` treats an unrecorded pressure as not
 * disqualifying, because a missing field should not hide a relevant test. This
 * file does the opposite: a row only counts as inside the habitat atmosphere
 * if its pressure was actually recorded and actually falls in range. The two
 * are answering different questions — "is there anything relevant?" versus
 * "has this condition been tested?" — and the second must not be softened by
 * rows that may not qualify at all.
 */
import type { Family, TestRow } from './types.ts'
import { binFor, HABITAT, O2_BINS } from './evidence.ts'
import { materialKind } from './materials.ts'

export const FAMILIES: Family[] = ['droplet', 'flame-spread', 'burner', 'aerosol']

/** Rows that can be placed on the grid at all. */
const placeable = (t: TestRow) => t.material !== null && t.o2Fraction !== null

/** Strict: unrecorded pressure does not count as compliant. See the file note. */
export const inHabitatAtmosphere = (t: TestRow) =>
  t.o2Fraction !== null &&
  t.o2Fraction >= HABITAT.o2Min &&
  t.pressureAtm !== null &&
  t.pressureAtm <= HABITAT.pressureMaxAtm

// ---------------------------------------------------------------------------
// Tested envelopes
// ---------------------------------------------------------------------------

export interface MaterialEnvelope {
  material: string
  kind: 'solid' | 'liquid' | 'gas' | null
  families: Family[]
  /** Rows with both a canonical material and a numeric oxygen level. */
  testCount: number
  o2Min: number
  o2Max: number
  /**
   * Percentage points between the highest test and the habitat floor.
   * null when the material has been tested at or above it.
   */
  habitatShortfallPoints: number | null
}

/** The oxygen range each material has actually been tested across. */
export function envelopes(tests: TestRow[]): MaterialEnvelope[] {
  const byMaterial = new Map<string, TestRow[]>()
  for (const t of tests.filter(placeable)) {
    const rows = byMaterial.get(t.material!) ?? []
    rows.push(t)
    byMaterial.set(t.material!, rows)
  }

  return [...byMaterial.entries()]
    .map(([material, rows]): MaterialEnvelope => {
      const values = rows.map((r) => r.o2Fraction!)
      const o2Max = Math.max(...values)
      return {
        material,
        kind: materialKind(material),
        families: [...new Set(rows.map((r) => r.family))],
        testCount: rows.length,
        o2Min: Math.min(...values),
        o2Max,
        habitatShortfallPoints:
          o2Max >= HABITAT.o2Min ? null : Number(((HABITAT.o2Min - o2Max) * 100).toFixed(1)),
      }
    })
    .sort((a, b) => b.o2Max - a.o2Max)
}

/**
 * Materials with test rows but no oxygen level recorded anywhere, so they
 * cannot be placed on the grid even as an empty cell. A different kind of gap
 * from "never tested": the test happened and the condition went unrecorded.
 */
export function unplaceableMaterials(tests: TestRow[]): string[] {
  const withO2 = new Set(tests.filter(placeable).map((t) => t.material!))
  const any = new Set(tests.map((t) => t.material).filter((m): m is string => m !== null))
  return [...any].filter((m) => !withO2.has(m)).sort()
}

// ---------------------------------------------------------------------------
// The grid, including its holes
// ---------------------------------------------------------------------------

export interface GapCell {
  material: string
  family: Family
  /** Lower edge of the oxygen bin, mole fraction. */
  o2Bin: number
  count: number
  /** True when count is 0 — the cell is the gap. */
  isGap: boolean
  /** True when this bin sits at or above the habitat oxygen floor. */
  inHabitatBand: boolean
}

/**
 * Every material-family-bin cell, present or absent.
 *
 * Only family-material pairs that exist somewhere in the data get rows: a
 * droplet bin for PMMA is not a gap in the evidence, it is a category error,
 * and filling the grid with those would bury the real holes in noise.
 */
export function gapGrid(tests: TestRow[]): GapCell[] {
  const rows = tests.filter(placeable)

  const counts = new Map<string, number>()
  const pairs = new Set<string>()
  for (const t of rows) {
    pairs.add(`${t.material}|${t.family}`)
    const key = `${t.material}|${t.family}|${binFor(t.o2Fraction!)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const cells: GapCell[] = []
  for (const pair of [...pairs].sort()) {
    const [material, family] = pair.split('|') as [string, Family]
    for (const o2Bin of O2_BINS) {
      const count = counts.get(`${material}|${family}|${o2Bin}`) ?? 0
      cells.push({
        material,
        family,
        o2Bin,
        count,
        isGap: count === 0,
        inHabitatBand: o2Bin >= HABITAT.o2Min,
      })
    }
  }
  return cells
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export interface BandSummary {
  total: number
  byFamily: Partial<Record<Family, number>>
  materials: string[]
  /** Rows at these conditions whose material could not be resolved. */
  unresolvedMaterial: number
  /** Families with no test at all at these conditions. */
  missingFamilies: Family[]
}

function summarise(rows: TestRow[]): BandSummary {
  const byFamily: Partial<Record<Family, number>> = {}
  for (const r of rows) byFamily[r.family] = (byFamily[r.family] ?? 0) + 1

  return {
    total: rows.length,
    byFamily,
    materials: [...new Set(rows.map((r) => r.material).filter((m): m is string => m !== null))].sort(),
    unresolvedMaterial: rows.filter((r) => r.material === null).length,
    missingFamilies: FAMILIES.filter((f) => !byFamily[f]),
  }
}

export interface GapReport {
  envelopes: MaterialEnvelope[]
  unplaceable: string[]
  grid: GapCell[]
  /** Cells that exist as a category but hold no test. */
  gapCount: number
  /** Gaps sitting at or above the habitat oxygen floor. */
  habitatGapCount: number
  /** Oxygen alone: at or above the habitat floor, pressure ignored. */
  o2Band: BandSummary
  /** Both habitat constraints together: oxygen floor AND pressure ceiling. */
  habitatAtmosphere: BandSummary
  /** The highest oxygen level any solid has been tested at. */
  solidCeiling: { o2Max: number; materials: { material: string; o2Max: number }[] }
}

export function gapReport(tests: TestRow[]): GapReport {
  const env = envelopes(tests)
  const grid = gapGrid(tests)
  const gaps = grid.filter((c) => c.isGap)
  const solids = env.filter((e) => e.kind === 'solid')

  return {
    envelopes: env,
    unplaceable: unplaceableMaterials(tests),
    grid,
    gapCount: gaps.length,
    habitatGapCount: gaps.filter((c) => c.inHabitatBand).length,
    o2Band: summarise(
      tests.filter((t) => t.o2Fraction !== null && t.o2Fraction >= HABITAT.o2Min),
    ),
    habitatAtmosphere: summarise(tests.filter(inHabitatAtmosphere)),
    solidCeiling: {
      o2Max: solids.length ? Math.max(...solids.map((s) => s.o2Max)) : 0,
      materials: solids.map((s) => ({ material: s.material, o2Max: s.o2Max })),
    },
  }
}

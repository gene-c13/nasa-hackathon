/**
 * Step 3 of the pipeline: enrich rows with diluent, precompute the coverage
 * grid, and prove the evidence engine behaves.
 *
 * The grading logic itself lives in shared/evidence.ts so the browser runs
 * exactly the same code on live queries. This file applies it once, over the
 * whole dataset, and checks the answers against cases we verified by hand.
 *
 * If a self-test fails, nothing is written. A wrong evidence grade is worse
 * than no dashboard.
 *
 * Run: npm run grade
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Dataset, Family, TestRow } from '../shared/types.ts'
import {
  gradeEvidence,
  canCompare,
  blockReason,
  coverage,
  inHabitatBand,
  GENERIC_INCOMPARABLE_REASON,
  HABITAT,
  INCOMPARABLE,
  pct,
} from '../shared/evidence.ts'
import { FAMILIES } from '../shared/gaps.ts'

const here = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = resolve(here, '../shared/data.json')

// ---------------------------------------------------------------------------
// Diluent
// ---------------------------------------------------------------------------

/**
 * Which inert gas was used to dilute the atmosphere.
 *
 * FLEX and CFI record this as separate mole-fraction columns, one per gas, so
 * the diluent is whichever non-nitrogen column is non-zero. This matters for
 * fire safety: helium and CO2 suppress flames through quite different
 * mechanisms, and the challenge brief calls both out explicitly.
 */
function readDiluent(row: TestRow): string | null {
  const entries = Object.entries(row.raw)

  const valueOf = (pattern: RegExp): number | null => {
    const hit = entries.find(([k]) => pattern.test(k.trim()))
    if (!hit) return null
    const n = Number(String(hit[1]).trim())
    return Number.isFinite(n) ? n : null
  }

  const he = valueOf(/^he\b|helium/i)
  const co2 = valueOf(/^co2?\b.*mole fraction|^co2$/i)
  const n2 = valueOf(/^n\b.*mole fraction|^nitrogen$/i)

  if (he && he > 0) return 'He'
  if (co2 && co2 > 0) return 'CO2'
  if (n2 && n2 > 0) return 'N2'

  // Some tables name the mixture in prose instead.
  const mixture = entries.find(([k]) => /ambient gas mixture/i.test(k))?.[1]
  if (mixture) {
    const m = String(mixture)
    if (/helium|\bhe\b/i.test(m)) return 'He'
    if (/co2|carbon dioxide/i.test(m)) return 'CO2'
    if (/nitrogen|\bn2\b/i.test(m)) return 'N2'
  }
  return null
}

// ---------------------------------------------------------------------------
// Self-tests
// ---------------------------------------------------------------------------

interface Check {
  name: string
  run: (tests: TestRow[]) => { pass: boolean; detail: string }
}

const CHECKS: Check[] = [
  {
    name: 'Nomex at 34% O2 is not measured (habitat question)',
    run: (tests) => {
      const r = gradeEvidence(tests, { material: 'Nomex', o2Fraction: 0.34 })
      return {
        pass: r.grade === 'no-data',
        detail: `grade=${r.grade}, nearest=${r.nearest.length}, caveat="${r.caveat?.slice(0, 80)}..."`,
      }
    },
  },
  {
    name: 'PMMA at 21% O2 is measured',
    run: (tests) => {
      const r = gradeEvidence(tests, { material: 'PMMA', o2Fraction: 0.21 })
      return { pass: r.grade === 'measured', detail: `grade=${r.grade}, matches=${r.matches.length}` }
    },
  },
  {
    name: 'Methanol at 21% O2 is measured',
    run: (tests) => {
      const r = gradeEvidence(tests, { material: 'Methanol', o2Fraction: 0.21 })
      return { pass: r.grade === 'measured', detail: `grade=${r.grade}, matches=${r.matches.length}` }
    },
  },
  {
    name: 'A material absent from PSI returns no-data, not a guess',
    run: (tests) => {
      const r = gradeEvidence(tests, { material: 'Unobtanium', o2Fraction: 0.21 })
      return {
        pass: r.grade === 'no-data' && r.matches.length === 0,
        detail: `grade=${r.grade}, caveat="${r.caveat}"`,
      }
    },
  },
  {
    /**
     * This replaces a check that tested droplet|flame-spread alone — which was
     * the single pair whose table key happened to match the sorted lookup key.
     * It passed on every run while the other five pairs returned the generic
     * fallback instead of their own physics. A test that only exercises the
     * working case buys confidence it has not earned, so this one walks the
     * whole matrix.
     */
    name: 'Every family pair is blocked and gives its own physical reason',
    run: () => {
      const failures: string[] = []
      for (let i = 0; i < FAMILIES.length; i++) {
        for (let j = i + 1; j < FAMILIES.length; j++) {
          const [a, b] = [FAMILIES[i], FAMILIES[j]]
          // Both argument orders: the caller does not sort, so neither may we.
          for (const [x, y] of [[a, b], [b, a]] as const) {
            const v = canCompare(x, y)
            if (v.ok) failures.push(`${x}|${y} was not blocked`)
            else if (v.reason === GENERIC_INCOMPARABLE_REASON) {
              failures.push(`${x}|${y} fell back to the generic reason`)
            }
          }
        }
      }
      const pairs = (FAMILIES.length * (FAMILIES.length - 1)) / 2
      return {
        pass: failures.length === 0,
        detail: failures.length
          ? failures.join('; ')
          : `all ${pairs} pairs blocked with their own reason, in both argument orders`,
      }
    },
  },
  {
    name: 'Every entry in the incomparability table is reachable',
    run: () => {
      const unreachable: string[] = []
      for (const [key, reason] of Object.entries(INCOMPARABLE)) {
        const [a, b] = key.split('|') as [Family, Family]
        if (canCompare(a, b).reason !== reason) unreachable.push(key)
      }
      return {
        pass: unreachable.length === 0,
        detail: unreachable.length
          ? `unreachable: ${unreachable.join(', ')}`
          : `all ${Object.keys(INCOMPARABLE).length} entries resolve to their own text`,
      }
    },
  },
  {
    name: 'A family is always comparable with itself',
    run: () => {
      const bad = FAMILIES.filter((f) => !canCompare(f, f).ok)
      return {
        pass: bad.length === 0,
        detail: bad.length ? `not self-comparable: ${bad.join(', ')}` : FAMILIES.join(', '),
      }
    },
  },
  {
    name: 'Mixing families in one chart is blocked',
    run: (tests) => {
      const mixed = [
        tests.find((t) => t.family === 'droplet')!,
        tests.find((t) => t.family === 'flame-spread')!,
      ]
      const reason = blockReason(mixed)
      return { pass: reason !== null, detail: reason ? 'blocked' : 'NOT BLOCKED' }
    },
  },
  {
    name: 'A single-family set is not blocked',
    run: (tests) => {
      const one = tests.filter((t) => t.family === 'droplet').slice(0, 5)
      return { pass: blockReason(one) === null, detail: 'allowed' }
    },
  },
  {
    name: 'No solid material has been tested in the habitat band',
    run: (tests) => {
      const solids = inHabitatBand(tests).filter((t) => t.family === 'flame-spread')
      return {
        pass: solids.length === 0,
        detail: `${solids.length} flame-spread tests at or above ${pct(HABITAT.o2Min)} O2`,
      }
    },
  },
]

// ---------------------------------------------------------------------------

function main() {
  const dataset = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Dataset

  // ---- Enrich ---------------------------------------------------------------
  let diluentCount = 0
  for (const row of dataset.tests) {
    row.diluent = readDiluent(row)
    if (row.diluent) diluentCount++
  }

  // ---- Coverage -------------------------------------------------------------
  dataset.coverage = coverage(dataset.tests)

  // ---- Self-tests -----------------------------------------------------------
  console.log('Evidence engine self-tests\n')
  let failed = 0
  for (const check of CHECKS) {
    const { pass, detail } = check.run(dataset.tests)
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${check.name}`)
    console.log(`        ${detail}`)
    if (!pass) failed++
  }

  if (failed) {
    console.error(`\n${failed} self-test(s) failed. Not writing data.json.`)
    process.exit(1)
  }

  writeFileSync(DATA_FILE, JSON.stringify(dataset, null, 2))

  // ---- Report ---------------------------------------------------------------
  const withMaterial = dataset.tests.filter((t) => t.material !== null)
  const band = inHabitatBand(dataset.tests)
  const byFamily = new Map<string, number>()
  for (const t of band) byFamily.set(t.family, (byFamily.get(t.family) ?? 0) + 1)

  console.log('\n' + '─'.repeat(60))
  console.log(`Rows:              ${dataset.tests.length}`)
  console.log(`  with material:   ${withMaterial.length}`)
  console.log(`  with diluent:    ${diluentCount}`)
  console.log(`Coverage cells:    ${dataset.coverage.length}`)
  console.log(`\n${HABITAT.label}`)
  console.log(`  tests in band:   ${band.length}`)
  for (const [family, n] of [...byFamily].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${family.padEnd(14)} ${n}`)
  }

  const materials = [...new Set(withMaterial.map((t) => t.material!))].sort()
  console.log(`\nMaterials (${materials.length}): ${materials.join(', ')}`)
}

main()

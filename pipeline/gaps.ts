/**
 * The gap report: what nobody has measured.
 *
 * Read-only. It writes an audit file and nothing else — no step of the build
 * depends on it, and it never touches data.json. Its job is to state the
 * project's central claims in numbers that come from the rows rather than from
 * memory, and to fail loudly if any of them stop being true.
 *
 * Those claims are what the pitch rests on, so they are self-tests rather than
 * printed figures. A number quoted on stage that the data no longer supports
 * is the worst outcome here, worse than a missing feature.
 *
 * The logic lives in shared/gaps.ts so the browser computes the same gaps from
 * the same rows.
 *
 * Run: npm run gaps
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Dataset, TestRow } from '../shared/types.ts'
import { HABITAT, pct } from '../shared/evidence.ts'
import { gapReport, type GapReport } from '../shared/gaps.ts'

const here = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = resolve(here, '../shared/data.json')
const AUDIT_FILE = resolve(here, 'out/audit-gaps.txt')

interface Check {
  name: string
  run: (report: GapReport, tests: TestRow[]) => { pass: boolean; detail: string }
}

/**
 * Every figure the pitch quotes. If one of these fails, the claim is wrong and
 * the slide needs changing — not the test.
 */
const CHECKS: Check[] = [
  {
    name: 'No solid has been tested in microgravity above 22.2% oxygen',
    run: (r) => ({
      pass: r.solidCeiling.o2Max <= 0.222,
      detail: `ceiling ${pct(r.solidCeiling.o2Max)} — ` +
        r.solidCeiling.materials.map((m) => `${m.material} ${pct(m.o2Max)}`).join(', '),
    }),
  },
  {
    name: 'The habitat oxygen floor sits above every solid ever tested',
    run: (r) => ({
      pass: HABITAT.o2Min > r.solidCeiling.o2Max,
      detail: `habitat floor ${pct(HABITAT.o2Min)} vs solid ceiling ${pct(r.solidCeiling.o2Max)} — ` +
        `a gap of ${((HABITAT.o2Min - r.solidCeiling.o2Max) * 100).toFixed(1)} percentage points`,
    }),
  },
  {
    name: 'No flame-spread test exists at or above the habitat oxygen floor',
    run: (r) => ({
      pass: !r.o2Band.byFamily['flame-spread'],
      detail: `${r.o2Band.total} tests at or above ${pct(HABITAT.o2Min)}: ` +
        Object.entries(r.o2Band.byFamily).map(([f, n]) => `${f} ${n}`).join(', ') +
        `; missing entirely: ${r.o2Band.missingFamilies.join(', ')}`,
    }),
  },
  {
    name: 'Inside the full habitat atmosphere, only burner flames have been tested',
    run: (r) => ({
      pass:
        r.habitatAtmosphere.total > 0 &&
        Object.keys(r.habitatAtmosphere.byFamily).every((f) => f === 'burner'),
      detail: `${r.habitatAtmosphere.total} tests meet both constraints ` +
        `(${HABITAT.label}): ` +
        Object.entries(r.habitatAtmosphere.byFamily).map(([f, n]) => `${f} ${n}`).join(', ') +
        `; materials: ${r.habitatAtmosphere.materials.join(', ') || 'none resolved'}`,
    }),
  },
  {
    name: 'No solid or liquid has been tested in the full habitat atmosphere',
    run: (r) => ({
      pass: r.habitatAtmosphere.materials.every((m) =>
        ['Ethane', 'Propane', 'Butane', 'Ethylene', 'Methane', 'Propylene', 'Hydrogen'].includes(m),
      ),
      detail: `materials present: ${r.habitatAtmosphere.materials.join(', ') || 'none resolved'}`,
    }),
  },
  {
    name: 'Applying the pressure ceiling removes most of the oxygen band',
    run: (r) => ({
      pass: r.habitatAtmosphere.total < r.o2Band.total,
      detail: `${r.o2Band.total} tests clear the oxygen floor, but only ` +
        `${r.habitatAtmosphere.total} also clear the ${(HABITAT.pressureMaxAtm).toFixed(3)} atm ceiling`,
    }),
  },
  {
    name: 'Some materials cannot be placed on the grid at all',
    run: (r) => ({
      pass: r.unplaceable.length > 0,
      detail: `${r.unplaceable.length} materials have test rows but no oxygen level ` +
        `recorded anywhere: ${r.unplaceable.join(', ')}`,
    }),
  },
  {
    name: 'The grid has more holes than filled cells',
    run: (r) => ({
      pass: r.gapCount > r.grid.length - r.gapCount,
      detail: `${r.gapCount} empty of ${r.grid.length} cells ` +
        `(${r.habitatGapCount} of them at or above the habitat oxygen floor)`,
    }),
  },
]

function main() {
  const dataset = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Dataset
  const report = gapReport(dataset.tests)

  const lines: string[] = []
  const say = (s = '') => {
    lines.push(s)
    console.log(s)
  }

  say('Coverage gap report')
  say(`Generated from data.json built ${dataset.meta.generatedAt}`)
  say('='.repeat(78))

  say('\nTESTED ENVELOPE PER MATERIAL')
  say('(rows with both a canonical material and a recorded oxygen level)\n')
  say(`  ${'material'.padEnd(18)}${'kind'.padEnd(9)}${'n'.padStart(5)}` +
    `${'min O2'.padStart(9)}${'max O2'.padStart(9)}   short of habitat`)
  for (const e of report.envelopes) {
    const short =
      e.habitatShortfallPoints === null
        ? 'reaches it'
        : `${e.habitatShortfallPoints.toFixed(1)} points`
    say(`  ${e.material.padEnd(18)}${String(e.kind ?? '?').padEnd(9)}` +
      `${String(e.testCount).padStart(5)}${pct(e.o2Min).padStart(9)}${pct(e.o2Max).padStart(9)}` +
      `   ${short}`)
  }

  say('\nMATERIALS THAT CANNOT BE PLACED ON THE GRID')
  say('(tested, but no oxygen level recorded in any row)\n')
  say(`  ${report.unplaceable.join(', ')}`)

  say(`\n${HABITAT.label.toUpperCase()}`)
  say(`\n  Oxygen floor alone (>= ${pct(HABITAT.o2Min)}):`)
  say(`    tests:              ${report.o2Band.total}`)
  for (const [f, n] of Object.entries(report.o2Band.byFamily)) say(`      ${f.padEnd(14)}${n}`)
  say(`    unresolved material: ${report.o2Band.unresolvedMaterial}`)
  say(`    families absent:     ${report.o2Band.missingFamilies.join(', ')}`)

  say(`\n  Both constraints (>= ${pct(HABITAT.o2Min)} and <= ${HABITAT.pressureMaxAtm.toFixed(3)} atm):`)
  say(`    tests:              ${report.habitatAtmosphere.total}`)
  for (const [f, n] of Object.entries(report.habitatAtmosphere.byFamily)) {
    say(`      ${f.padEnd(14)}${n}`)
  }
  say(`    unresolved material: ${report.habitatAtmosphere.unresolvedMaterial}`)
  say(`    materials:           ${report.habitatAtmosphere.materials.join(', ') || 'none resolved'}`)
  say(`    families absent:     ${report.habitatAtmosphere.missingFamilies.join(', ')}`)

  say('\nGRID')
  say(`  cells:            ${report.grid.length}`)
  say(`  empty:            ${report.gapCount}`)
  say(`  empty at or above the habitat oxygen floor: ${report.habitatGapCount}`)

  say('\n' + '='.repeat(78))
  say('SELF-TESTS — every claim the pitch makes\n')

  let failed = 0
  for (const check of CHECKS) {
    const { pass, detail } = check.run(report, dataset.tests)
    say(`  ${pass ? 'PASS' : 'FAIL'}  ${check.name}`)
    say(`        ${detail}`)
    if (!pass) failed++
  }

  writeFileSync(AUDIT_FILE, lines.join('\n') + '\n')
  say(`\nWritten to ${AUDIT_FILE}`)

  if (failed) {
    console.error(`\n${failed} self-test(s) failed. A claim in the pitch is no longer true.`)
    process.exit(1)
  }
}

main()

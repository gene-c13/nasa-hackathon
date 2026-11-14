/**
 * Step 2 of the pipeline: turn 22 differently-shaped CSVs into one TestRow[].
 *
 * Design rules, in priority order:
 *   1. Never invent a value. A field we cannot read confidently stays null.
 *   2. Units are decided by the data, not the column name (see units.ts).
 *   3. Keep every original value in `raw` so the UI can show provenance.
 *   4. Report everything that looked odd. A silent pipeline is an untrustworthy one.
 *
 * Run: npm run normalize
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import type {
  TestRow,
  Outcome,
  Investigation,
  Dataset,
} from '../shared/types.ts'
import { DOMAIN, HAS_OUTCOME, OUTCOME_CODES } from './domain.ts'
import {
  tidy,
  toNumber,
  isSectionRow,
  inferO2Unit,
  inferPressureUnit,
  toMoleFraction,
  toAtm,
} from './units.ts'

const here = dirname(fileURLToPath(import.meta.url))
const CSV_DIR = resolve(here, 'out/csv')
const OUT_FILE = resolve(here, 'out/tests.json')
const INV_DIR = resolve(here, 'out/investigations')
const DATA_FILE = resolve(here, '../shared/data.json')

/**
 * Column patterns, matched against whitespace-tidied, lowercased headers.
 * Order matters: the first match wins, so more specific patterns come first.
 */
const PATTERNS = {
  o2: [/^xo2$/, /^xo2 \(init\)$/, /^xo2 before test$/, /mole fraction.*o|^o initial ambient/, /o2 % by vol/, /percent o2/, /oxygen conc/, /^oxygen mole fraction$/, /^oxygen$/],
  pressure: [/ambient pressure/, /^pinit/, /^pmean/, /approx p/, /^pressure$/],
  fuel: [/^fuel$/, /^fuel type$/, /^fuel sample material$/, /^sample \(fuel type\)$/, /^sample material$/, /^material$/, /^sample type$/, /^fuel bottle$/],
  flow: [/air flow/, /air rate/, /inlet velocity/, /flow velocity/],
  size: [/droplet initial diameter/, /initial droplet diameter/, /sample thickness/, /saml?e thickness/, /^nozzle/, /burner size/],
  rate: [/burning rate/, /burnrate/, /^mhc /, /weight loss rate/, /spread rate/],
  outcome: [/^test end$/, /self ?-?ext or flow term/],
} as const

/** Find the first header matching any pattern in the list. */
function findColumn(headers: string[], patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const hit = headers.find((h) => pattern.test(tidy(h).toLowerCase()))
    if (hit) return hit
  }
  return null
}

/** Collect numeric values from one column, for unit inference. */
const columnValues = (rows: Record<string, string>[], col: string | null): number[] =>
  col === null
    ? []
    : rows.map((r) => toNumber(r[col])).filter((n): n is number => n !== null)

/**
 * Map an outcome cell to our vocabulary.
 * Anything we do not recognise becomes 'unknown' rather than a guess.
 */
function readOutcome(value: string | undefined, accession: string): Outcome {
  if (!HAS_OUTCOME.has(accession) || !value) return 'unknown'

  const key = tidy(value).toLowerCase()
  if (!key || key === '-') return 'unknown'

  const codes = OUTCOME_CODES[accession]
  if (codes?.[key]) return codes[key]

  // Unrecognised value: record it as unknown and surface it, rather than
  // guessing at what the experimenters meant.
  unrecognisedOutcomes.add(`${accession}: ${JSON.stringify(value)}`)
  return 'unknown'
}

const unrecognisedOutcomes = new Set<string>()

interface Warning {
  accession: string
  file: string
  message: string
}

const warnings: Warning[] = []
const auditLines: string[] = []

function processFile(path: string): TestRow[] {
  const file = basename(path)
  const accession = file.split('__')[0]
  const domain = DOMAIN[accession]

  if (!domain) {
    warnings.push({ accession, file, message: 'No domain entry — skipped' })
    return []
  }

  const parsed = Papa.parse<Record<string, string>>(readFileSync(path, 'utf8'), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h, // keep originals verbatim for provenance
  })

  const columnCount = Object.keys(parsed.data[0] ?? {}).filter(Boolean).length
  const allRows = parsed.data.filter((r) => Object.values(r).some((v) => v?.trim()))
  const rows = allRows.filter((r) => !isSectionRow(r, columnCount))

  const skipped = allRows.length - rows.length
  if (skipped > 0) {
    auditLines.push(`  (skipped ${skipped} section/banner row${skipped === 1 ? '' : 's'})`)
  }

  if (!rows.length) {
    warnings.push({ accession, file, message: 'No data rows' })
    return []
  }

  const headers = Object.keys(rows[0]).filter(Boolean)

  const cols = {
    o2: findColumn(headers, PATTERNS.o2),
    pressure: findColumn(headers, PATTERNS.pressure),
    fuel: findColumn(headers, PATTERNS.fuel),
    flow: findColumn(headers, PATTERNS.flow),
    size: findColumn(headers, PATTERNS.size),
    rate: findColumn(headers, PATTERNS.rate),
    outcome: findColumn(headers, PATTERNS.outcome),
  }

  // ---- Unit inference, with the declared-vs-observed cross-check ------------
  const o2Verdict = cols.o2
    ? inferO2Unit(cols.o2, columnValues(rows, cols.o2))
    : null
  const pVerdict = cols.pressure
    ? inferPressureUnit(cols.pressure, columnValues(rows, cols.pressure))
    : null

  auditLines.push(`\n${accession}  ${file}`)
  auditLines.push(`  rows: ${rows.length}`)
  if (o2Verdict) {
    const flag = o2Verdict.agrees ? ' ' : '!'
    auditLines.push(
      `  ${flag} O2       ${JSON.stringify(cols.o2)} -> ${o2Verdict.unit ?? 'UNRESOLVED'}`,
    )
    auditLines.push(`      ${o2Verdict.reason}`)
    if (!o2Verdict.agrees) {
      warnings.push({ accession, file, message: `O2 ${o2Verdict.reason}` })
    }
  } else {
    auditLines.push('    O2       none')
  }
  if (pVerdict) {
    const flag = pVerdict.agrees ? ' ' : '!'
    auditLines.push(
      `  ${flag} pressure ${JSON.stringify(cols.pressure)} -> ${pVerdict.unit ?? 'UNRESOLVED'}`,
    )
    auditLines.push(`      ${pVerdict.reason}`)
    if (!pVerdict.agrees) {
      warnings.push({ accession, file, message: `pressure ${pVerdict.reason}` })
    }
  }

  // ---- Build rows -----------------------------------------------------------
  return rows.map((row, i): TestRow => {
    const o2Raw = cols.o2 ? toNumber(row[cols.o2]) : null
    const pRaw = cols.pressure ? toNumber(row[cols.pressure]) : null

    const o2Fraction =
      o2Raw === null ? null : toMoleFraction(o2Raw, o2Verdict?.unit ?? null)
    // A recorded pressure of 0 is a missing-data sentinel, not a vacuum.
    // PSI-69 row 114 carries '0' in the mmHg column.
    const pressureAtm =
      pRaw === null || pRaw <= 0 ? null : toAtm(pRaw, pVerdict?.unit ?? null)

    const fuel = cols.fuel ? tidy(row[cols.fuel] ?? '') : ''

    return {
      id: `${accession}-${String(i + 1).padStart(4, '0')}`,
      accession,
      fuel: fuel || 'unspecified',
      phase: domain.phase,
      family: domain.family,
      o2Fraction,
      pressureAtm,
      flowCmS: cols.flow ? toNumber(row[cols.flow]) : null,
      diluent: null, // filled by grade.ts where the table records one
      sampleSizeMm: cols.size ? toNumber(row[cols.size]) : null,
      burningRate: cols.rate ? toNumber(row[cols.rate]) : null,
      outcome: readOutcome(cols.outcome ? row[cols.outcome] : undefined, accession),
      raw: row,
      sourceFile: file,
      sourceO2Column: cols.o2,
      // Low confidence when we could not resolve the unit we were converting.
      confidence: o2Raw !== null && o2Fraction === null ? 'low' : 'high',
    }
  })
}

/**
 * Build the investigation list from the cached PSI records.
 *
 * `summary` and `tags` are left empty here and filled by enrich.ts, which is
 * the only step that calls an LLM. Keeping generation out of this file means
 * normalize.ts is fully deterministic: same input, same output, every time.
 */
const round3 = (n: number) => Math.round(n * 1000) / 1000

function buildInvestigations(tests: TestRow[]): Investigation[] {
  const byAccession = new Map<string, TestRow[]>()
  for (const t of tests) {
    const list = byAccession.get(t.accession) ?? []
    list.push(t)
    byAccession.set(t.accession, list)
  }

  return readdirSync(INV_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f): Investigation => {
      const r = JSON.parse(readFileSync(resolve(INV_DIR, f), 'utf8'))
      const rows = byAccession.get(r.accession) ?? []
      const o2 = rows
        .map((t) => t.o2Fraction)
        .filter((v): v is number => v !== null)

      return {
        accession: r.accession,
        acronym: r.investigationAcronym || r.accession,
        title: r.title ?? '',
        doi: r.doi ?? '',
        platform: r.flightProgram || r.projectType || '',
        hardware: r.experimentHardware ?? '',
        family: DOMAIN[r.accession]?.family ?? 'burner',
        objective: r.objective ?? '',
        summary: '', // enrich.ts
        tags: [], // enrich.ts
        testCount: rows.length,
        // Rounded: this is a display aggregate, not a measurement. Individual
        // test rows keep full source precision.
        o2Range: o2.length
          ? [round3(Math.min(...o2)), round3(Math.max(...o2))]
          : null,
        hasOutcomeData: rows.some((t) => t.outcome !== 'unknown'),
        publications: (r.publications ?? [])
          .map((p: { title?: string; doi?: string }) => ({
            title: p.title ?? '',
            doi: p.doi ?? '',
          }))
          .filter((p: { title: string }) => p.title),
      }
    })
    .sort((a, b) => b.testCount - a.testCount)
}

function main() {
  const files = readdirSync(CSV_DIR)
    .filter((f) => f.endsWith('.csv'))
    .sort()

  console.log(`Normalising ${files.length} tables...`)

  const tests = files.flatMap((f) => processFile(resolve(CSV_DIR, f)))

  // ---- Assertions: fail loudly rather than ship a bad dataset ---------------
  const problems: string[] = []

  for (const t of tests) {
    if (t.o2Fraction !== null && (t.o2Fraction < 0 || t.o2Fraction > 1)) {
      problems.push(`${t.id}: o2Fraction ${t.o2Fraction} outside 0–1`)
    }
    if (t.pressureAtm !== null && (t.pressureAtm < 0 || t.pressureAtm > 10)) {
      problems.push(`${t.id}: pressureAtm ${t.pressureAtm} implausible`)
    }
  }

  const investigations = buildInvestigations(tests)

  const dataset: Dataset = {
    investigations,
    tests,
    meta: {
      generatedAt: new Date().toISOString(),
      investigationCount: investigations.length,
      testCount: tests.length,
      numericO2Count: tests.filter((t) => t.o2Fraction !== null).length,
      source: 'NASA Physical Science Informatics (PSI)',
      license: 'CC0-1.0',
    },
  }

  writeFileSync(resolve(here, 'out/audit-units.txt'), auditLines.join('\n'))
  writeFileSync(OUT_FILE, JSON.stringify(tests, null, 2))
  writeFileSync(DATA_FILE, JSON.stringify(dataset, null, 2))

  const withO2 = tests.filter((t) => t.o2Fraction !== null)
  const withOutcome = tests.filter((t) => t.outcome !== 'unknown')

  console.log('\n' + '─'.repeat(60))
  console.log(`Test rows:        ${tests.length}`)
  console.log(`With numeric O2:  ${withO2.length}`)
  console.log(`With an outcome:  ${withOutcome.length}`)
  console.log(`Warnings:         ${warnings.length}`)
  console.log(`Investigations:   ${investigations.length}`)
  console.log(`  with tests:     ${investigations.filter((i) => i.testCount > 0).length}`)
  console.log(`\nUnit audit:       out/audit-units.txt`)
  console.log(`Rows:             out/tests.json`)
  console.log(`Dataset:          shared/data.json`)

  if (withO2.length) {
    const vals = withO2.map((t) => t.o2Fraction!)
    console.log(
      `\nO2 across all investigations: ${Math.min(...vals).toFixed(3)} – ${Math.max(...vals).toFixed(3)} mole fraction`,
    )
  }

  if (unrecognisedOutcomes.size) {
    console.log('\nUnrecognised outcome values (left as unknown):')
    for (const u of unrecognisedOutcomes) console.log(`  ${u}`)
  }

  if (warnings.length) {
    console.log('\nWarnings:')
    for (const w of warnings) console.log(`  ${w.accession.padEnd(8)} ${w.message}`)
  }

  if (problems.length) {
    console.error('\nASSERTION FAILURES:')
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`)
    console.error(`\n${problems.length} rows failed validation. Not shipping this.`)
    process.exit(1)
  }
}

main()

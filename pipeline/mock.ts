/**
 * Generates shared/data.json with a SMALL FAKE dataset.
 *
 * Purpose: unblock Role B on hour 1 so the UI can be built before the real
 * pipeline exists. Shapes are identical to the real output, so swapping in
 * real data later changes no UI code.
 *
 * Metadata (accessions, DOIs, hardware) is real. Test rows are invented but
 * physically plausible, and deliberately cover all three test families so the
 * comparability guard can be built and demonstrated.
 *
 * Run: npm run mock
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Dataset, Investigation, TestRow, Family } from '../shared/types.ts'
import { canonicalMaterial } from '../shared/materials.ts'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../shared/data.json')

const investigations: Investigation[] = [
  {
    accession: 'PSI-69',
    acronym: 'FLEX',
    title: 'Flame Extinguishment Experiment',
    doi: '10.60555/mbq8-0451',
    platform: 'International Space Station (ISS)',
    hardware: 'Combustion Integrated Rack (CIR) / MDCA',
    family: 'droplet',
    objective:
      'Map the flammability and extinction limits of liquid fuel droplets burning in microgravity across a range of oxygen concentrations and inert diluents.',
    summary:
      'Burned single droplets of methanol and heptane in microgravity to find the oxygen level at which flames go out. One of only three investigations that records an explicit extinction outcome.',
    tags: ['suppression', 'prevention'],
    testCount: 8,
    o2Range: [0.12, 0.34],
    hasOutcomeData: true,
    publications: [
      {
        title: 'Methanol Droplet Combustion in Oxygen-Inert Environments in Microgravity',
        doi: '',
      },
    ],
  },
  {
    accession: 'PSI-25',
    acronym: 'BASS-II',
    title: 'Burning and Suppression of Solids - II',
    doi: '10.60555/bass2-0000',
    platform: 'International Space Station (ISS)',
    hardware: 'Microgravity Science Glovebox (MSG) flow duct',
    family: 'flame-spread',
    objective:
      'Determine flame spread rates and extinction conditions for solid fuel samples in low-speed flows representative of spacecraft ventilation.',
    summary:
      'Burned fabric and plastic samples in a fan-driven flow duct to measure how airflow changes flame spread. Reports oxygen in PERCENT BY VOLUME, unlike most other investigations.',
    tags: ['prevention'],
    testCount: 7,
    o2Range: [0.136, 0.222],
    hasOutcomeData: false,
    publications: [],
  },
  {
    accession: 'PSI-159',
    acronym: 'ACME CFI-G',
    title: 'Advanced Combustion via Microgravity Experiments / Cool Flames Investigation with Gases',
    doi: '10.60555/cfig-0000',
    platform: 'International Space Station (ISS)',
    hardware: 'Combustion Integrated Rack (CIR) / ACME',
    family: 'burner',
    objective:
      'Study cool flame behaviour of gaseous fuels issuing from a spherical burner across a wide range of oxygen concentrations, including inside-out inverse flames.',
    summary:
      'Burned gaseous fuels at oxygen levels up to 85 percent, far above any habitat atmosphere. Highest-oxygen microgravity data available, but the burner geometry makes it a poor proxy for solid material flammability.',
    tags: ['prevention'],
    testCount: 5,
    o2Range: [0.12, 0.85],
    hasOutcomeData: true,
    publications: [],
  },
]

type Seed = {
  acc: string
  fuel: string
  phase: TestRow['phase']
  family: Family
  o2: number
  p: number
  flow: number | null
  diluent: string | null
  size: number | null
  rate: number | null
  outcome: TestRow['outcome']
  o2col: string | null
  /** Raw value as it appears in the source CSV, before unit conversion. */
  rawO2: string
  file: string
}

const seeds: Seed[] = [
  // FLEX — droplet, mole fraction already
  { acc: 'PSI-69', fuel: 'Methanol', phase: 'liquid', family: 'droplet', o2: 0.21, p: 0.997, flow: null, diluent: 'N2', size: 1.69, rate: 0.52, outcome: 'disruption', o2col: 'O initial ambient composition; mole fraction', rawO2: '0.21', file: 'PSI-69_Experimental table_FLEX.csv' },
  { acc: 'PSI-69', fuel: 'Methanol', phase: 'liquid', family: 'droplet', o2: 0.21, p: 1.003, flow: null, diluent: 'N2', size: 1.86, rate: 0.60, outcome: 'extinction', o2col: 'O initial ambient composition; mole fraction', rawO2: '0.21', file: 'PSI-69_Experimental table_FLEX.csv' },
  { acc: 'PSI-69', fuel: 'Methanol', phase: 'liquid', family: 'droplet', o2: 0.17, p: 1.0, flow: null, diluent: 'N2', size: 1.61, rate: 0.58, outcome: 'extinction', o2col: 'O initial ambient composition; mole fraction', rawO2: '0.17', file: 'PSI-69_Experimental table_FLEX.csv' },
  { acc: 'PSI-69', fuel: 'Methanol', phase: 'liquid', family: 'droplet', o2: 0.15, p: 1.0, flow: null, diluent: 'CO2', size: 2.06, rate: 0.44, outcome: 'extinction', o2col: 'O initial ambient composition; mole fraction', rawO2: '0.15', file: 'PSI-69_Experimental table_FLEX.csv' },
  { acc: 'PSI-69', fuel: 'Heptane', phase: 'liquid', family: 'droplet', o2: 0.34, p: 1.0, flow: null, diluent: 'N2', size: 2.41, rate: 0.71, outcome: 'sustained', o2col: 'O initial ambient composition; mole fraction', rawO2: '0.34', file: 'PSI-69_Experimental table_FLEX.csv' },
  { acc: 'PSI-69', fuel: 'Heptane', phase: 'liquid', family: 'droplet', o2: 0.25, p: 1.0, flow: null, diluent: 'He', size: 2.18, rate: 0.63, outcome: 'extinction', o2col: 'O initial ambient composition; mole fraction', rawO2: '0.25', file: 'PSI-69_Experimental table_FLEX.csv' },
  { acc: 'PSI-69', fuel: 'Heptane', phase: 'liquid', family: 'droplet', o2: 0.12, p: 1.0, flow: null, diluent: 'N2', size: 1.95, rate: 0.38, outcome: 'extinction', o2col: 'O initial ambient composition; mole fraction', rawO2: '0.12', file: 'PSI-69_Experimental table_FLEX.csv' },
  { acc: 'PSI-69', fuel: 'Methanol', phase: 'liquid', family: 'droplet', o2: 0.30, p: 1.0, flow: null, diluent: 'N2', size: 2.0, rate: 0.68, outcome: 'sustained', o2col: 'O initial ambient composition; mole fraction', rawO2: '0.30', file: 'PSI-69_Experimental table_FLEX.csv' },

  // BASS-II — flame spread, THE UNIT TRAP: source is percent by volume
  { acc: 'PSI-25', fuel: 'Cotton fabric', phase: 'solid', family: 'flame-spread', o2: 0.222, p: 1.0, flow: 10, diluent: 'N2', size: 2.2, rate: null, outcome: 'unknown', o2col: 'Calibrated  initial O2 % by vol', rawO2: '22.2', file: 'PSI-25_Experimental table_BASS-II.csv' },
  { acc: 'PSI-25', fuel: 'Cotton fabric', phase: 'solid', family: 'flame-spread', o2: 0.210, p: 1.0, flow: 5, diluent: 'N2', size: 2.2, rate: null, outcome: 'unknown', o2col: 'Calibrated  initial O2 % by vol', rawO2: '21.0', file: 'PSI-25_Experimental table_BASS-II.csv' },
  { acc: 'PSI-25', fuel: 'PMMA', phase: 'solid', family: 'flame-spread', o2: 0.198, p: 1.0, flow: 20, diluent: 'N2', size: 5.0, rate: null, outcome: 'unknown', o2col: 'Calibrated  initial O2 % by vol', rawO2: '19.8', file: 'PSI-25_Experimental table_BASS-II.csv' },
  { acc: 'PSI-25', fuel: 'PMMA', phase: 'solid', family: 'flame-spread', o2: 0.175, p: 1.0, flow: 10, diluent: 'N2', size: 5.0, rate: null, outcome: 'unknown', o2col: 'Calibrated  initial O2 % by vol', rawO2: '17.5', file: 'PSI-25_Experimental table_BASS-II.csv' },
  { acc: 'PSI-25', fuel: 'Nomex', phase: 'solid', family: 'flame-spread', o2: 0.215, p: 1.0, flow: 15, diluent: 'N2', size: 3.1, rate: null, outcome: 'unknown', o2col: 'Calibrated  initial O2 % by vol', rawO2: '21.5', file: 'PSI-25_Experimental table_BASS-II.csv' },
  { acc: 'PSI-25', fuel: 'Nomex', phase: 'solid', family: 'flame-spread', o2: 0.160, p: 1.0, flow: 5, diluent: 'N2', size: 3.1, rate: null, outcome: 'unknown', o2col: 'Calibrated  initial O2 % by vol', rawO2: '16.0', file: 'PSI-25_Experimental table_BASS-II.csv' },
  { acc: 'PSI-25', fuel: 'Silicone', phase: 'solid', family: 'flame-spread', o2: 0.136, p: 1.0, flow: 10, diluent: 'N2', size: 4.0, rate: null, outcome: 'unknown', o2col: 'Calibrated  initial O2 % by vol', rawO2: '13.6', file: 'PSI-25_Experimental table_BASS-II.csv' },

  // CFI-G — burner, reaches far above habitat levels
  { acc: 'PSI-159', fuel: 'Propane', phase: 'gas', family: 'burner', o2: 0.85, p: 1.0, flow: null, diluent: 'N2', size: 6.4, rate: 1.2, outcome: 'sustained', o2col: 'XO2', rawO2: '0.85', file: 'PSI-159_Experimental table_CFI-G_Inverse Flames.csv' },
  { acc: 'PSI-159', fuel: 'Propane', phase: 'gas', family: 'burner', o2: 0.60, p: 1.0, flow: null, diluent: 'N2', size: 6.4, rate: 0.95, outcome: 'sustained', o2col: 'XO2', rawO2: '0.60', file: 'PSI-159_Experimental table_CFI-G_Inverse Flames.csv' },
  { acc: 'PSI-159', fuel: 'Propane', phase: 'gas', family: 'burner', o2: 0.40, p: 1.0, flow: null, diluent: 'N2', size: 6.4, rate: 0.70, outcome: 'sustained', o2col: 'XO2', rawO2: '0.40', file: 'PSI-159_Experimental table_CFI-G_Normal Flames.csv' },
  { acc: 'PSI-159', fuel: 'Ethylene', phase: 'gas', family: 'burner', o2: 0.30, p: 1.0, flow: null, diluent: 'N2', size: 6.4, rate: 0.55, outcome: 'sustained', o2col: 'XO2', rawO2: '0.30', file: 'PSI-159_Experimental table_CFI-G_Normal Flames.csv' },
  { acc: 'PSI-159', fuel: 'Ethylene', phase: 'gas', family: 'burner', o2: 0.12, p: 1.0, flow: null, diluent: 'N2', size: 6.4, rate: 0.21, outcome: 'extinction', o2col: 'XO2', rawO2: '0.12', file: 'PSI-159_Experimental table_CFI-G_Normal Flames.csv' },
]

const tests: TestRow[] = seeds.map((s, i) => ({
  id: `${s.acc}-${String(i + 1).padStart(3, '0')}`,
  accession: s.acc,
  fuel: s.fuel,
  material: canonicalMaterial(s.fuel),
  phase: s.phase,
  family: s.family,
  o2Fraction: s.o2,
  pressureAtm: s.p,
  flowCmS: s.flow,
  diluent: s.diluent,
  sampleSizeMm: s.size,
  burningRate: s.rate,
  outcome: s.outcome,
  raw: {
    [s.o2col ?? 'O2']: s.rawO2,
    Fuel: s.fuel,
    MOCK: 'true',
  },
  sourceFile: s.file,
  sourceO2Column: s.o2col,
  confidence: 'high',
}))

const dataset: Dataset = {
  investigations,
  tests,
  coverage: [],
  meta: {
    generatedAt: new Date().toISOString(),
    investigationCount: investigations.length,
    testCount: tests.length,
    numericO2Count: tests.filter((t) => t.o2Fraction !== null).length,
    materialCount: tests.filter((t) => t.material !== null).length,
    source: 'MOCK DATA — not from PSI. Replace via `npm run build`.',
    license: 'CC0-1.0 (real dataset)',
  },
}

// Guard: normalize.ts writes real PSI data to the same path. Overwriting it
// with mock rows by accident would be hard to notice, so require --force.
if (existsSync(OUT) && !process.argv.includes('--force')) {
  const current = JSON.parse(readFileSync(OUT, 'utf8')) as Dataset
  if (!current.meta.source.startsWith('MOCK')) {
    console.error(
      `Refusing to overwrite real data at ${OUT}\n` +
        `  It currently holds ${current.meta.testCount} rows from ${current.meta.source}.\n` +
        `  Re-run with --force if you really want mock data back.`,
    )
    process.exit(1)
  }
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(dataset, null, 2))
console.log(
  `Wrote ${OUT}\n  ${investigations.length} investigations, ${tests.length} tests, ${dataset.meta.numericO2Count} with numeric O2`,
)

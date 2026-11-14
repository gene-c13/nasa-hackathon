/**
 * FROZEN CONTRACT — agreed by both of us.
 * Changing anything here requires both of us to agree, out loud, first.
 *
 * Role A (pipeline) produces data.json against this shape.
 * Role B (web) consumes it. Neither side improvises.
 */

export type Phase = 'solid' | 'liquid' | 'gas'

/**
 * Test families are NOT comparable with each other. A droplet extinction
 * diameter means nothing next to a flame-spread rate. The comparability
 * guard in the UI relies on this field.
 */
export type Family = 'droplet' | 'flame-spread' | 'burner' | 'aerosol'

/** How well the data answers a given question. Never return a number without one. */
export type Grade = 'measured' | 'bounded' | 'no-data'

/**
 * Only PSI-69, PSI-159 and PSI-98 carry usable outcome columns.
 * Everything else is 'unknown' — that is correct, not a gap to fill in.
 */
export type Outcome = 'extinction' | 'sustained' | 'disruption' | 'unknown'

export type Tag = 'prevention' | 'detection' | 'suppression'

export interface TestRow {
  /** Stable id, e.g. "PSI-69-012" */
  id: string
  accession: string
  /** Fuel string exactly as the source CSV spells it. */
  fuel: string
  /**
   * Canonical material, e.g. "PMMA", resolved from `fuel` by materials.ts.
   * null when the row is setup/calibration rather than a burn, or when the
   * material is unrecognised. A null never satisfies an evidence query.
   */
  material: string | null
  phase: Phase
  family: Family

  /** ALWAYS mole fraction 0–1. Percent-by-volume sources are converted upstream. */
  o2Fraction: number | null
  /** ALWAYS atm. mmHg sources are converted upstream. */
  pressureAtm: number | null
  flowCmS: number | null
  /** "N2" | "CO2" | "He" | null */
  diluent: string | null
  sampleSizeMm: number | null
  burningRate: number | null
  outcome: Outcome

  /** Original row verbatim, for the provenance panel. Never rendered as data. */
  raw: Record<string, string>
  sourceFile: string
  /** Original O2 column name, e.g. "Calibrated  initial O2 % by vol" */
  sourceO2Column: string | null
  confidence: 'high' | 'medium' | 'low'
}

export interface Publication {
  title: string
  doi: string
}

export interface Investigation {
  accession: string
  acronym: string
  title: string
  doi: string
  /** e.g. "International Space Station (ISS)" */
  platform: string
  /** e.g. "Combustion Integrated Rack (CIR) / MDCA" */
  hardware: string
  family: Family
  /** Verbatim from PSI. Not paraphrased. */
  objective: string
  /** LLM-written, two sentences, plain English. */
  summary: string
  tags: Tag[]
  testCount: number
  /** Mole fraction [min, max], or null when no numeric O2 exists. */
  o2Range: [number, number] | null
  hasOutcomeData: boolean
  publications: Publication[]
}

/** Result of an evidence lookup. */
export interface EvidenceResult {
  grade: Grade
  /** Direct hits at the requested conditions. */
  matches: TestRow[]
  /** Populated when grade is 'no-data': closest available evidence. */
  nearest: TestRow[]
  /** Why `nearest` may not transfer. Shown verbatim in the UI. */
  caveat: string | null
}

/** One cell of the coverage grid: a material at an oxygen level. */
export interface CoverageCell {
  material: string
  family: Family
  /** Lower edge of the oxygen bin, mole fraction. */
  o2Bin: number
  count: number
  /** Outcome tallies within the cell. */
  outcomes: Record<string, number>
}

export interface Dataset {
  investigations: Investigation[]
  tests: TestRow[]
  /** Precomputed by grade.ts for the gap map. */
  coverage: CoverageCell[]
  meta: {
    generatedAt: string
    /** Counts we quote in the pitch — generated, never hand-typed. */
    investigationCount: number
    testCount: number
    numericO2Count: number
    /** Rows resolved to a canonical material. */
    materialCount: number
    source: string
    license: string
  }
}

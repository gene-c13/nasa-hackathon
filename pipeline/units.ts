/**
 * Unit inference, and the safeguard that makes it trustworthy.
 *
 * The problem: PSI tables disagree about units for the same quantity.
 * Oxygen appears as 'XO2' (mole fraction, 0–1), 'Percent O2' (0–100) and
 * 'Calibrated  initial O2 % by vol ' (0–100, with stray whitespace).
 * Pressure appears in atm, bar and mmHg.
 *
 * The naive fix is to read the unit off the column name. That fails silently
 * whenever a name is missing, abbreviated or wrong, and a silent failure here
 * puts 22.2 and 0.34 in the same column.
 *
 * So we do two independent things and compare them:
 *   1. DECLARED — what the column name claims.
 *   2. OBSERVED — what the actual spread of values can physically be.
 *
 * When they disagree we trust OBSERVED, because values are measurements and
 * names are just labels, and we report the disagreement loudly rather than
 * resolving it quietly.
 */

export type O2Unit = 'fraction' | 'percent'
export type PressureUnit = 'atm' | 'bar' | 'mmHg'

export interface UnitVerdict<U> {
  unit: U | null
  declared: U | null
  observed: U | null
  agrees: boolean
  /** Human-readable, printed in the audit report. */
  reason: string
}

/** Collapse runs of whitespace and trim. Source headers are not tidy. */
export const tidy = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Parse a cell to a number — strictly.
 *
 * An earlier, permissive version stripped every non-numeric character and
 * parsed what was left. That turned the section-header cell "LOW O2" into 2,
 * and the multi-level cell "21; 26.5; 40" into 2126.54. Both sailed through
 * as plausible-looking numbers.
 *
 * So: accept only a clean numeric literal, with an optional trailing percent
 * sign. Anything containing letters, separators or multiple numbers is not a
 * single measurement and returns null. A null here is a visible gap in the
 * dashboard; a wrong number is an invisible lie.
 */
const NUMERIC = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*%?$/

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const raw = String(value).trim()
  if (!raw) return null
  if (!NUMERIC.test(raw)) return null

  const n = Number(raw.replace(/\s*%$/, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Is this a section-header or separator row rather than a measurement?
 *
 * PSI-10's inverse-flame table groups tests under banner rows such as
 * "LOW O2" with every other cell blank. They are formatting, not data.
 */
export function isSectionRow(row: Record<string, string>, columnCount: number): boolean {
  if (columnCount <= 2) return false // genuinely narrow tables, e.g. PSI-106
  const filled = Object.values(row).filter((v) => v !== null && String(v).trim()).length
  return filled <= 1
}

/** What the column name claims about oxygen units. */
function declaredO2(header: string): O2Unit | null {
  const h = tidy(header).toLowerCase()
  if (/%|percent/.test(h)) return 'percent'
  if (/mole fraction|^xo2\b|^x o2\b/.test(h)) return 'fraction'
  if (/^oxygen$/.test(h)) return 'fraction' // PSI-39 CFI, values confirm
  return null
}

/**
 * What the values can physically be.
 *
 * Oxygen mole fraction cannot exceed 1. Percent-by-volume above a few units
 * cannot be a fraction. The band between is genuinely ambiguous, so we say so
 * rather than guess.
 */
function observedO2(values: number[]): { unit: O2Unit | null; reason: string } {
  if (!values.length) return { unit: null, reason: 'no numeric values' }
  const max = Math.max(...values)
  const min = Math.min(...values)

  if (max > 1.5) return { unit: 'percent', reason: `max ${max} exceeds 1, must be percent` }
  if (max <= 1.0) return { unit: 'fraction', reason: `max ${max} within 0–1, mole fraction` }
  return { unit: null, reason: `ambiguous range ${min}–${max}` }
}

export function inferO2Unit(header: string, values: number[]): UnitVerdict<O2Unit> {
  const declared = declaredO2(header)
  const { unit: observed, reason } = observedO2(values)
  const unit = observed ?? declared
  const agrees = declared === null || observed === null || declared === observed

  return {
    unit,
    declared,
    observed,
    agrees,
    reason: agrees
      ? reason
      : `MISMATCH: name says ${declared}, values say ${observed} (${reason})`,
  }
}

/** Convert whatever we found into mole fraction, the single stored unit. */
export function toMoleFraction(value: number, unit: O2Unit | null): number | null {
  // Physical bounds. PSI-20 contains cells reading "3400%", which parse
  // cleanly but cannot be an oxygen concentration. Reject rather than store.
  if (unit === 'fraction') return value >= 0 && value <= 1 ? value : null
  if (unit === 'percent') return value >= 0 && value <= 100 ? value / 100 : null
  return null
}

function declaredPressure(header: string): PressureUnit | null {
  const h = tidy(header).toLowerCase()
  if (/mmhg|torr/.test(h)) return 'mmHg'
  if (/\bbar\b/.test(h)) return 'bar'
  if (/\batm\b/.test(h)) return 'atm'
  return null
}

/**
 * Pressure is easier: atmospheric values in mmHg sit near 760, while in atm or
 * bar they sit near 1. Those are three orders of magnitude apart, so the
 * observed check is decisive.
 */
function observedPressure(values: number[]): { unit: PressureUnit | null; reason: string } {
  if (!values.length) return { unit: null, reason: 'no numeric values' }
  const max = Math.max(...values)
  if (max > 50) return { unit: 'mmHg', reason: `max ${max} is mmHg-scale` }
  if (max <= 10) return { unit: 'atm', reason: `max ${max} is atm/bar-scale` }
  return { unit: null, reason: `ambiguous max ${max}` }
}

export function inferPressureUnit(
  header: string,
  values: number[],
): UnitVerdict<PressureUnit> {
  const declared = declaredPressure(header)
  const { unit: observed, reason } = observedPressure(values)

  // bar and atm differ by 1.3%, well inside experimental scatter here, so the
  // observed test cannot separate them. Prefer the declared name when it is
  // one of the two.
  const unit =
    observed === 'atm' && (declared === 'bar' || declared === 'atm')
      ? declared
      : (observed ?? declared)

  const agrees =
    declared === null ||
    observed === null ||
    declared === observed ||
    (observed === 'atm' && declared === 'bar')

  return {
    unit,
    declared,
    observed,
    agrees,
    reason: agrees
      ? reason
      : `MISMATCH: name says ${declared}, values say ${observed} (${reason})`,
  }
}

const MMHG_PER_ATM = 760.0
/** 1 bar = 0.986923 atm */
const ATM_PER_BAR = 0.986923

export function toAtm(value: number, unit: PressureUnit | null): number | null {
  if (unit === 'atm') return value
  if (unit === 'bar') return value * ATM_PER_BAR
  if (unit === 'mmHg') return value / MMHG_PER_ATM
  return null
}

/**
 * Domain knowledge about the 24 combustion investigations.
 *
 * This is physics, not data processing, so it lives apart from normalize.ts
 * and is small enough to review by hand. Getting `family` wrong is the most
 * consequential error in the pipeline: it is what the comparability guard
 * keys off, and a wrong value causes the UI to pool results that cannot be
 * compared.
 *
 * Families, and why they do not mix:
 *   droplet      a free liquid sphere burning in still gas. Produces extinction
 *                diameters and burning-rate constants.
 *   flame-spread a flame crawling across a solid sample in a forced flow.
 *                Produces spread rates, and depends strongly on flow speed.
 *   burner       fuel issuing from a nozzle or porous sphere. Flame is anchored
 *                and sustained by the feed, so "did it stay lit" means something
 *                quite different from the other two.
 *   aerosol      smoke and particulate measurement, not flame behaviour at all.
 *
 * A droplet extinction diameter and a flame-spread rate are not two readings of
 * the same quantity. Plotting them on one axis is the error we are guarding against.
 */
import type { Family, Phase } from '../shared/types.ts'

export interface DomainInfo {
  family: Family
  phase: Phase
  /** Shown in the UI when a comparison is blocked. */
  note?: string
}

export const DOMAIN: Record<string, DomainInfo> = {
  // Liquid droplets in the MDCA
  'PSI-69': { family: 'droplet', phase: 'liquid' },
  'PSI-68': { family: 'droplet', phase: 'liquid' },
  'PSI-39': { family: 'droplet', phase: 'liquid' },
  'PSI-117': { family: 'droplet', phase: 'liquid', note: 'CFD study of FLEX data, not new tests' },
  'PSI-142': { family: 'droplet', phase: 'liquid', note: 'Ground study, summary table only' },

  // Solid samples in forced flow
  'PSI-26': { family: 'flame-spread', phase: 'solid' },
  'PSI-25': { family: 'flame-spread', phase: 'solid' },
  'PSI-98': { family: 'flame-spread', phase: 'solid' },
  'PSI-99': { family: 'flame-spread', phase: 'solid' },
  'PSI-100': { family: 'flame-spread', phase: 'solid' },
  'PSI-62': { family: 'flame-spread', phase: 'solid', note: 'Modelling study, no tests' },

  // Gaseous fuel from a burner
  'PSI-10': { family: 'burner', phase: 'gas' },
  'PSI-20': { family: 'burner', phase: 'gas', note: 'BRE emulates solid flammability with gaseous fuel' },
  'PSI-21': { family: 'burner', phase: 'gas' },
  'PSI-22': { family: 'burner', phase: 'gas' },
  'PSI-23': { family: 'burner', phase: 'gas' },
  'PSI-159': { family: 'burner', phase: 'gas' },
  'PSI-107': { family: 'burner', phase: 'gas' },
  'PSI-106': { family: 'burner', phase: 'gas' },
  'PSI-60': { family: 'burner', phase: 'gas', note: 'Analysis of SPICE data, no new tests' },

  // Smoke and particulate
  'PSI-102': { family: 'aerosol', phase: 'solid' },
  'PSI-101': { family: 'aerosol', phase: 'solid' },
  'PSI-47': { family: 'aerosol', phase: 'solid' },
  'PSI-115': { family: 'aerosol', phase: 'solid', note: 'Analysis of SAME data, no new tests' },
}

/**
 * Only these two tables record what actually happened to the flame on a
 * per-test basis.
 *
 * Several others carry a "Flames Ignited" column, but that is a count of
 * flames produced during a session, not the fate of one test. Reading it as
 * an outcome would manufacture data that is not there, so we do not.
 */
export const HAS_OUTCOME = new Set(['PSI-69', 'PSI-159'])

/**
 * How each table spells its outcomes.
 *
 * PSI-159 uses two-letter codes that mean the opposite of what a naive
 * keyword match assumes:
 *   SE  self-extinguished — the flame went out on its own
 *   FT  flow terminated   — the flame was still burning when the fuel feed
 *                           was cut, so it did NOT go out
 *   -   not recorded
 *
 * Matching "ext" against "Self -ext or flow term" would have tagged every row
 * in that table as an extinction, including the 89 that sustained. The
 * distinction is the entire point of a flammability dataset, so the codes are
 * decoded explicitly, per table, rather than by keyword.
 */
export const OUTCOME_CODES: Record<string, Record<string, 'extinction' | 'sustained' | 'disruption'>> = {
  'PSI-159': {
    se: 'extinction',
    ft: 'sustained',
  },
  'PSI-69': {
    extinction: 'extinction',
    disruption: 'disruption',
    'radiative extinction': 'extinction',
    'burn out': 'sustained',
    burnout: 'sustained',
    // The droplet burned until the fuel was gone, so it did not extinguish.
    completion: 'sustained',
  },
}

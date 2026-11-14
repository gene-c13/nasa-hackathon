/**
 * Canonical material names.
 *
 * PSI records the fuel column as free text, and it mixes the material with its
 * geometry and concentration:
 *
 *   "2 cm 0.2 mm PMMA film"        -> PMMA
 *   "1 cm wide 200 micron thick PMMA" -> PMMA
 *   "Nomex natural (nomex III)"    -> Nomex
 *   "Cotton-Fiberglass (SIBAL)"    -> SIBAL
 *   "75 % Propylene"               -> Propylene
 *   "C2H4"                         -> Ethylene
 *
 * Across 1995 rows there are 187 distinct fuel strings describing far fewer
 * actual materials. Without this collapsing step an evidence lookup for PMMA
 * finds nothing, because no row is spelled exactly "PMMA".
 *
 * Deliberately deterministic and order-dependent: "Cotton-Fiberglass (SIBAL)"
 * must resolve to SIBAL before the plain /cotton/ rule can claim it.
 */

export interface MaterialRule {
  canonical: string
  pattern: RegExp
  /** solid | liquid | gas, used for sanity-checking against the test family. */
  kind: 'solid' | 'liquid' | 'gas'
}

/**
 * Rows that describe setup or calibration rather than a burn.
 * These must never satisfy an evidence query.
 */
export const NON_TEST = /pre-?test|flow visuali[sz]ation|flow visulation|calibration|^n\/?a$|^-+$/i

/** First match wins, so the more specific rules come first. */
export const MATERIAL_RULES: MaterialRule[] = [
  // Solids — spacecraft materials
  { canonical: 'SIBAL', pattern: /sibal|cotton[\s-]*fiberglass/i, kind: 'solid' },
  { canonical: 'Nomex', pattern: /nomex/i, kind: 'solid' },
  { canonical: 'PMMA', pattern: /pmma|acrylic|plexiglas/i, kind: 'solid' },
  { canonical: 'Kapton', pattern: /kapton/i, kind: 'solid' },
  { canonical: 'Teflon', pattern: /teflon|ptfe/i, kind: 'solid' },
  { canonical: 'Silicone', pattern: /silicone/i, kind: 'solid' },
  { canonical: 'Lampwick', pattern: /lampwick|lamp wick/i, kind: 'solid' },
  { canonical: 'Pyrell', pattern: /pyrell/i, kind: 'solid' },
  { canonical: 'Cotton', pattern: /cotton/i, kind: 'solid' },
  { canonical: 'Japan wax', pattern: /japan\s*wax|candle/i, kind: 'solid' },
  { canonical: 'Arizona road dust', pattern: /arizona road dust|\bard\b/i, kind: 'solid' },

  // Liquids — droplet fuels
  { canonical: 'Methanol', pattern: /methanol|\bch3oh\b/i, kind: 'liquid' },
  { canonical: 'Ethanol', pattern: /ethanol/i, kind: 'liquid' },
  { canonical: 'Propanol', pattern: /propanol/i, kind: 'liquid' },
  { canonical: 'Glycerol', pattern: /glycerol/i, kind: 'liquid' },
  { canonical: 'Heptane', pattern: /heptane|\bc7h16\b/i, kind: 'liquid' },
  { canonical: 'Decane', pattern: /\bdecane\b|\bc10h22\b/i, kind: 'liquid' },
  { canonical: 'Dodecane', pattern: /dodecane|\bc12h26\b/i, kind: 'liquid' },
  { canonical: 'Octane', pattern: /octane|\bc8h18\b/i, kind: 'liquid' },
  { canonical: 'Dibutyl phthalate', pattern: /dibutyl/i, kind: 'liquid' },

  // Gases — burner fuels
  { canonical: 'Ethylene', pattern: /ethylene|\bc2h4\b/i, kind: 'gas' },
  { canonical: 'Propylene', pattern: /propylene|\bc3h6\b/i, kind: 'gas' },
  { canonical: 'Propane', pattern: /propane|\bc3h8\b/i, kind: 'gas' },
  { canonical: 'Butane', pattern: /butane|\bc4h10\b/i, kind: 'gas' },
  { canonical: 'Ethane', pattern: /\bethane\b|\bc2h6\b/i, kind: 'gas' },
  { canonical: 'Methane', pattern: /methane|\bch4\b/i, kind: 'gas' },
  { canonical: 'Hydrogen', pattern: /hydrogen|\bh2\b/i, kind: 'gas' },
]

/**
 * Resolve a raw fuel string to a canonical material.
 * Returns null when the row is not a test, or the material is unrecognised —
 * never a guess, because a wrong material silently answers the wrong question.
 */
export function canonicalMaterial(raw: string): string | null {
  const s = (raw ?? '').trim()
  if (!s || NON_TEST.test(s)) return null
  if (/^unspecified$/i.test(s)) return null

  for (const rule of MATERIAL_RULES) {
    if (rule.pattern.test(s)) return rule.canonical
  }
  return null
}

export function materialKind(canonical: string): MaterialRule['kind'] | null {
  return MATERIAL_RULES.find((r) => r.canonical === canonical)?.kind ?? null
}

/** Does a free-text query refer to this canonical material? */
export function matchesMaterial(query: string, canonical: string | null): boolean {
  if (!canonical) return false
  const q = query.trim()
  if (!q) return false
  if (q.toLowerCase() === canonical.toLowerCase()) return true
  // Let a user type "acrylic" and reach PMMA.
  const rule = MATERIAL_RULES.find((r) => r.canonical === canonical)
  return rule ? rule.pattern.test(q) : false
}

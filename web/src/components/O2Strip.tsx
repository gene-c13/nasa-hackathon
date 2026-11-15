/**
 * One oxygen axis, one material, one test family.
 *
 * Each tick is an oxygen level at which that material was actually tested;
 * taller ticks mean more tests. The orange line is the atmosphere being asked
 * about, and the hatched band is the planned Moon habitat. When the orange
 * line sits in empty space, that emptiness is the finding.
 *
 * The ticks are one neutral colour on purpose. They used to take the colour
 * of the current grade, so dragging the slider repainted every tick from green
 * to yellow to grey — but the ticks are the same tests whatever is asked, and
 * the grade already lives in the badge above. Colour follows the thing, not
 * the question.
 */
import { HABITAT } from '@shared/evidence'
import type { TestRow } from '@shared/types'
import { pct, plural } from '../lib/format'

const MIN = 0.1
const MAX = 0.9
const W = 1000
const H = 120
const BASE = 84
const x = (o2: number) => ((Math.min(MAX, Math.max(MIN, o2)) - MIN) / (MAX - MIN)) * W

export function O2Strip({ rows, query }: { rows: TestRow[]; query: number }) {
  // Group to half a percentage point so stacked tests read as one taller tick.
  const groups = new Map<number, number>()
  for (const r of rows) {
    if (r.o2Fraction === null) continue
    const key = Math.round(r.o2Fraction * 200) / 200
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  const peak = Math.max(1, ...groups.values())
  const qx = x(query)
  const labelAnchor = qx > W - 120 ? 'end' : qx < 120 ? 'start' : 'middle'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label={`Oxygen levels tested: ${rows.length} tests. Query at ${pct(query)}.`}>
      <defs>
        <pattern id="habitat-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-flame)" strokeOpacity="0.35" strokeWidth="1.5" />
        </pattern>
      </defs>

      <rect x={x(HABITAT.o2Min)} y={22} width={W - x(HABITAT.o2Min)} height={BASE - 22} fill="url(#habitat-hatch)" />
      <text x={W - 8} y={38} fontSize="15" textAnchor="end" fill="var(--color-flame)" fontFamily="var(--font-mono)">
        MOON HABITAT ≥30%
      </text>

      <line x1={0} x2={W} y1={BASE} y2={BASE} stroke="var(--color-line-strong)" />
      {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={BASE} y2={BASE + 6} stroke="var(--color-line-strong)" />
          <text x={x(t)} y={BASE + 24} fontSize="15" textAnchor={t === 0.1 ? 'start' : t === 0.9 ? 'end' : 'middle'}
            fill="var(--color-faint)" fontFamily="var(--font-mono)">
            {Math.round(t * 100)}%
          </text>
        </g>
      ))}

      {[...groups.entries()].map(([o2, n]) => {
        const h = 10 + 38 * (Math.log(n + 1) / Math.log(peak + 1))
        return (
          // A 4px tick is not a hover target. The transparent rect behind it
          // is, and carries the count as a native tooltip.
          <g key={o2}>
            <title>{`${plural(n, 'test')} at ${pct(o2)} oxygen`}</title>
            <rect x={x(o2) - 12} y={22} width={24} height={BASE - 22} fill="transparent" />
            <rect x={x(o2) - 2} y={BASE - h} width={4} height={h} fill="var(--color-ink)" opacity={0.85} />
          </g>
        )
      })}

      <line x1={qx} x2={qx} y1={14} y2={BASE} stroke="var(--color-flame)" strokeWidth={2.5} />
      <text x={qx} y={11} fontSize="15" textAnchor={labelAnchor} fill="var(--color-flame)" fontFamily="var(--font-mono)" fontWeight="500">
        YOU ASKED {pct(query, 0)}
      </text>
    </svg>
  )
}

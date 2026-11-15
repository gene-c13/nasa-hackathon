/** A compact list of test rows. Every row opens its provenance. */
import type { TestRow } from '@shared/types'
import { investigationByAccession } from '../data'
import { atm, OUTCOME_LABEL, pct } from '../lib/format'
import { useProvenance } from './Provenance'

export function RowList({ rows }: { rows: TestRow[] }) {
  const open = useProvenance()
  return (
    <ul className="divide-y divide-line rounded border border-line">
      {rows.map((r) => (
        <li key={r.id}>
          <button
            onClick={() => open(r)}
            className="grid w-full grid-cols-[auto_1fr_auto] items-baseline gap-x-4 gap-y-0.5 px-3 py-2 text-left hover:bg-raised"
          >
            <span className="font-mono text-base tabular-nums">{pct(r.o2Fraction)}</span>
            <span className="min-w-0 truncate text-sm text-dim">{r.fuel || r.material}</span>
            <span className="font-mono text-xs text-faint">{r.id}</span>
            <span className="col-span-3 text-xs text-faint">
              {investigationByAccession.get(r.accession)?.acronym || r.accession}
              {' · '}pressure {atm(r.pressureAtm)}
              {' · '}outcome {OUTCOME_LABEL[r.outcome].toLowerCase()}
              <span className="text-flame"> · source →</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

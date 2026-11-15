/**
 * The one table of test rows. The evidence lookup, the Ask screen and the
 * test-data browser all show rows through it, so a test looks the same
 * wherever it appears. Every row opens its provenance.
 */
import type { TestRow } from '@shared/types'
import { investigationByAccession } from '../data'
import { atm, OUTCOME_LABEL, pct } from '../lib/format'
import { useProvenance } from './Provenance'

const TH = 'py-2 pr-4 font-normal'

export function RowList({ rows }: { rows: TestRow[] }) {
  const open = useProvenance()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="border-b border-line-strong text-xs text-faint">
          <tr>
            <th className={`${TH} text-right`}>Oxygen</th>
            <th className={TH}>Material</th>
            <th className={TH}>Investigation</th>
            <th className={`${TH} text-right`}>Pressure</th>
            <th className={TH}>Outcome</th>
            <th className="py-2 font-normal">Test</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => open(r)}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && open(r)}
              title="Show where this row comes from"
              className="cursor-pointer border-b border-line hover:bg-raised"
            >
              <td className={`py-2 pr-4 text-right font-mono tabular-nums ${r.o2Fraction === null ? 'text-faint' : ''}`}>
                {pct(r.o2Fraction)}
              </td>
              <td className="max-w-[16rem] py-2 pr-4">
                <span className={r.material ? '' : 'text-faint'}>{r.material ?? 'Unresolved'}</span>
                {r.fuel && r.fuel !== r.material && (
                  <span className="block truncate text-xs text-faint">{r.fuel}</span>
                )}
              </td>
              <td className="whitespace-nowrap py-2 pr-4 text-dim">
                {investigationByAccession.get(r.accession)?.acronym || r.accession}
              </td>
              <td className={`whitespace-nowrap py-2 pr-4 text-right font-mono tabular-nums ${r.pressureAtm === null ? 'text-faint' : ''}`}>
                {atm(r.pressureAtm)}
              </td>
              <td className={`whitespace-nowrap py-2 pr-4 ${r.outcome === 'unknown' ? 'text-faint' : ''}`}>
                {OUTCOME_LABEL[r.outcome]}
              </td>
              <td className="whitespace-nowrap py-2 font-mono text-xs text-dim">{r.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

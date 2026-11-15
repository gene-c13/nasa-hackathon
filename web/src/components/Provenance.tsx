/**
 * Provenance panel (F6).
 *
 * Any test row anywhere in the app opens this panel. It shows where a number
 * came from: the investigation, the source CSV, the original column name and
 * the raw value NASA recorded, next to the normalised value the app uses. If
 * the two differ (BASS-II records oxygen in percent, the app uses mole
 * fraction) the conversion is shown rather than hidden.
 */
import { createContext, useContext, useEffect, useState } from 'react'
import type { TestRow } from '@shared/types'
import { investigationByAccession } from '../data'
import { atm, FAMILY_LABEL, OUTCOME_LABEL, pct } from '../lib/format'

const Ctx = createContext<(row: TestRow) => void>(() => {})

/** Call the returned function with a row to open its provenance. */
export const useProvenance = () => useContext(Ctx)

export function ProvenanceProvider({ children }: { children: React.ReactNode }) {
  const [row, setRow] = useState<TestRow | null>(null)
  return (
    <Ctx.Provider value={setRow}>
      {children}
      {row && <Panel key={row.id} row={row} onClose={() => setRow(null)} />}
    </Ctx.Provider>
  )
}

function citation(row: TestRow) {
  const inv = investigationByAccession.get(row.accession)
  const name = inv ? `${inv.title}${inv.acronym ? ` (${inv.acronym})` : ''}` : row.accession
  const doi = inv?.doi ? ` https://doi.org/${inv.doi}` : ''
  return `NASA Physical Science Informatics, ${row.accession}: ${name}. Test ${row.id}, file ${row.sourceFile}.${doi}`
}

function Panel({ row, onClose }: { row: TestRow; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const inv = investigationByAccession.get(row.accession)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rawO2 = row.sourceO2Column ? row.raw[row.sourceO2Column] : undefined
  const cite = citation(row)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cite)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`Provenance for ${row.id}`}>
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close provenance" />
      <aside className="relative flex h-full w-full max-w-lg flex-col border-l border-line bg-panel">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-mono text-lg">{row.id}</h2>
            <p className="mt-1 text-sm text-dim">
              {inv?.acronym || row.accession}, {FAMILY_LABEL[row.family].toLowerCase()} test
            </p>
          </div>
          <button onClick={onClose} className="border border-line px-2.5 py-1 text-sm text-dim hover:border-line-strong hover:text-ink">
            Close
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section>
            <h3 className="text-sm font-medium">Oxygen, as recorded and as used</h3>
            {row.sourceO2Column && rawO2 !== undefined ? (
              <dl className="mt-2 grid grid-cols-2 gap-x-6 border-y border-line py-3">
                <div className="min-w-0">
                  <dt className="text-xs text-faint">As written in NASA's file</dt>
                  <dd className="mt-1 font-mono text-xl">{rawO2}</dd>
                  <dd className="mt-1 break-words font-mono text-xs text-dim">"{row.sourceO2Column.trim()}"</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-faint">As used in this app</dt>
                  <dd className="mt-1 font-mono text-xl">{row.o2Fraction === null ? '-' : row.o2Fraction.toFixed(3)}</dd>
                  <dd className="mt-1 text-xs text-dim">mole fraction ({pct(row.o2Fraction)})</dd>
                </div>
              </dl>
            ) : (
              <p className="hatch mt-2 border border-dashed border-line-strong p-3 text-sm text-dim">
                This test's source file has no numeric oxygen column, so the app records no oxygen level for it.
              </p>
            )}
            <p className="mt-2 text-xs text-faint">
              Conversion happens once, in the data pipeline. Parse confidence: {row.confidence}.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-medium">Normalised values</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="Material" value={row.material ?? 'Unresolved'} />
              <Field label="Fuel, as written" value={row.fuel || '-'} />
              <Field label="Pressure" value={atm(row.pressureAtm)} />
              <Field label="Outcome" value={OUTCOME_LABEL[row.outcome]} />
              <Field label="Diluent" value={row.diluent ?? '-'} />
              <Field label="Flow" value={row.flowCmS === null ? '-' : `${row.flowCmS} cm/s`} />
            </dl>
          </section>

          <section>
            <h3 className="text-sm font-medium">Source</h3>
            <dl className="mt-2 space-y-2 text-sm">
              <Field label="Investigation" value={inv ? `${row.accession}, ${inv.title}` : row.accession} />
              <Field label="File" value={row.sourceFile} mono />
              {inv?.doi && (
                <div>
                  <dt className="text-xs text-faint">DOI</dt>
                  <dd>
                    <a className="break-all font-mono text-sm link" href={`https://doi.org/${inv.doi}`} target="_blank" rel="noreferrer">
                      {inv.doi}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-3 border-l-2 border-line-strong pl-3">
              <p className="text-sm leading-relaxed text-dim">{cite}</p>
              <button onClick={copy} className="mt-2 border border-line-strong px-3 py-1.5 text-sm hover:border-ink">
                {copied ? 'Copied' : 'Copy citation'}
              </button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-medium">
              Original row, verbatim ({Object.keys(row.raw).length} columns)
            </h3>
            <table className="mt-2 w-full text-left text-xs">
              <tbody>
                {Object.entries(row.raw).map(([k, v]) => (
                  <tr key={k} className={`border-t border-line align-top ${k === row.sourceO2Column ? 'bg-flame/10' : ''}`}>
                    <th className="w-1/2 py-1.5 pr-3 font-normal text-dim">{k.trim()}</th>
                    <td className="break-words py-1.5 font-mono">{v || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </aside>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-faint">{label}</dt>
      <dd className={`break-words ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}

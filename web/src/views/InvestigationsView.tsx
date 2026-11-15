/**
 * Investigation explorer (F1).
 *
 * All PSI combustion investigations, searchable, and filterable by which part
 * of fire safety they inform. Each card states how much test data it carries,
 * including when the answer is "none".
 */
import { useMemo, useState } from 'react'
import type { Investigation, Tag } from '@shared/types'
import { investigations, tests } from '../data'
import { FAMILY_LABEL, pct, plural } from '../lib/format'
import { href, navigate } from '../lib/route'

const TAGS: { tag: Tag; label: string; blurb: string }[] = [
  { tag: 'prevention', label: 'Prevention', blurb: 'what ignites and spreads' },
  { tag: 'detection', label: 'Detection', blurb: 'smoke and soot' },
  { tag: 'suppression', label: 'Suppression', blurb: 'what puts flames out' },
]

/** Fuels per investigation, so "methanol" finds FLEX. Built once. */
const FUELS = new Map<string, string>()
for (const t of tests) {
  const have = FUELS.get(t.accession) ?? ''
  const word = (t.material ?? t.fuel).toLowerCase()
  if (word && !have.includes(word)) FUELS.set(t.accession, `${have} ${word}`)
}

export function InvestigationsView({ params }: { params: URLSearchParams }) {
  const q = params.get('q') ?? ''
  const tag = params.get('tag') ?? ''
  const set = (next: { q?: string; tag?: string }) =>
    navigate('investigations', { q: next.q ?? q, tag: next.tag ?? tag }, true)

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return investigations.filter((i) => {
      if (tag && !i.tags.includes(tag as Tag)) return false
      if (!needle) return true
      return `${i.accession} ${i.acronym} ${i.title} ${i.summary} ${FUELS.get(i.accession) ?? ''}`
        .toLowerCase()
        .includes(needle)
    })
  }, [q, tag])

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Investigations</h1>
        <p className="mt-2 max-w-2xl text-dim">
          The {investigations.length} combustion investigations in NASA's PSI archive. Search by
          name, acronym or fuel.
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search: FLEX, methanol, smoke…"
          className="w-full rounded border border-line-strong bg-raised px-3 py-2 sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Chip active={!tag} onClick={() => set({ tag: '' })}>All</Chip>
          {TAGS.map((t) => (
            <Chip key={t.tag} active={tag === t.tag} onClick={() => set({ tag: tag === t.tag ? '' : t.tag })}>
              {t.label} <span className="text-faint">· {t.blurb}</span>
            </Chip>
          ))}
        </div>
      </div>

      <p className="text-sm text-faint">
        Showing {shown.length} of {investigations.length}.
      </p>

      {shown.length === 0 ? (
        <p className="hatch rounded-lg border border-dashed border-line-strong p-5 text-dim">
          No investigation matches "{q}"{tag ? ` under ${tag}` : ''}.{' '}
          <button className="text-flame hover:underline" onClick={() => navigate('investigations', {}, true)}>
            Clear the search
          </button>
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {shown.map((inv) => (
            <Card key={inv.accession} inv={inv} />
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded border px-3 py-1.5 text-sm ${active ? 'border-flame text-flame' : 'border-line-strong text-dim hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

function Card({ inv }: { inv: Investigation }) {
  const [open, setOpen] = useState(false)
  const hasTests = inv.testCount > 0

  return (
    <article className="flex flex-col rounded-lg border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">{inv.acronym || inv.title}</h2>
        <span className="shrink-0 font-mono text-xs text-faint">{inv.accession}</span>
      </div>
      {inv.acronym && inv.acronym !== inv.title && <p className="text-sm text-faint">{inv.title}</p>}

      <p className="mt-3 text-sm leading-relaxed text-dim">
        {inv.summary || 'No summary was generated for this investigation.'}
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-sm">
        <div>
          <dt className="text-xs text-faint">Tests</dt>
          <dd className={`font-mono ${hasTests ? '' : 'text-faint'}`}>{hasTests ? inv.testCount : 'none'}</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Oxygen range</dt>
          <dd className={`font-mono ${inv.o2Range ? '' : 'text-faint'}`}>
            {inv.o2Range ? `${pct(inv.o2Range[0], 0)}–${pct(inv.o2Range[1], 0)}` : 'not numeric'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Burn outcome</dt>
          <dd className={`font-mono ${inv.hasOutcomeData ? '' : 'text-faint'}`}>
            {inv.hasOutcomeData ? 'recorded' : 'not recorded'}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
        <span>{FAMILY_LABEL[inv.family]}</span>
        {inv.tags.map((t) => (
          <span key={t} className="rounded-sm border border-line-strong px-1.5 py-0.5 font-mono uppercase tracking-wider text-dim">
            {t}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        {hasTests ? (
          <a className="text-flame hover:underline" href={href('tests', { acc: inv.accession })}>
            Browse {plural(inv.testCount, 'test')} →
          </a>
        ) : (
          <span className="text-faint">Metadata only: PSI has no test table for this one.</span>
        )}
        <button className="text-dim hover:text-ink" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide details' : 'Details'}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-line pt-4 text-sm">
          <Detail label="Platform" value={inv.platform} />
          <Detail label="Hardware" value={inv.hardware} />
          <div>
            <p className="text-xs text-faint">Objective, in NASA's words</p>
            <p className="mt-1 whitespace-pre-line leading-relaxed text-dim">{inv.objective || '—'}</p>
          </div>
          {inv.doi && (
            <div>
              <p className="text-xs text-faint">Dataset DOI</p>
              <a className="break-all font-mono text-flame hover:underline" href={`https://doi.org/${inv.doi}`} target="_blank" rel="noreferrer">
                {inv.doi}
              </a>
            </div>
          )}
          {inv.publications.length > 0 && (
            <div>
              <p className="text-xs text-faint">Publications ({inv.publications.length})</p>
              <ul className="mt-1 space-y-1.5">
                {inv.publications.map((p, i) => (
                  <li key={i} className="leading-snug text-dim">
                    {p.doi ? (
                      <a className="hover:text-ink hover:underline" href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">
                        {p.title}
                      </a>
                    ) : (
                      p.title
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-faint">{label}</p>
      <p className="text-dim">{value || '—'}</p>
    </div>
  )
}

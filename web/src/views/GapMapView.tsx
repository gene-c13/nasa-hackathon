/**
 * Coverage and gap map (F5).
 *
 * One row per material, one column per oxygen band. A filled cell means NASA
 * tested that material in that band; a hatched cell means nobody did. The
 * columns from 30% oxygen up are the planned Moon habitat atmosphere, and the
 * point of the screen is how little of the archive falls inside them.
 *
 * Counts come from `coverage`, precomputed by the pipeline. The headline
 * figures are derived from the data at load, never typed in.
 */
import { useMemo } from 'react'
import { HABITAT, O2_BINS } from '@shared/evidence'
import type { Family } from '@shared/types'
import { coverage, materials, tests } from '../data'
import { FAMILY_BLURB, FAMILY_LABEL, FAMILY_ORDER, pct, plural } from '../lib/format'
import { href } from '../lib/route'

const binLabel = (i: number) =>
  `${Math.round(O2_BINS[i] * 100)}–${Math.round((O2_BINS[i + 1] ?? 1) * 100)}`

const COUNT = new Map(coverage.map((c) => [`${c.material}|${c.family}|${c.o2Bin}`, c.count]))
const PEAK = Math.max(...coverage.map((c) => c.count))
const firstHabitatCol = O2_BINS.findIndex((b) => b >= HABITAT.o2Min)

export function GapMapView() {
  const groups = useMemo(
    () =>
      FAMILY_ORDER.map((family) => ({
        family,
        rows: materials
          .flatMap((m) => m.families.filter((f) => f.family === family).map((f) => ({ name: m.name, mf: f })))
          .sort((a, b) => b.mf.withO2.length - a.mf.withO2.length || a.name.localeCompare(b.name)),
      })).filter((g) => g.rows.length),
    [],
  )

  // Headline: solid materials inside the habitat band.
  const solids = tests.filter((t) => t.family === 'flame-spread' && t.o2Fraction !== null)
  const solidsInBand = solids.filter((t) => t.o2Fraction! >= HABITAT.o2Min).length
  const solidMax = Math.max(...solids.map((t) => t.o2Fraction!))
  const inBand = tests.filter((t) => t.o2Fraction !== null && t.o2Fraction >= HABITAT.o2Min)
  const anyInBand = inBand.length
  const bandFamilies = FAMILY_ORDER.filter((f) => inBand.some((t) => t.family === f))
    .map((f) => FAMILY_LABEL[f].toLowerCase())
    .join(' and ')
  const noO2 = tests.filter((t) => t.o2Fraction === null).length

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Where the data stops</h1>
        <p className="mt-2 max-w-2xl text-dim">
          Each row is a material, each column an oxygen band. Hatched cells are conditions nobody
          has tested in microgravity. The orange columns are the planned Moon habitat atmosphere.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat value={String(solidsInBand)} tone="gap"
          label={`solid-material tests at habitat oxygen levels (${pct(HABITAT.o2Min, 0)} or more)`} />
        <Stat value={pct(solidMax)} label="highest oxygen level any solid material was tested at" />
        <Stat value={anyInBand.toLocaleString()}
          label={`tests of any kind at ${pct(HABITAT.o2Min, 0)} oxygen or more, all of them ${bandFamilies} tests`} />
      </section>

      {groups.map((g) => (
        <FamilyGrid key={g.family} family={g.family} rows={g.rows} />
      ))}

      <section className="rounded-lg border border-line bg-panel p-4 sm:p-5">
        <h2 className="text-lg font-semibold">What this map cannot show</h2>
        <ul className="mt-3 space-y-2 text-dim">
          <li>
            <span className="text-ink">No partial-gravity data.</span> Every test here ran in
            microgravity or on the ground. PSI holds no combustion test at lunar gravity (one-sixth
            of Earth's), which is the condition a Moon habitat would actually be in.
          </li>
          <li>
            <span className="text-ink">Pressure is not on this grid.</span> The habitat is also
            defined by pressure (10.2 psi or less), and most solid-material tests do not record
            ambient pressure at all.
          </li>
          <li>
            <span className="text-ink">{noO2.toLocaleString()} of {tests.length.toLocaleString()} tests have no numeric oxygen level</span>{' '}
            in their source file. They are listed under each material but cannot be placed in a column.
          </li>
        </ul>
      </section>
    </div>
  )
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: 'gap' }) {
  return (
    <div className={`rounded-lg border p-4 ${tone === 'gap' ? 'hatch border-dashed border-line-strong' : 'border-line bg-panel'}`}>
      <p className="font-mono text-4xl tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-dim">{label}</p>
    </div>
  )
}

function FamilyGrid({
  family,
  rows,
}: {
  family: Family
  rows: { name: string; mf: (typeof materials)[number]['families'][number] }[]
}) {
  const cols = `minmax(8.5rem, 11rem) repeat(${O2_BINS.length}, minmax(2.75rem, 1fr))`

  return (
    <section>
      <h2 className="text-lg font-semibold">{FAMILY_LABEL[family]}</h2>
      <p className="text-sm text-faint">{FAMILY_BLURB[family]}</p>

      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-panel">
        <div className="min-w-[46rem] p-3">
          <div className="grid items-end gap-1" style={{ gridTemplateColumns: cols }}>
            <div />
            <div style={{ gridColumn: `span ${firstHabitatCol}` }} />
            <div className="rounded-t-sm border-b-2 border-flame px-1 pb-1 text-center font-mono text-[11px] uppercase tracking-wider text-flame"
              style={{ gridColumn: `span ${O2_BINS.length - firstHabitatCol}` }}>
              Moon habitat · ≥30% O₂
            </div>
          </div>

          <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: cols }}>
            <div className="self-end font-mono text-[11px] uppercase tracking-wider text-faint">Oxygen %</div>
            {O2_BINS.map((_, i) => (
              <div key={i} className={`text-center font-mono text-[11px] ${i >= firstHabitatCol ? 'text-flame' : 'text-faint'}`}>
                {binLabel(i)}
              </div>
            ))}

            {rows.map(({ name, mf }) => (
              <Row key={name} name={name} family={family} total={mf.rows.length} withO2={mf.withO2.length} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function Row({ name, family, total, withO2 }: { name: string; family: Family; total: number; withO2: number }) {
  return (
    <>
      <div className="flex flex-col justify-center pr-2">
        <a className="truncate text-sm hover:text-flame" href={href('tests', { mat: name, fam: family })}>{name}</a>
        <span className="text-[11px] text-faint">
          {withO2 === 0 ? `${total} tests, no O₂ recorded` : plural(total, 'test')}
        </span>
      </div>
      {O2_BINS.map((bin, i) => {
        const n = COUNT.get(`${name}|${family}|${bin}`) ?? 0
        const inBand = i >= firstHabitatCol
        const title = `${name}, ${binLabel(i)}% oxygen: ${n ? plural(n, 'test') : 'no test'}`
        if (!n) {
          return (
            <div key={bin} title={title} aria-label={title}
              className={`h-10 rounded-sm border border-dashed ${inBand ? 'hatch-flame border-flame/30' : 'hatch border-line'}`} />
          )
        }
        const strength = 0.25 + 0.75 * (Math.log(n + 1) / Math.log(PEAK + 1))
        return (
          <a key={bin} title={title} aria-label={title}
            href={href('tests', {
              mat: name, fam: family,
              o2min: String(Math.round(bin * 100)),
              o2max: String(Math.round((O2_BINS[i + 1] ?? 1) * 100)),
            })}
            className={`flex h-10 items-center justify-center rounded-sm font-mono text-sm font-medium hover:ring-2 hover:ring-ink ${inBand ? 'ring-1 ring-flame/60' : ''}`}
            style={{ background: `rgb(79 209 165 / ${strength})`, color: strength > 0.55 ? '#06231a' : 'var(--color-ink)' }}>
            {n}
          </a>
        )
      })}
    </>
  )
}

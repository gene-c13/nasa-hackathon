import { investigations, tests, meta } from './data'

const TAG_STYLE: Record<string, string> = {
  prevention: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  detection: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  suppression: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
}

export default function App() {
  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-5">
        <h1 className="text-lg font-semibold tracking-tight">FlameSafe</h1>
        <p className="text-sm text-zinc-400">
          Fire-safety evidence from NASA microgravity combustion data
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {meta.investigationCount} investigations · {meta.testCount} test rows ·{' '}
          {meta.numericO2Count} with oxygen data · {meta.source} · {meta.license}
        </p>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 p-6">
        {investigations.map((inv) => (
          <article
            key={inv.accession}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-medium">{inv.acronym || inv.title}</h2>
              <span className="shrink-0 font-mono text-xs text-zinc-500">
                {inv.accession}
              </span>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-zinc-300">
              {inv.summary || (
                <span className="text-zinc-600">No summary generated.</span>
              )}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {inv.tags.map((tag) => (
                <span
                  key={tag}
                  className={`rounded px-2 py-0.5 text-xs ring-1 ring-inset ${TAG_STYLE[tag]}`}
                >
                  {tag}
                </span>
              ))}
              <span className="text-xs text-zinc-500">
                {inv.family} ·{' '}
                {inv.testCount > 0
                  ? `${inv.testCount} tests`
                  : 'metadata only, no test table'}
                {inv.o2Range
                  ? ` · O₂ ${(inv.o2Range[0] * 100).toFixed(1)}–${(inv.o2Range[1] * 100).toFixed(1)}%`
                  : ''}
              </span>
            </div>
          </article>
        ))}

        <p className="pt-4 text-xs text-zinc-600">
          {tests.length} individual test rows loaded. Summaries and tags are
          model-written from PSI text; every number comes from the experimental
          tables.
        </p>
      </main>
    </div>
  )
}

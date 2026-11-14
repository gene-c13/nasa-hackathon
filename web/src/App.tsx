import { investigations, tests, meta } from './data'

export default function App() {
  return (
    <div className="min-h-full bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">FlameSafe</h1>
        <p className="text-sm text-zinc-400">
          Fire-safety evidence from NASA microgravity combustion data
        </p>
      </header>

      <main className="space-y-6 p-6">
        <p className="text-sm text-zinc-400">
          Scaffold is live. Reading{' '}
          <span className="text-zinc-100">{investigations.length}</span>{' '}
          investigations and <span className="text-zinc-100">{tests.length}</span>{' '}
          test rows.
        </p>

        <ul className="space-y-2">
          {investigations.map((inv) => (
            <li
              key={inv.accession}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium">{inv.acronym}</span>
                <span className="text-xs text-zinc-500">{inv.accession}</span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">{inv.title}</p>
              <p className="mt-2 text-xs text-zinc-500">
                {inv.family} · {inv.testCount} tests ·{' '}
                {inv.o2Range
                  ? `O₂ ${inv.o2Range[0]}–${inv.o2Range[1]}`
                  : 'no numeric O₂'}
              </p>
            </li>
          ))}
        </ul>

        <p className="text-xs text-amber-500/80">{meta.source}</p>
      </main>
    </div>
  )
}

/**
 * App shell: header, navigation, and one view at a time.
 *
 * The view and its filters come from the URL hash (see lib/route.ts). The
 * provenance panel is provided once here, so any row in any view can open it.
 */
import { useEffect } from 'react'
import { ProvenanceProvider } from './components/Provenance'
import { meta } from './data'
import { href, useRoute, type View } from './lib/route'
import { EvidenceView } from './views/EvidenceView'
import { GapMapView } from './views/GapMapView'
import { InvestigationsView } from './views/InvestigationsView'
import { TestsView } from './views/TestsView'

const NAV: { view: View; label: string }[] = [
  { view: 'evidence', label: 'Evidence lookup' },
  { view: 'gaps', label: 'Gap map' },
  { view: 'investigations', label: 'Investigations' },
  { view: 'tests', label: 'Test data' },
]

export default function App() {
  const { view, params } = useRoute()

  // A new section starts at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  return (
    <ProvenanceProvider>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 pt-3 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <a href={href('evidence')} className="flex items-baseline gap-2 pb-1 sm:pb-3">
              <span className="text-lg font-semibold tracking-tight">
                Flame<span className="text-flame">Safe</span>
              </span>
              <span className="hidden text-xs text-faint md:inline">
                NASA microgravity fire evidence, graded
              </span>
            </a>
            <nav className="-mx-4 flex overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Sections">
              {NAV.map((n) => (
                <a key={n.view} href={href(n.view)} aria-current={view === n.view ? 'page' : undefined}
                  className={`whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1 text-sm ${
                    view === n.view ? 'border-flame text-ink' : 'border-transparent text-dim hover:text-ink'
                  }`}>
                  {n.label}
                </a>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
          {view === 'evidence' && <EvidenceView params={params} />}
          {view === 'gaps' && <GapMapView />}
          {view === 'investigations' && <InvestigationsView params={params} />}
          {view === 'tests' && <TestsView params={params} />}
        </main>

        <footer className="border-t border-line">
          <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-faint sm:px-6">
            {meta.investigationCount} investigations · {meta.testCount.toLocaleString()} tests ·{' '}
            {meta.numericO2Count.toLocaleString()} with a recorded oxygen level · Source: {meta.source},{' '}
            {meta.license} · Data built {meta.generatedAt.slice(0, 10)}
          </p>
        </footer>
      </div>
    </ProvenanceProvider>
  )
}

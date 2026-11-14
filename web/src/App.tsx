import type { Grade } from '@shared/types'

// The three evidence grades from the shared contract. Listing them here proves
// the /shared import works; the real UI replaces this placeholder.
const GRADES: Grade[] = ['measured', 'bounded', 'no-data']

export default function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-4">
      <h1 className="text-3xl font-semibold tracking-tight">FlameSafe</h1>
      <p className="text-neutral-400">
        What NASA actually measured about microgravity combustion, and where it doesn't know.
      </p>
      <ul className="flex gap-2 text-sm">
        {GRADES.map((g) => (
          <li key={g} className="rounded border border-neutral-700 px-2 py-1">
            {g}
          </li>
        ))}
      </ul>
    </main>
  )
}

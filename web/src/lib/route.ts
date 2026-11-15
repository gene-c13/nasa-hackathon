/**
 * Hash routing in forty lines, instead of a router dependency.
 *
 * The whole UI state that matters (which view, which filters, which question)
 * lives in the URL hash, e.g. #/tests?acc=PSI-69. That makes every screen a
 * shareable link, and lets one view deep-link into another with a plain <a>.
 */
import { useSyncExternalStore } from 'react'

export type View = 'evidence' | 'ask' | 'investigations' | 'tests' | 'gaps' | 'how'
export const VIEWS: View[] = ['evidence', 'ask', 'investigations', 'tests', 'gaps', 'how']

export type Params = Record<string, string | undefined>

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
window.addEventListener('hashchange', notify)

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function href(view: View, params: Params = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
  const s = qs.toString()
  return `#/${view}${s ? `?${s}` : ''}`
}

/** `replace` keeps slider drags and keystrokes out of the back-button history. */
export function navigate(view: View, params: Params = {}, replace = false) {
  const target = href(view, params)
  if (replace) {
    history.replaceState(null, '', target)
    notify()
  } else {
    window.location.hash = target
  }
}

export function useRoute(): { view: View; params: URLSearchParams } {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  const [path, qs = ''] = hash.replace(/^#\/?/, '').split('?')
  const view = (VIEWS as string[]).includes(path) ? (path as View) : 'evidence'
  return { view, params: new URLSearchParams(qs) }
}

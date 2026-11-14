/**
 * Shared helpers for talking to NASA's PSI repository.
 *
 * Everything here is public, CC0-licensed and needs no authentication.
 * Base: https://psi.nasa.gov
 */

export const BASE = 'https://psi.nasa.gov'

/** Endpoint 1 — the full investigation listing. */
export const searchUrl = (size = 200) =>
  `${BASE}/geode-py/ws/repo/search?source=psi&type=investigation&size=${size}`

/** Endpoint 2 — one full investigation record. */
export const investigationUrl = (accession: string) =>
  `${BASE}/geode-py/ws/repo/investigations/${accession}`

/**
 * Endpoint 3, step one. Returns a PLAIN-TEXT S3 presigned URL, not JSON.
 * Calling .json() on this response throws — it caught me out, hence this note.
 */
export const downloadTicketUrl = (
  accession: string,
  fileName: string,
  version: number,
) =>
  `${BASE}/geode-py/ws/studies/${accession}/download` +
  `?file=${encodeURIComponent(fileName)}&version=${version}&redirect=false`

/** Minimal shape of a search hit. PSI returns far more fields than we use. */
export interface SearchHit {
  Accession: string
  Title: string
  Acronym: string
  'Research Area': string
  'Project Type': string
}

/** One attached experimental-table file on an investigation record. */
export interface TableFile {
  file_name: string
  file_size: number
  version: number
}

/** Minimal shape of a full investigation record. */
export interface InvestigationRecord {
  accession: string
  investigationAcronym: string
  title: string
  doi: string
  researchArea: string
  subResearchArea: string
  projectType: string
  flightProgram: string
  experimentHardware: string
  objective: string
  approach: string
  hypothesis: string
  researchImpacts: string
  experimentalTable?: TableFile[]
  publications?: { title: string; doi: string; authorList: string }[]
  totalFileSize?: number
}

/**
 * Fetch with retry and exponential backoff.
 *
 * PSI is a public research service and occasionally drops a connection —
 * PSI-99's table failed on our first run and succeeded on retry. Treat a
 * single failure as noise, not as "the data isn't there".
 */
export async function fetchWithRetry(
  url: string,
  { attempts = 4, timeoutMs = 60_000 } = {},
): Promise<Response> {
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) return res
      // 4xx other than 429 won't improve by retrying.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`)
      }
      lastError = new Error(`HTTP ${res.status} ${res.statusText}`)
    } catch (err) {
      lastError = err
      if (err instanceof Error && err.message.startsWith('HTTP 4')) throw err
    }

    if (attempt < attempts) {
      const wait = 500 * 2 ** (attempt - 1)
      await new Promise((r) => setTimeout(r, wait))
    }
  }

  throw new Error(
    `Failed after ${attempts} attempts: ${url}\n  ${String(lastError)}`,
  )
}

/**
 * Run tasks with a concurrency cap.
 * PSI is someone else's server — we don't open 50 sockets at once.
 */
export async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  })

  await Promise.all(runners)
  return results
}

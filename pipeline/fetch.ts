/**
 * Step 1 of the pipeline: pull everything we need from PSI onto disk.
 *
 * Downloads nothing twice — re-running is cheap, so normalize.ts can be
 * iterated on without hammering NASA's servers. Delete out/ to force a refetch.
 *
 * Output:
 *   out/investigations/PSI-69.json   full record per investigation
 *   out/csv/PSI-69__<file>.csv       experimental tables, verbatim
 *   out/manifest.json                what we got, what failed
 *
 * Run: npm run fetch
 *
 * NOTE: files under out/ are third-party data. We never execute them, and
 * normalize.ts parses them with papaparse rather than anything that evaluates.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fetchWithRetry,
  pool,
  searchUrl,
  investigationUrl,
  downloadTicketUrl,
  type InvestigationRecord,
  type SearchHit,
} from './psi.ts'
import { DOMAIN } from './domain.ts'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, 'out')
const INV_DIR = resolve(OUT, 'investigations')
const CSV_DIR = resolve(OUT, 'csv')

const RESEARCH_AREA = 'Combustion Science'

/**
 * We expect 24. If PSI publishes more, that's good news, not an error —
 * but we want to notice rather than silently work from a stale assumption.
 */
const EXPECTED_COUNT = 24

interface Manifest {
  fetchedAt: string
  investigationCount: number
  csvCount: number
  totalTableBytes: number
  investigations: {
    accession: string
    acronym: string
    tables: string[]
  }[]
  failures: { what: string; error: string }[]
}

const failures: Manifest['failures'] = []

/**
 * PSI records carry their own change history in `added` and `removed`, which
 * nothing here reads and which is 8 of the 10 MB in the largest record. The
 * records are committed so a build needs no network, so they are stored
 * without it.
 */
function slim(record: InvestigationRecord): InvestigationRecord {
  const copy = { ...record } as Record<string, unknown>
  delete copy.added
  delete copy.removed
  return copy as unknown as InvestigationRecord
}

/** Safe filename: PSI table names contain spaces and slashes. */
const safeName = (accession: string, fileName: string) =>
  `${accession}__${fileName.replace(/[\s/]+/g, '_')}`

async function main() {
  mkdirSync(INV_DIR, { recursive: true })
  mkdirSync(CSV_DIR, { recursive: true })

  // ---- 1. Find the combustion investigations --------------------------------
  // Derived from the live listing rather than hardcoded, so a new investigation
  // is picked up automatically.
  console.log('Fetching investigation listing...')
  const search = (await (await fetchWithRetry(searchUrl())).json()) as {
    hits: { hits: { _source: SearchHit }[] }
  }
  const hits: SearchHit[] = search.hits.hits.map((h) => h._source)

  const combustion = hits.filter((h) => h['Research Area'] === RESEARCH_AREA)
  console.log(
    `  ${hits.length} investigations total, ${combustion.length} in ${RESEARCH_AREA}`,
  )

  // The set we fetch is the union of what the listing says today and what
  // domain.ts knows about. The listing is not stable: on 15 Nov 2026 it
  // dropped PSI-39 while the record endpoint still served it, and a fresh
  // clone quietly built a 23-investigation dataset. Anything in domain.ts is
  // fetched whether or not the listing mentions it; anything new in the
  // listing is fetched and flagged, because domain.ts will need an entry.
  const listed = new Set(combustion.map((h) => h.Accession))
  const known = new Set(Object.keys(DOMAIN))
  const accessions = [...new Set([...listed, ...known])].sort()

  const dropped = [...known].filter((a) => !listed.has(a))
  const unknown = [...listed].filter((a) => !known.has(a))
  if (dropped.length) {
    console.warn(`  ! Listing omits ${dropped.join(', ')}; fetching from domain.ts anyway.`)
  }
  if (unknown.length) {
    console.warn(`  ! Listing has ${unknown.join(', ')} not in domain.ts — add family and phase.`)
  }
  if (accessions.length !== EXPECTED_COUNT) {
    console.warn(
      `  ! Expected ${EXPECTED_COUNT} combustion investigations, have ${accessions.length}.`,
    )
  }

  // ---- 2. Full record for each ---------------------------------------------
  console.log('\nFetching full records...')
  const records = await pool(accessions, 5, async (accession) => {
    const file = resolve(INV_DIR, `${accession}.json`)

    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf8')) as InvestigationRecord
    }

    try {
      const res = await fetchWithRetry(investigationUrl(accession))
      const record = (await res.json()) as InvestigationRecord
      writeFileSync(file, JSON.stringify(slim(record), null, 2))
      console.log(`  ${accession.padEnd(8)} ${record.investigationAcronym || '—'}`)
      return record
    } catch (err) {
      failures.push({ what: `record ${accession}`, error: String(err) })
      console.error(`  ${accession.padEnd(8)} FAILED: ${err}`)
      return null
    }
  })

  const ok = records.filter((r): r is InvestigationRecord => r !== null)

  // ---- 3. Experimental tables ----------------------------------------------
  // Two steps: ask for a ticket, which is a plain-text presigned S3 URL, then
  // fetch that URL. The ticket is short-lived, so don't cache it.
  const jobs = ok.flatMap((record) =>
    (record.experimentalTable ?? []).map((table) => ({ record, table })),
  )

  console.log(`\nFetching ${jobs.length} experimental tables...`)

  let totalBytes = 0
  await pool(jobs, 4, async ({ record, table }) => {
    const target = resolve(CSV_DIR, safeName(record.accession, table.file_name))

    if (existsSync(target)) {
      totalBytes += readFileSync(target).byteLength
      return
    }

    try {
      const ticketRes = await fetchWithRetry(
        downloadTicketUrl(record.accession, table.file_name, table.version ?? 1),
      )
      // Plain text, not JSON. Calling .json() here throws.
      const presignedUrl = (await ticketRes.text()).trim()

      if (!presignedUrl.startsWith('http')) {
        throw new Error(`Ticket was not a URL: ${presignedUrl.slice(0, 120)}`)
      }

      const csvRes = await fetchWithRetry(presignedUrl)
      const body = Buffer.from(await csvRes.arrayBuffer())

      if (body.byteLength === 0) throw new Error('Empty file')

      writeFileSync(target, body)
      totalBytes += body.byteLength
      console.log(
        `  ${record.accession.padEnd(8)} ${table.file_name.slice(0, 52).padEnd(52)} ${body.byteLength.toLocaleString()} B`,
      )
    } catch (err) {
      failures.push({
        what: `table ${record.accession} / ${table.file_name}`,
        error: String(err),
      })
      console.error(`  ${record.accession.padEnd(8)} FAILED: ${err}`)
    }
  })

  // ---- 4. Manifest ----------------------------------------------------------
  const manifest: Manifest = {
    fetchedAt: new Date().toISOString(),
    investigationCount: ok.length,
    csvCount: jobs.length - failures.filter((f) => f.what.startsWith('table')).length,
    totalTableBytes: totalBytes,
    investigations: ok.map((r) => ({
      accession: r.accession,
      acronym: r.investigationAcronym || '',
      tables: (r.experimentalTable ?? []).map((t) => t.file_name),
    })),
    failures,
  }

  writeFileSync(resolve(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))

  console.log('\n' + '─'.repeat(60))
  console.log(`Investigations: ${manifest.investigationCount}`)
  console.log(`Tables:         ${manifest.csvCount} / ${jobs.length}`)
  console.log(`Table bytes:    ${totalBytes.toLocaleString()}`)
  console.log(`Failures:       ${failures.length}`)

  if (failures.length) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  ${f.what}\n    ${f.error}`)
    console.log('\nRe-run `npm run fetch` — cached files are skipped, so only')
    console.log('the failures are retried.')
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('\nFatal:', err)
  process.exit(1)
})

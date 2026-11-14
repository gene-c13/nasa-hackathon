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

  if (combustion.length !== EXPECTED_COUNT) {
    console.warn(
      `  ! Expected ${EXPECTED_COUNT} combustion investigations, found ${combustion.length}.`,
    )
    console.warn('    Not fatal — but check whether PSI added or removed any.')
  }

  // ---- 2. Full record for each ---------------------------------------------
  console.log('\nFetching full records...')
  const records = await pool(combustion, 5, async (hit) => {
    const file = resolve(INV_DIR, `${hit.Accession}.json`)

    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, 'utf8')) as InvestigationRecord
    }

    try {
      const res = await fetchWithRetry(investigationUrl(hit.Accession))
      const record = (await res.json()) as InvestigationRecord
      writeFileSync(file, JSON.stringify(record, null, 2))
      console.log(`  ${hit.Accession.padEnd(8)} ${record.investigationAcronym || '—'}`)
      return record
    } catch (err) {
      failures.push({ what: `record ${hit.Accession}`, error: String(err) })
      console.error(`  ${hit.Accession.padEnd(8)} FAILED: ${err}`)
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

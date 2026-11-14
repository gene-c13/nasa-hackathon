/**
 * Step 4, and the ONLY step that calls a language model.
 *
 * What it does: writes a two-sentence plain-English summary for each
 * investigation, and tags it prevention / detection / suppression.
 *
 * What it deliberately does NOT do: produce, adjust or interpret any number.
 * Every figure in the dashboard comes from a CSV via normalize.ts. The model
 * sees prose and returns prose. That separation is the reason the numbers can
 * be trusted, and it is the first thing to say if a judge asks what the AI
 * is doing here.
 *
 * Three safeguards:
 *   1. Results are cached per investigation, so a re-run costs nothing and
 *      produces identical output. The cache, not a temperature setting, is
 *      what makes the committed data.json reproducible: this SDK version does
 *      not expose temperature, and caching is the stronger guarantee anyway
 *      because it survives model updates.
 *   2. Output is structured through a tool schema and validated — bad tags or
 *      an over-long summary are rejected rather than stored.
 *   3. Any number appearing in a summary but not in the source text is
 *      reported, so invention is visible rather than silent.
 *
 * Run: npm run enrich          (uses cache)
 *      npm run enrich -- --force   (ignores cache, re-calls the API)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema'
import type { Dataset, Investigation, Tag } from '../shared/types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const DATA_FILE = resolve(here, '../shared/data.json')
const INV_DIR = resolve(here, 'out/investigations')
const CACHE_DIR = resolve(here, 'out/enriched')

const MODEL = 'claude-sonnet-5-5'
/**
 * Bump whenever SYSTEM or the schema changes. Cached entries written under an
 * older version are ignored, so every summary in a build comes from the same
 * prompt. Without this, editing the prompt leaves a silent mix of old and new.
 */
const PROMPT_VERSION = 2
const FORCE = process.argv.includes('--force')
/** Print the prompt for one investigation and exit, without calling the API. */
const DRY = process.argv.includes('--dry')

const VALID_TAGS: Tag[] = ['prevention', 'detection', 'suppression']

/** Load ANTHROPIC_API_KEY from the environment, or from a local .env file. */
function loadApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY

  for (const candidate of ['.env', '../.env', '.env.local', '../.env.local']) {
    const path = resolve(here, candidate)
    if (!existsSync(path)) continue
    const match = readFileSync(path, 'utf8').match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+)$/m)
    if (match) return match[1].trim().replace(/^["']|["']$/g, '')
  }

  console.error(
    'No ANTHROPIC_API_KEY found.\n\n' +
      '  export ANTHROPIC_API_KEY=sk-ant-...\n' +
      '  or put ANTHROPIC_API_KEY=sk-ant-... in a .env file at the repo root\n\n' +
      '  (.env is gitignored. Never commit the key.)',
  )
  process.exit(1)
}

interface Enriched {
  accession: string
  summary: string
  tags: Tag[]
  /** Kept for the methods page; not shipped in data.json. */
  rationale: string
  model: string
  promptVersion: number
  generatedAt: string
}

const SYSTEM = `You write short, factual summaries of NASA microgravity combustion investigations for a fire-safety dashboard used by aerospace engineers and researchers.

Rules, in order of importance:
1. Use ONLY the supplied text. Never add facts, materials, conclusions or numbers that are not in it.
2. Prefer no number to an approximate one. The dashboard gets its figures from experimental data elsewhere; your job is prose.
3. Write plainly, for someone who knows engineering but not combustion science. No marketing language, no "groundbreaking", no "cutting-edge".
4. Say what was burned, under what conditions, and why it matters for spacecraft fire safety.
5. LENGTH IS A HARD CONSTRAINT: two sentences, 280 characters or fewer in total. This goes on a dashboard card. Cut qualifiers and sub-clauses to fit. A short, specific summary beats a complete one.

Tags:
- prevention: material flammability, ignition limits, what makes something catch fire
- detection: smoke, aerosol or particulate measurement
- suppression: putting fires out, extinguishing agents, extinction limits

Apply every tag that genuinely fits. Most investigations have one or two, and you must return at least one — choose the closest fit if none is obvious.`

function buildPrompt(record: Record<string, string>): string {
  const field = (label: string, value: string | undefined) =>
    value?.trim() ? `${label}:\n${value.trim()}\n` : ''

  return [
    `Investigation: ${record.title} (${record.investigationAcronym || record.accession})`,
    field('Hardware', record.experimentHardware),
    field('Objective', record.objective),
    field('Approach', record.approach),
    field('Research impacts and Earth benefits', record.researchImpacts),
    '\nWrite a two-sentence summary and choose the tags.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Numbers in the summary that do not appear in the source text. */
function inventedNumbers(summary: string, source: string): string[] {
  const nums = summary.match(/\d+(?:\.\d+)?/g) ?? []
  return [...new Set(nums)].filter((n) => !source.includes(n))
}

function validate(
  data: { summary?: unknown; tags?: unknown; rationale?: unknown },
  accession: string,
): { summary: string; tags: Tag[]; rationale: string } {
  const summary = String(data.summary ?? '').trim()
  const rationale = String(data.rationale ?? '').trim()

  // The prompt asks for 280. Allow headroom so a slightly long sentence is not
  // a hard failure, while still catching output that ignored the budget.
  if (summary.length < 60 || summary.length > 400) {
    throw new Error(`${accession}: summary length ${summary.length} outside 60–400`)
  }

  const sentences = summary.split(/[.!?]+\s/).filter((s) => s.trim()).length
  if (sentences > 3) {
    throw new Error(`${accession}: ${sentences} sentences, expected at most 3`)
  }

  const raw = Array.isArray(data.tags) ? data.tags : []
  const tags = raw.map(String).filter((t): t is Tag => VALID_TAGS.includes(t as Tag))

  if (!tags.length) throw new Error(`${accession}: no valid tags in ${JSON.stringify(raw)}`)

  return { summary, tags: [...new Set(tags)], rationale }
}

async function enrichOne(
  client: Anthropic,
  record: Record<string, string>,
): Promise<{ result: Enriched; tokensIn: number; tokensOut: number; cached: boolean }> {
  const accession = record.accession
  const cacheFile = resolve(CACHE_DIR, `${accession}.json`)

  if (!FORCE && existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as Enriched
    if (cached.promptVersion === PROMPT_VERSION && cached.model === MODEL) {
      return { result: cached, tokensIn: 0, tokensOut: 0, cached: true }
    }
    // Stale: written by an older prompt or model. Regenerate.
  }

  const prompt = buildPrompt(record)

  // Structured outputs rather than tool-calling: this model does not accept
  // tool_choice {type:'tool'}, and a forced schema is a better fit anyway —
  // there is no tool to run, only a shape to fill.
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    output_config: {
      format: jsonSchemaOutputFormat({
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description:
              'Two sentences, 280 characters or fewer in total. Plain English, no invented numbers.',
          },
          tags: {
            type: 'array',
            items: { type: 'string', enum: ['prevention', 'detection', 'suppression'] },
            minItems: 1,
            description: 'Every tag that genuinely applies. At least one.',
          },
          rationale: {
            type: 'string',
            description: 'One short sentence on why those tags. Not shown to users.',
          },
        },
        required: ['summary', 'tags', 'rationale'],
        additionalProperties: false,
      }),
    },
    messages: [{ role: 'user', content: prompt }],
  })

  const parsed = response.parsed_output
  if (!parsed) {
    throw new Error(`${accession}: no parsed output returned`)
  }

  const validated = validate(parsed as Record<string, unknown>, accession)

  const invented = inventedNumbers(validated.summary, prompt)
  if (invented.length) {
    console.warn(
      `    ! ${accession}: summary contains numbers absent from source: ${invented.join(', ')}`,
    )
  }

  const result: Enriched = {
    accession,
    ...validated,
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
  }

  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(cacheFile, JSON.stringify(result, null, 2))

  return {
    result,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
    cached: false,
  }
}

async function main() {
  const dataset = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as Dataset

  const records = readdirSync(INV_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(resolve(INV_DIR, f), 'utf8')) as Record<string, string>)
    .sort((a, b) => a.accession.localeCompare(b.accession))

  if (DRY) {
    const sample = records.find((r) => r.accession === 'PSI-69') ?? records[0]
    console.log('--- SYSTEM ---\n' + SYSTEM)
    console.log('\n--- USER (' + sample.accession + ') ---\n' + buildPrompt(sample))
    console.log(
      `\n--- ${records.length} investigations, no API call made (--dry) ---`,
    )
    return
  }

  const client = new Anthropic({ apiKey: loadApiKey() })

  console.log(`Enriching ${records.length} investigations with ${MODEL}`)
  console.log(FORCE ? '  (--force: ignoring cache)\n' : '  (using cache where present)\n')

  const enriched = new Map<string, Enriched>()
  let tokensIn = 0
  let tokensOut = 0
  let cachedCount = 0
  const failures: string[] = []

  // Sequential: 24 short calls, and a clean log is worth more than the seconds saved.
  for (const record of records) {
    try {
      const out = await enrichOne(client, record)
      enriched.set(record.accession, out.result)
      tokensIn += out.tokensIn
      tokensOut += out.tokensOut
      if (out.cached) cachedCount++

      const mark = out.cached ? 'cache' : ' new '
      console.log(
        `  [${mark}] ${record.accession.padEnd(8)} ${out.result.tags.join(', ').padEnd(28)} ${out.result.summary.slice(0, 60)}...`,
      )
    } catch (err) {
      failures.push(`${record.accession}: ${err}`)
      console.error(`  [fail ] ${record.accession}: ${err}`)
    }
  }

  // ---- Merge into the dataset ----------------------------------------------
  let applied = 0
  dataset.investigations = dataset.investigations.map((inv): Investigation => {
    const e = enriched.get(inv.accession)
    if (!e) return inv
    applied++
    return { ...inv, summary: e.summary, tags: e.tags }
  })

  const missing = dataset.investigations.filter((i) => !i.summary)
  if (missing.length) {
    console.error(
      `\n${missing.length} investigation(s) still lack a summary: ${missing.map((i) => i.accession).join(', ')}`,
    )
  }

  writeFileSync(DATA_FILE, JSON.stringify(dataset, null, 2))

  console.log('\n' + '─'.repeat(60))
  console.log(`Enriched:     ${applied} / ${dataset.investigations.length}`)
  console.log(`  from cache: ${cachedCount}`)
  console.log(`  new calls:  ${records.length - cachedCount - failures.length}`)
  console.log(`Tokens:       ${tokensIn.toLocaleString()} in, ${tokensOut.toLocaleString()} out`)

  const tally: Record<string, number> = {}
  for (const inv of dataset.investigations) for (const t of inv.tags) tally[t] = (tally[t] ?? 0) + 1
  console.log(`Tags:         ${Object.entries(tally).map(([t, n]) => `${t} ${n}`).join(', ')}`)

  if (failures.length) {
    console.error(`\n${failures.length} failure(s):`)
    for (const f of failures) console.error(`  ${f}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('\nFatal:', err)
  process.exit(1)
})

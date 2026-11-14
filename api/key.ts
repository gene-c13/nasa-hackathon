/**
 * Finds an API key without insisting on one.
 *
 * Unlike the pipeline's loader this never exits: the endpoint has a complete
 * answer path that needs no model at all, so a missing key degrades the
 * wording of an answer, not the answer itself.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export function findApiKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY

  for (const candidate of ['.env', '../.env', '.env.local', '../.env.local']) {
    const path = resolve(here, candidate)
    if (!existsSync(path)) continue
    const match = readFileSync(path, 'utf8').match(/^\s*ANTHROPIC_API_KEY\s*=\s*(.+)$/m)
    if (match) return match[1].trim().replace(/^["']|["']$/g, '')
  }
  return null
}

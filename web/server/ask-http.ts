/**
 * /api/ask over plain Node HTTP.
 *
 * The answer logic is `handleAsk` in api/ask.ts and knows nothing about HTTP.
 * This file is the only translation between a Node request/response and that
 * function, and both places that serve the endpoint use it:
 *
 *   - the Vite dev server (vite-plugin-ask.ts), during `npm run dev`
 *   - the Vercel function (scripts/vercel-output.mjs bundles this file)
 *
 * So the deployed endpoint and the local one cannot drift apart.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleAsk, MAX_QUESTION_LENGTH } from '../../api/ask.ts'

/** Read a JSON body, capped so a bad request cannot exhaust memory. */
function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const limit = MAX_QUESTION_LENGTH * 8

    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text.trim()) return resolve(null)
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(new Error('body is not valid JSON'))
      }
    })
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

export default async function askHttp(req: IncomingMessage, res: ServerResponse) {
  const method = req.method ?? 'GET'
  try {
    const query = new URL(req.url ?? '', 'http://localhost').searchParams.get('q')
    const body = method === 'POST' ? await readJson(req) : null
    const result = await handleAsk(method, query, body)
    send(res, result.status, result.body)
  } catch (err) {
    send(res, 400, { error: String(err instanceof Error ? err.message : err) })
  }
}

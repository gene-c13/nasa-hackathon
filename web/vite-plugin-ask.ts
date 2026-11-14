/**
 * Serves /api/ask during `npm run dev`.
 *
 * Vite's dev server is a Connect app, so the endpoint can be mounted as
 * middleware in the same process. No second server, no port to remember, no
 * proxy configuration, and nothing extra to start before a demo.
 *
 * The handler itself is transport-free (`handleAsk` in api/ask.ts), so this
 * file only translates between Node's req/res and a plain object. Deploying
 * the same endpoint as a serverless function means writing the same twenty
 * lines against that platform's req/res, and the answer logic is untouched.
 */
import type { Connect, Plugin } from 'vite'
import { handleAsk, MAX_QUESTION_LENGTH } from '../api/ask.ts'

const PATH = '/api/ask'

/** Read a JSON body, capped so a bad request cannot exhaust memory. */
function readJson(req: Connect.IncomingMessage): Promise<unknown> {
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

export function askEndpoint(): Plugin {
  return {
    name: 'flamesafe-ask-endpoint',
    configureServer(server) {
      server.middlewares.use(PATH, async (req, res, next) => {
        const method = req.method ?? 'GET'
        if (method !== 'GET' && method !== 'POST') return next()

        try {
          const url = new URL(req.url ?? '', 'http://localhost')
          const query = url.searchParams.get('q')
          const body = method === 'POST' ? await readJson(req) : null

          const { status, body: payload } = await handleAsk(method, query, body)

          res.statusCode = status
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.setHeader('cache-control', 'no-store')
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }))
        }
      })
    },
  }
}

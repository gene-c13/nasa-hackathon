/**
 * Serves /api/ask during `npm run dev`.
 *
 * Vite's dev server is a Connect app, so the endpoint can be mounted as
 * middleware in the same process. No second server, no port to remember, no
 * proxy configuration, and nothing extra to start before a demo.
 *
 * The handler itself is transport-free (`handleAsk` in api/ask.ts). The
 * translation between Node's req/res and that function lives in
 * server/ask-http.ts, which the deployed Vercel function uses too.
 */
import type { Plugin } from 'vite'
import askHttp from './server/ask-http.ts'

const PATH = '/api/ask'

export function askEndpoint(): Plugin {
  return {
    name: 'flamesafe-ask-endpoint',
    configureServer(server) {
      server.middlewares.use(PATH, (req, res, next) => {
        const method = req.method ?? 'GET'
        if (method !== 'GET' && method !== 'POST') return next()
        void askHttp(req, res)
      })
    },
  }
}

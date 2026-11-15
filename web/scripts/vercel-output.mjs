/**
 * Lays the built site out the way Vercel deploys it (Build Output API v3).
 * Runs after `vite build`, as the last step of `npm run build:vercel`.
 *
 *   .vercel/output/
 *     config.json
 *     static/                      the dashboard, copied from dist/
 *     functions/api/ask.func/
 *       .vc-config.json            "run api/index.mjs on Node"
 *       api/index.mjs              server/ask-http.ts bundled with everything it imports
 *       shared/data.json           the dataset the endpoint grades against
 *
 * The function keeps the repository's own layout (api/ beside shared/) because
 * api/ask.ts finds the dataset at ../shared/data.json relative to itself.
 * Mirroring that means the endpoint code runs unmodified.
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'vite'

const web = path.resolve(import.meta.dirname, '..')
const out = path.join(web, '.vercel/output')
const func = path.join(out, 'functions/api/ask.func')

await rm(out, { recursive: true, force: true })
await mkdir(func, { recursive: true })

await cp(path.join(web, 'dist'), path.join(out, 'static'), { recursive: true })

// Bundle the dependencies in, so there is no node_modules to trace at deploy time.
await build({
  configFile: false,
  root: web,
  logLevel: 'warn',
  publicDir: false,
  ssr: { noExternal: true },
  build: {
    ssr: 'server/ask-http.ts',
    outDir: path.join(func, 'api'),
    emptyOutDir: true,
    minify: false,
    target: 'node22',
    rolldownOptions: { output: { format: 'esm', entryFileNames: 'index.mjs' } },
  },
})

await cp(path.join(web, '../shared/data.json'), path.join(func, 'shared/data.json'))

await writeFile(
  path.join(func, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'api/index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30 }, null, 2),
)
await writeFile(path.join(out, 'config.json'), JSON.stringify({ version: 3 }, null, 2))

console.log('Vercel output written to .vercel/output')

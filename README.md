# FlameSafe

Fire-safety evidence from NASA microgravity combustion data.
NASA Space Apps 2026 — Flame in Freefall.

Data source: NASA Physical Science Informatics (PSI), CC0-1.0.

## Layout

    pipeline/   PSI fetch, unit normalisation, evidence grading, gap report  (Role A)
    api/        /api/ask — grounded question answering                       (Role A)
    web/        Vite + React + Tailwind dashboard                            (Role B)
    shared/     types.ts (frozen contract), evidence.ts, gaps.ts, generated data.json

## Setup

    cd web && npm install
    cd ../pipeline && npm install
    cd ../api && npm install

An `ANTHROPIC_API_KEY` is optional. Put it in `.env` at the repo root if you
have one; `.env` is gitignored. Without a key the pipeline rebuilds
`shared/data.json` from the committed enrichment cache, and `/api/ask` answers
from its rule-based path. No step requires credentials to produce correct
output.

## Run

    npm run dev --prefix web            # dashboard and /api/ask at localhost:5173
    npm run build --prefix pipeline     # fetch -> normalize -> grade -> enrich
    npm run gaps --prefix pipeline      # coverage gap report and the pitch's self-tests
    npm run ask --prefix api -- "Will PMMA burn at 34% oxygen?"

`shared/data.json` is generated. Do not edit it by hand. Rebuilding it from a
fresh clone with no API key reproduces the committed file byte for byte,
except for the build timestamp in `meta.generatedAt`.

## Self-tests

`grade` and `gaps` each end with a block of checks and refuse to write if one
fails. They are the figures the project quotes, asserted against the rows
rather than typed in:

    no solid material tested in microgravity above 22.2% oxygen
    zero flame-spread tests at or above the 30% habitat floor
    476 tests clear the oxygen floor; 66 also clear the 10.2 psi ceiling,
      and all 66 are gas burner flames
    every incomparable family pair returns its own physical reason

If a number on a slide stops being true, the build says so.

## /api/ask

Three stages, and the middle one decides the answer:

    interpret   English question -> structured query     model, or rules
    grade       structured query -> evidence + facts     deterministic
    narrate     facts -> prose                           model, or rules

The grading step contains no model. Every number in a response traces to a row
of a NASA CSV through `shared/evidence.ts`, which is also what the dashboard
runs in the browser, so the endpoint and the UI cannot disagree.

Two guards make that checkable. A number the interpreter returns must appear
literally in the question, and a number in the prose must appear in the
computed facts. Either failure discards the model's output and falls back to
the rule-based path; the response reports which path produced it.

    GET  /api/ask                  pinned demo questions
    GET  /api/ask?q=...
    POST /api/ask  {"question": "..."}

Served in development by `web/vite-plugin-ask.ts`, Connect middleware in the
Vite dev server, so there is no second process to start. `handleAsk` in
`api/ask.ts` is transport-free and can be mounted on a serverless function
unchanged.

The fact builder lives in `api/facts.ts` with no Node or SDK imports, so the
browser runs the same code: when the endpoint is unreachable, the Ask screen
grades the pinned demo questions locally from the bundled data and shows the
same facts the endpoint would.

## Conventions

- `shared/types.ts` is frozen. Changing it requires both of us to agree first.
  The `/api/ask` wire format in `api/ask.ts` is frozen on the same terms.
- Oxygen is always stored as mole fraction 0–1. Source files disagree on units;
  conversion happens in the pipeline, never in the UI.
- A model never produces, adjusts or interprets a number. It reads prose and
  writes prose.
- Nobody edits the other role's folder.

# FlameSafe

Fire-safety evidence from NASA microgravity combustion data.
NASA Space Apps 2026 — Flame in Freefall.

Data source: NASA Physical Science Informatics (PSI), CC0-1.0.

## Layout

    pipeline/   PSI fetch, unit normalisation, evidence grading  (Role A)
    web/        Vite + React + Tailwind + Recharts dashboard     (Role B)
    shared/     types.ts (frozen contract) and generated data.json

## Setup

    cd web && npm install
    cd ../pipeline && npm install

## Run

    npm run dev --prefix web     # dashboard at localhost:5173
    npm run mock --prefix pipeline   # regenerate the mock dataset

`shared/data.json` currently holds mock data so the UI can be built before the
real pipeline lands. Shapes match the real output exactly.

## Conventions

- `shared/types.ts` is frozen. Changing it requires both of us to agree first.
- Oxygen is always stored as mole fraction 0–1. Source files disagree on units;
  conversion happens in the pipeline, never in the UI.
- Nobody edits the other role's folder.

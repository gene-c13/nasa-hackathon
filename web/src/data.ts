/**
 * Single typed entry point for the dataset.
 *
 * TypeScript widens types when importing JSON (a tuple becomes number[]), so
 * the cast happens once, here, and nowhere else. Every component imports from
 * this file and gets properly typed data.
 *
 * The lookups below are derived once at load. Nothing here converts a unit or
 * changes a value: that is the pipeline's job, and the UI only reads.
 */
import raw from '@shared/data.json'
import { materialKind } from '@shared/materials'
import type { Dataset, Family, Investigation, TestRow } from '@shared/types'

export const dataset = raw as unknown as Dataset
export const { investigations, tests, meta, coverage } = dataset

export const investigationByAccession = new Map<string, Investigation>(
  investigations.map((i) => [i.accession, i]),
)

/** A material as tested within one family. The two are never merged. */
export interface MaterialFamily {
  family: Family
  rows: TestRow[]
  /** Rows with a numeric oxygen level; only these can answer a lookup. */
  withO2: TestRow[]
  o2Range: [number, number] | null
}

export interface Material {
  name: string
  kind: 'solid' | 'liquid' | 'gas' | null
  total: number
  families: MaterialFamily[]
}

function buildMaterials(): Material[] {
  const byName = new Map<string, Map<Family, TestRow[]>>()
  for (const t of tests) {
    if (t.material === null) continue
    const fams = byName.get(t.material) ?? new Map<Family, TestRow[]>()
    fams.set(t.family, [...(fams.get(t.family) ?? []), t])
    byName.set(t.material, fams)
  }

  return [...byName.entries()]
    .map(([name, fams]) => {
      const families = [...fams.entries()].map(([family, rows]) => {
        const withO2 = rows.filter((r) => r.o2Fraction !== null)
        const values = withO2.map((r) => r.o2Fraction!)
        return {
          family,
          rows,
          withO2,
          o2Range: values.length
            ? ([Math.min(...values), Math.max(...values)] as [number, number])
            : null,
        }
      })
      return {
        name,
        kind: materialKind(name),
        total: families.reduce((n, f) => n + f.rows.length, 0),
        families,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const materials = buildMaterials()
export const materialByName = new Map(materials.map((m) => [m.name, m]))

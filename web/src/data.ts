/**
 * Single typed entry point for the dataset.
 *
 * TypeScript widens types when importing JSON (a tuple becomes number[]), so
 * the cast happens once, here, and nowhere else. Every component imports from
 * this file and gets properly typed data.
 */
import raw from '@shared/data.json'
import type { Dataset } from '@shared/types'

export const dataset = raw as unknown as Dataset
export const { investigations, tests, meta } = dataset

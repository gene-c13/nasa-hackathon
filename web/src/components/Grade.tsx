/**
 * The visual language for evidence grades.
 *
 *   measured  solid fill      a test exists at these conditions
 *   bounded   bracketed       tests exist either side; the point is interpolated
 *   no-data   hatched         nobody has tested this
 *
 * "No data" is styled as a result in its own right, with the same weight as
 * the other two. It is an answer, not an error and not an empty state.
 */
import type { Grade } from '@shared/types'

export const GRADE_LABEL: Record<Grade, string> = {
  measured: 'Measured',
  bounded: 'Bounded',
  'no-data': 'No data',
}

export const GRADE_MEANING: Record<Grade, string> = {
  measured: 'A test exists at these conditions.',
  bounded: 'Tests exist above and below, but not here.',
  'no-data': 'Nobody has tested this.',
}

export const GRADE_COLOR: Record<Grade, string> = {
  measured: 'var(--color-measured)',
  bounded: 'var(--color-bounded)',
  'no-data': 'var(--color-nodata)',
}

export function GradeBadge({ grade, size = 'md' }: { grade: Grade; size?: 'md' | 'lg' }) {
  const pad = size === 'lg' ? 'px-3.5 py-1.5 text-base' : 'px-2 py-0.5 text-xs'
  const base = `inline-flex items-center gap-2 font-mono font-medium uppercase tracking-wider ${pad}`

  if (grade === 'measured') {
    return (
      <span className={`${base} bg-measured text-base`} style={{ color: '#06231a' }}>
        {GRADE_LABEL[grade]}
      </span>
    )
  }
  if (grade === 'bounded') {
    return (
      <span className={`${base} border border-bounded text-bounded`}>
        {GRADE_LABEL[grade]}
      </span>
    )
  }
  return (
    <span className={`${base} hatch border border-dashed border-nodata text-nodata`}>
      {GRADE_LABEL[grade]}
    </span>
  )
}

import type { TestDef } from '../api/types';
import { isCompositeType } from '../api/types';
import { evaluateReading, type EvalLevel } from './evaluate';

export function isOutOfTolerance(level: EvalLevel): boolean {
  return level === 'tolerance' || level === 'action';
}

/** True when any test (including calculated composites) is tolerance or action. */
export function listHasToleranceWarning(
  tests: TestDef[],
  values: Record<string, { value?: unknown }>,
  computed: Record<string, number | string | null>
): boolean {
  return tests.some((t) => {
    const composite = isCompositeType(t.type);
    const v = composite
      ? (computed[t.slug] ?? null)
      : (values[t.slug]?.value as number | boolean | string | null | undefined) ?? null;
    return isOutOfTolerance(evaluateReading(t.type, v, t.criteria));
  });
}

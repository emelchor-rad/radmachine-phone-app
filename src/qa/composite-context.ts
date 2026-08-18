import type { DraftValue, TestCriteria, TestDef } from '../api/types';
import { isCompositeType, isFillableType } from '../api/types';

/** TOLS entry shape exposed to composite procedures. */
export type TolEntry = {
  type: string | null;
  act_low: number | null;
  tol_low: number | null;
  tol_high: number | null;
  act_high: number | null;
};

export type CalcContext = {
  /** Slug → current reading or locally computed composite value. */
  values: Record<string, number | boolean | string | null>;
  REFS: Record<string, number>;
  TOLS: Record<string, TolEntry>;
};

function tolEntry(criteria: TestCriteria | undefined): TolEntry | null {
  if (!criteria) return null;
  if (criteria.tolType === 'multchoice') {
    return {
      type: 'multchoice',
      act_low: null,
      tol_low: null,
      tol_high: null,
      act_high: null,
    };
  }
  if (criteria.tolType !== 'absolute' && criteria.tolType !== 'percent') return null;
  return {
    type: criteria.tolType,
    act_low: criteria.actLow,
    tol_low: criteria.tolLow,
    tol_high: criteria.tolHigh,
    act_high: criteria.actHigh,
  };
}

/**
 * Build the Python namespace inputs for one composite run.
 *
 * Fillable slugs come from the draft; composite slugs from prior passes.
 */
export function buildCalcContext(
  tests: TestDef[],
  draftValues: Record<string, DraftValue | undefined>,
  computed: Record<string, number | string | null>
): CalcContext {
  const values: Record<string, number | boolean | string | null> = {};
  const REFS: Record<string, number> = {};
  const TOLS: Record<string, TolEntry> = {};

  for (const t of tests) {
    if (isFillableType(t.type)) {
      values[t.slug] = draftValues[t.slug]?.value ?? null;
    } else if (isCompositeType(t.type)) {
      values[t.slug] = computed[t.slug] ?? null;
    }
    if (t.criteria?.refValue !== null && t.criteria?.refValue !== undefined) {
      REFS[t.slug] = t.criteria.refValue;
    }
    const tol = tolEntry(t.criteria);
    if (tol) TOLS[t.slug] = tol;
  }

  return { values, REFS, TOLS };
}

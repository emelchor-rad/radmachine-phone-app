import type { TestCriteria, TestType } from '../api/types';

/** Matches RadMachine's three visible levels plus honest unknowns. */
export type EvalLevel = 'ok' | 'tolerance' | 'action' | 'no_tol' | 'unrecorded';

const EPSILON = 1e-10;

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPSILON;
}

function numericValue(value: number | boolean): number {
  return typeof value === 'boolean' ? (value ? 1 : 0) : value;
}

function absoluteDiff(value: number, ref: number): number {
  return value - ref;
}

function percentDiff(value: number, ref: number): number | null {
  if (ref === 0) return null;
  return (100 * (value - ref)) / ref;
}

/**
 * Where does this reading stand against the criteria downloaded with the list?
 *
 * Mirrors qatrack.qa.models.TestInstance.calculate_pass_fail: the phone shows
 * an indication only; RadMachine still computes the stored result on POST.
 */
export function evaluateReading(
  type: TestType,
  value: number | boolean | string | null,
  criteria: TestCriteria | null | undefined
): EvalLevel {
  if (value === null) return 'unrecorded';
  if (type === 'string') return 'no_tol';
  if (!criteria || criteria.refValue === null) return 'no_tol';

  if (type === 'boolean') {
    const diff = Math.abs(criteria.refValue - numericValue(value));
    return diff > EPSILON ? 'action' : 'ok';
  }

  if (criteria.tolType === null) return 'no_tol';

  const num = numericValue(value);
  const diff =
    criteria.tolType === 'percent'
      ? percentDiff(num, criteria.refValue)
      : absoluteDiff(num, criteria.refValue);

  if (diff === null) return 'no_tol';

  const al = criteria.actLow ?? -1e99;
  const tl = criteria.tolLow ?? -1e99;
  const th = criteria.tolHigh ?? 1e99;
  const ah = criteria.actHigh ?? 1e99;

  const onActionBorder = almostEqual(diff, al) || almostEqual(diff, ah);
  const onToleranceBorder = almostEqual(diff, tl) || almostEqual(diff, th);
  const insideAction = (al <= diff && diff <= ah) || onActionBorder;
  const insideTolerance = (tl <= diff && diff <= th) || onToleranceBorder;

  if (!insideAction) return 'action';
  if (!insideTolerance) return 'tolerance';
  return 'ok';
}

export const EVAL_COLOUR: Record<EvalLevel, string | null> = {
  ok: '#1b7f3b',
  tolerance: '#8a6d00',
  action: '#b00020',
  no_tol: null,
  unrecorded: null,
};

export const EVAL_LABEL: Record<EvalLevel, string | null> = {
  ok: 'OK',
  tolerance: 'Tolerance',
  action: 'Action',
  no_tol: null,
  unrecorded: null,
};

/** One line the physicist reads beside a field: what was downloaded, not computed. */
export function criteriaLine(criteria: TestCriteria | null | undefined): string | null {
  if (!criteria || criteria.refValue === null) return null;
  if (criteria.refType === 'boolean') {
    return `Ref: ${criteria.refValue >= 0.5 ? 'Pass' : 'Fail'}`;
  }
  const ref = criteria.refValue;
  if (criteria.tolType === null) return `Ref: ${ref}`;
  const fmt = (n: number | null) => (n === null ? '—' : String(n));
  return `Ref ${ref}, tol ${fmt(criteria.tolLow)}/${fmt(criteria.tolHigh)}, act ${fmt(criteria.actLow)}/${fmt(criteria.actHigh)}`;
}

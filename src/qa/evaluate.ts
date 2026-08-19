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

function evaluateMultchoice(value: string, criteria: TestCriteria): EvalLevel {
  const choice = value.trim().toLowerCase();
  if (!choice) return 'unrecorded';
  const pass = (criteria.mcPassChoices ?? []).map((c) => c.trim().toLowerCase());
  const tol = (criteria.mcTolChoices ?? []).map((c) => c.trim().toLowerCase());
  if (pass.includes(choice)) return 'ok';
  if (tol.includes(choice)) return 'tolerance';
  return 'action';
}

function evaluateNumerical(
  value: number | boolean,
  criteria: TestCriteria
): EvalLevel {
  if (criteria.refValue === null) return 'no_tol';
  if (criteria.tolType !== 'absolute' && criteria.tolType !== 'percent') return 'no_tol';

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
  if (value === null || value === '') return 'unrecorded';
  if (!criteria) return 'no_tol';

  if (criteria.tolType === 'multchoice') {
    if (typeof value !== 'string') return 'no_tol';
    return evaluateMultchoice(value, criteria);
  }

  if (type === 'boolean') {
    if (criteria.refValue === null) return 'no_tol';
    const diff = Math.abs(criteria.refValue - numericValue(value));
    return diff > EPSILON ? 'action' : 'ok';
  }

  if (type === 'string') return 'no_tol';

  if (type === 'scomposite') {
    if (typeof value === 'string') return evaluateMultchoice(value, criteria);
    return 'no_tol';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return evaluateNumerical(value, criteria);
  }

  return 'no_tol';
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
  if (!criteria) return null;

  if (criteria.tolType === 'multchoice') {
    const pass = criteria.mcPassChoices?.join(', ') ?? '';
    const tol = criteria.mcTolChoices?.join(', ') ?? '';
    const parts: string[] = [];
    if (pass) parts.push(`Pass: ${pass}`);
    if (tol) parts.push(`Tol: ${tol}`);
    return parts.length ? parts.join(' · ') : null;
  }

  if (criteria.refValue === null) return null;
  if (criteria.refType === 'boolean') {
    return `Ref: ${criteria.refValue >= 0.5 ? 'Pass' : 'Fail'}`;
  }
  const ref = criteria.refValue;
  if (criteria.tolType === null) return `Ref: ${ref}`;
  const fmt = (n: number | null) => (n === null ? '—' : String(n));
  return `Ref ${ref}, tol ${fmt(criteria.tolLow)}/${fmt(criteria.tolHigh)}, act ${fmt(criteria.actLow)}/${fmt(criteria.actHigh)}`;
}

export type CriteriaBandValues = {
  actLow: number | null;
  tolLow: number | null;
  ref: number;
  tolHigh: number | null;
  actHigh: number | null;
};

export type CriteriaDisplay =
  | { kind: 'none' }
  | { kind: 'boolean'; refLabel: 'Pass' | 'Fail' }
  | { kind: 'multchoice'; pass: string[]; tol: string[] }
  | { kind: 'ref_only'; ref: number }
  | { kind: 'absolute'; bands: CriteriaBandValues }
  | {
      kind: 'percent';
      ref: number;
      actLow: number | null;
      tolLow: number | null;
      tolHigh: number | null;
      actHigh: number | null;
    };

function fmtBand(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function bandFromDiffs(ref: number, criteria: TestCriteria): CriteriaBandValues {
  const add = (d: number | null) => (d === null ? null : ref + d);
  return {
    actLow: add(criteria.actLow),
    tolLow: add(criteria.tolLow),
    ref,
    tolHigh: add(criteria.tolHigh),
    actHigh: add(criteria.actHigh),
  };
}

/** Structured ref/tol data for UI, with absolute limits like the RadMachine web UI. */
export function criteriaDisplay(
  criteria: TestCriteria | null | undefined
): CriteriaDisplay {
  if (!criteria) return { kind: 'none' };

  if (criteria.tolType === 'multchoice') {
    return {
      kind: 'multchoice',
      pass: criteria.mcPassChoices ?? [],
      tol: criteria.mcTolChoices ?? [],
    };
  }

  if (criteria.refValue === null) return { kind: 'none' };

  if (criteria.refType === 'boolean') {
    return { kind: 'boolean', refLabel: criteria.refValue >= 0.5 ? 'Pass' : 'Fail' };
  }

  const ref = criteria.refValue;
  if (criteria.tolType === null) return { kind: 'ref_only', ref };

  if (criteria.tolType === 'absolute') {
    return { kind: 'absolute', bands: bandFromDiffs(ref, criteria) };
  }

  return {
    kind: 'percent',
    ref,
    actLow: criteria.actLow,
    tolLow: criteria.tolLow,
    tolHigh: criteria.tolHigh,
    actHigh: criteria.actHigh,
  };
}

/** Compact summary line for the worksheet row. */
export function criteriaSummary(criteria: TestCriteria | null | undefined): string | null {
  const d = criteriaDisplay(criteria);
  if (d.kind === 'none') return null;
  if (d.kind === 'boolean') return `Reference: ${d.refLabel}`;
  if (d.kind === 'multchoice') {
    const parts: string[] = [];
    if (d.pass.length) parts.push(`Pass: ${d.pass.join(', ')}`);
    if (d.tol.length) parts.push(`Tolerance: ${d.tol.join(', ')}`);
    return parts.length ? parts.join(' · ') : null;
  }
  if (d.kind === 'ref_only') return `Reference: ${fmtBand(d.ref)}`;
  if (d.kind === 'absolute') {
    const { actLow, tolLow, ref, tolHigh, actHigh } = d.bands;
    const parts = [`Reference: ${fmtBand(ref)}`];
    if (tolLow !== null && tolHigh !== null) {
      parts.push(`Tolerance: ${fmtBand(tolLow)} – ${fmtBand(tolHigh)}`);
    }
    if (actLow !== null && actHigh !== null) {
      parts.push(`Action: ${fmtBand(actLow)} – ${fmtBand(actHigh)}`);
    }
    return parts.join(' · ');
  }
  const pct = (n: number | null) => (n === null ? '—' : `${n}%`);
  return `Reference: ${fmtBand(d.ref)} · Tolerance: ${pct(d.tolLow)}/${pct(d.tolHigh)} · Action: ${pct(d.actLow)}/${pct(d.actHigh)}`;
}

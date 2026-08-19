import type { DraftValue, TestDef } from '../api/types';
import { isCompositeType, isFillableType } from '../api/types';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasReading(
  slug: string,
  tests: TestDef[],
  draftValues: Record<string, DraftValue | undefined>,
  computed: Record<string, number | string | null>
): boolean {
  const t = tests.find((x) => x.slug === slug);
  if (!t) return true;

  if (isFillableType(t.type)) {
    const v = draftValues[slug]?.value;
    if (v === null || v === undefined) return false;
    if (typeof v === 'string' && v.trim() === '') return false;
    return true;
  }

  if (isCompositeType(t.type)) {
    const v = computed[slug];
    return v !== null && v !== undefined;
  }

  return true;
}

/** Slugs from this list that the procedure text references as identifiers. */
export function slugsReferencedInProcedure(procedure: string, slugs: string[]): string[] {
  const skip = new Set(['math', 'REFS', 'TOLS', 'result']);
  const out: string[] = [];
  for (const slug of slugs) {
    if (skip.has(slug)) continue;
    const re = new RegExp(`\\b${escapeRegex(slug)}\\b`);
    if (re.test(procedure)) out.push(slug);
  }
  return out;
}

/** Slugs referenced by the procedure that do not yet have a value. */
export function missingProcedureInputs(
  procedure: string,
  tests: TestDef[],
  draftValues: Record<string, DraftValue | undefined>,
  computed: Record<string, number | string | null>,
  /** The composite being calculated — its slug appears on the LHS of the procedure. */
  forSlug?: string
): string[] {
  const slugs = tests.map((t) => t.slug);
  return slugsReferencedInProcedure(procedure, slugs)
    .filter((slug) => slug !== forSlug)
    .filter((slug) => !hasReading(slug, tests, draftValues, computed));
}

function isMissingOperandError(message: string): boolean {
  return /NoneType|unsupported operand|not supported/i.test(message);
}

export function isTransientCalcError(message: string): boolean {
  return isMissingOperandError(message);
}

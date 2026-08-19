import type { DraftValue, TestDef } from '../api/types';
import { isCompositeType, isFillableType } from '../api/types';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugPattern(slug: string): RegExp {
  return new RegExp(`(?<![A-Za-z0-9_])${escapeRegex(slug)}(?![A-Za-z0-9_])`, 'i');
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

const SKIP_SLUGS = new Set(['math', 'REFS', 'TOLS', 'result', 'true', 'false', 'None']);

/** Slugs from this list that the procedure text references as identifiers. */
export function slugsReferencedInProcedure(procedure: string, slugs: string[]): string[] {
  const out: string[] = [];
  for (const slug of slugs) {
    if (SKIP_SLUGS.has(slug)) continue;
    if (slugPattern(slug).test(procedure)) out.push(slug);
  }
  return out;
}

/**
 * Slugs whose readings must be present before running this composite.
 *
 * When the procedure names no known slug (common for short scripts like
 * `result = x * 10` where x is not the macro name), fall back to the single
 * fillable test listed immediately before this composite.
 */
export function procedureDependencies(
  procedure: string,
  tests: TestDef[],
  forSlug: string
): string[] {
  const slugs = tests.map((t) => t.slug);
  const refs = slugsReferencedInProcedure(procedure, slugs).filter((slug) => slug !== forSlug);
  if (refs.length > 0) return refs;

  const idx = tests.findIndex((t) => t.slug === forSlug);
  if (idx <= 0) return [];

  const priorFillables = tests.slice(0, idx).filter((t) => isFillableType(t.type));
  if (priorFillables.length === 1) return [priorFillables[0].slug];
  return [];
}

/** Slugs referenced by the procedure that do not yet have a value. */
export function missingProcedureInputs(
  procedure: string,
  tests: TestDef[],
  draftValues: Record<string, DraftValue | undefined>,
  computed: Record<string, number | string | null>,
  forSlug?: string
): string[] {
  const deps = procedureDependencies(procedure, tests, forSlug ?? '');
  return deps.filter((slug) => !hasReading(slug, tests, draftValues, computed));
}

export function isTransientCalcError(message: string): boolean {
  return /NoneType|unsupported operand|not supported/i.test(message);
}

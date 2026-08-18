import type { DraftValue, TestDef } from '../api/types';
import { isCompositeType } from '../api/types';
import { canRunOnDevice } from './composite-gate';
import { buildCalcContext, type CalcContext } from './composite-context';

export type CompositeRunner = (
  slug: string,
  procedure: string,
  context: CalcContext
) => Promise<number | string | null>;

export type CompositeResult = {
  values: Record<string, number | string | null>;
  /** Slug → why the phone did not calculate (gated out or runtime error). */
  blocked: Record<string, string>;
};

const MAX_PASSES = 3;

/**
 * Run every gated-in composite in list order, up to MAX_PASSES for chains.
 */
export async function recalculateComposites(
  tests: TestDef[],
  draftValues: Record<string, DraftValue | undefined>,
  run: CompositeRunner
): Promise<CompositeResult> {
  const composites = tests.filter((t) => isCompositeType(t.type));
  const values: Record<string, number | string | null> = {};
  const blocked: Record<string, string> = {};

  for (const t of composites) {
    const gate = canRunOnDevice(t.calculationProcedure);
    if (!gate.ok) blocked[t.slug] = gate.reason;
  }

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const t of composites) {
      if (blocked[t.slug]) continue;
      const procedure = t.calculationProcedure?.trim();
      if (!procedure) continue;
      const ctx = buildCalcContext(tests, draftValues, values);
      try {
        const next = await run(t.slug, procedure, ctx);
        if (values[t.slug] !== next) {
          values[t.slug] = next;
          changed = true;
        }
      } catch (e: any) {
        blocked[t.slug] = e?.message ?? String(e);
      }
    }
    if (!changed) break;
  }

  return { values, blocked };
}

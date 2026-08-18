import type { Draft, SubmitPayload, SubmittedTest, TestDef } from '../api/types';
import { isFillableType } from '../api/types';

/**
 * Build the exact JSON RadMachine expects for a new session.
 *
 * The API requires EVERY non-composite test to be present on POST, so tests
 * the user left alone are submitted as skipped rather than omitted. Composites
 * are never included -- the server calculates them.
 */
export function buildPayload(defs: TestDef[], draft: Draft): SubmitPayload {
  const tests: Record<string, SubmittedTest> = {};

  for (const def of defs) {
    if (!isFillableType(def.type)) continue;
    const entry = draft.values[def.slug];
    if (
      !entry ||
      entry.value === null ||
      entry.value === undefined ||
      entry.value === ''
    ) {
      tests[def.slug] = { skipped: true };
      continue;
    }
    const comment = entry.comment?.trim();
    tests[def.slug] = comment ? { value: entry.value, comment } : { value: entry.value };
  }

  return {
    unit_test_collection: draft.utcUrl,
    day: 0,
    in_progress: false,
    work_started: draft.workStarted,
    work_completed: draft.workCompleted,
    user_key: draft.userKey,
    tests,
  };
}

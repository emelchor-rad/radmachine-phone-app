import type { DraftValue, TestDef } from '../api/types';
import { parseReading } from '../sync/reading';

/**
 * Merge live numeric field text into draft values for composite recalculation.
 *
 * The worksheet keeps typed text apart from parsed values; composites should
 * react to what the physicist is typing, not one keystroke behind.
 */
export function effectiveDraftValues(
  tests: TestDef[],
  values: Record<string, DraftValue | undefined>,
  texts: Record<string, string | undefined>
): Record<string, DraftValue | undefined> {
  const out: Record<string, DraftValue | undefined> = { ...values };
  for (const t of tests) {
    if (t.type !== 'simple') continue;
    const txt = texts[t.slug];
    if (txt === undefined) continue;
    const parsed = parseReading(txt);
    if (parsed !== null) {
      out[t.slug] = { ...out[t.slug], value: parsed };
    }
  }
  return out;
}

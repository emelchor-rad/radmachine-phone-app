import type { RadClient } from './client';
import type { TestDef } from './types';
import { isCompositeType } from './types';

/** Read calculation_procedure from a RadMachine / QATrack test JSON object. */
export function extractCalculationProcedure(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  for (const key of ['calculation_procedure', 'calculationProcedure', 'calc_procedure']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** A test list member may be a url string or a partial embedded test object. */
export function testResourceUrl(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const url = (raw as Record<string, unknown>).url;
    if (typeof url === 'string' && url) return url;
  }
  throw new Error('Test list contains an invalid test reference');
}

/**
 * Ensure every composite / scomposite has its calculation_procedure stored.
 *
 * Test lists sometimes embed partial test objects without the procedure field;
 * this re-fetches the full test resource (and falls back to slug lookup).
 */
export async function attachCalculationProcedures(
  client: RadClient,
  tests: TestDef[]
): Promise<TestDef[]> {
  const out: TestDef[] = [];

  for (const t of tests) {
    if (!isCompositeType(t.type)) {
      out.push(t);
      continue;
    }

    let procedure = t.calculationProcedure?.trim() || null;

    if (!procedure && t.testUrl) {
      try {
        procedure = extractCalculationProcedure(await client.get(t.testUrl));
      } catch {
        // fall through to slug lookup
      }
    }

    if (!procedure) {
      try {
        const matches = await client.getAll<Record<string, unknown>>('/qa/tests/', {
          slug: t.slug,
          limit: '1',
        });
        procedure = extractCalculationProcedure(matches[0]);
      } catch {
        // optional — list still downloads without phone-side calc
      }
    }

    out.push(procedure ? { ...t, calculationProcedure: procedure } : t);
  }

  return out;
}

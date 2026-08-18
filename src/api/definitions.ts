import type { TestDef, TestType } from './types';
import { DOWNLOADABLE_TYPES } from './types';

export type Fetcher = (url: string) => Promise<any>;

/**
 * Walk a test list and its sublists into a flat, ordered list of tests.
 *
 * Top-level tests render first, then each sublist in the order the API gives
 * them. The payload does not express interleaving between the two, and this
 * matches how the list reads in the RadMachine UI.
 *
 * Hand-entered tests (`simple`, `boolean`) are fillable; composites are
 * included for display only — RadMachine calculates them on POST. Any other
 * type is a hard error rather than a silently missing field on the worksheet.
 */
export async function flattenTestList(listUrl: string, fetchJson: Fetcher): Promise<TestDef[]> {
  const out: TestDef[] = [];
  const seenSlugs = new Set<string>();

  // A url can legitimately be reached twice -- the same test referenced from
  // two sublists is the case this cache exists for -- but it must still only
  // cost one round trip. Caches the promise, not the resolved value, so two
  // concurrent-looking awaits on the same url share the one in-flight fetch.
  const cache = new Map<string, Promise<any>>();
  const fetchCached = (url: string): Promise<any> => {
    let p = cache.get(url);
    if (!p) {
      p = fetchJson(url);
      cache.set(url, p);
    }
    return p;
  };

  // Takes the already-fetched list rather than its url: a sublist is read once
  // by the caller for its name, and re-fetching it here would double every
  // round trip on a phone connection.
  const walk = async (list: any, sublistName: string | null): Promise<void> => {
    for (const rawTestUrl of list.tests ?? []) {
      const testUrl: string = rawTestUrl;
      const t = await fetchCached(testUrl);
      if (!DOWNLOADABLE_TYPES.includes(t.type)) {
        throw new Error(
          `Test '${t.slug}' is of type '${t.type}', which this app cannot download. ` +
            `Supported types: ${DOWNLOADABLE_TYPES.join(', ')}.`
        );
      }
      // A test referenced from two sublists (or coincidentally sharing a
      // slug with an unrelated test) would otherwise yield two TestDefs with
      // the same slug. saveCollection INSERTs on PRIMARY KEY (utc_url, slug),
      // so that only surfaces later as a raw SQLite constraint failure.
      // Reject it here instead, loudly and by name.
      if (seenSlugs.has(t.slug)) {
        throw new Error(
          `Test '${t.slug}' appears twice in this test list -- it is referenced by more ` +
            `than one sublist. This app cannot store two readings under the same slug.`
        );
      }
      seenSlugs.add(t.slug);
      out.push({
        slug: t.slug,
        name: t.name,
        type: t.type as TestType,
        order: out.length,
        sublist: sublistName,
        testUrl: testUrl,
      });
    }

    for (const childUrl of list.test_lists ?? []) {
      const child = await fetchCached(childUrl);
      await walk(child, child.name);
    }
  };

  await walk(await fetchCached(listUrl), null);
  return out;
}

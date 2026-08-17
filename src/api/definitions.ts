import type { TestDef, TestType } from './types';

export type Fetcher = (url: string) => Promise<any>;

const SUPPORTED: TestType[] = ['simple', 'boolean'];

/**
 * Walk a test list and its sublists into a flat, ordered list of tests.
 *
 * Top-level tests render first, then each sublist in the order the API gives
 * them. The payload does not express interleaving between the two, and this
 * matches how the list reads in the RadMachine UI.
 *
 * v1 supports only hand-entered tests. Anything else is a hard error rather
 * than a silently missing field on the worksheet.
 */
export async function flattenTestList(listUrl: string, fetchJson: Fetcher): Promise<TestDef[]> {
  const out: TestDef[] = [];

  // Takes the already-fetched list rather than its url: a sublist is read once
  // by the caller for its name, and re-fetching it here would double every
  // round trip on a phone connection.
  const walk = async (list: any, sublistName: string | null): Promise<void> => {
    for (const testUrl of list.tests ?? []) {
      const t = await fetchJson(testUrl);
      if (!SUPPORTED.includes(t.type)) {
        throw new Error(
          `Test '${t.slug}' is of type '${t.type}', which this app cannot fill in. ` +
            `Supported types: ${SUPPORTED.join(', ')}.`
        );
      }
      out.push({
        slug: t.slug,
        name: t.name,
        type: t.type as TestType,
        order: out.length,
        sublist: sublistName,
      });
    }

    for (const childUrl of list.test_lists ?? []) {
      const child = await fetchJson(childUrl);
      await walk(child, child.name);
    }
  };

  await walk(await fetchJson(listUrl), null);
  return out;
}

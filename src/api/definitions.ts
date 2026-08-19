import type { TestDef, TestType } from './types';
import { DOWNLOADABLE_TYPES } from './types';
import { extractCalculationProcedure, testResourceUrl } from './procedures';

export type Fetcher = (url: string) => Promise<any>;

/** Paginated list fetch, e.g. RadClient.getAll. */
export type FetchAll = (path: string, params: Record<string, string>) => Promise<any[]>;

export type FlattenResult = {
  tests: TestDef[];
  /** From TestList.warning_message; empty string means no banner text. */
  warningMessage: string | null;
};

type SortEntry = {
  key: [number, number];
  testUrl: string;
  sublistName: string | null;
};

function apiBaseFromListUrl(listUrl: string): string {
  const idx = listUrl.indexOf('/qa/testlists/');
  if (idx >= 0) return listUrl.slice(0, idx);
  return listUrl.replace(/testlists\/\d+\/?$/, '');
}

/** Trailing numeric id from a RadMachine test list url, if any. */
export function listIdFromUrl(listUrl: string): string | null {
  const m = listUrl.match(/\/qa\/testlists\/(\d+)\/?$/);
  if (m) return m[1];
  const m2 = listUrl.match(/\/testlists\/(\d+)\/?$/);
  return m2 ? m2[1] : null;
}

function listPkFilter(listUrl: string, field: 'test_list' | 'parent'): Record<string, string> {
  const id = listIdFromUrl(listUrl);
  return id ? { [field]: id } : { [field]: listUrl };
}

function resourceUrl(raw: unknown): string | null {
  if (typeof raw === 'string' && raw) return raw;
  if (raw && typeof raw === 'object') {
    const url = (raw as Record<string, unknown>).url;
    if (typeof url === 'string' && url) return url;
  }
  return null;
}

function warningFromList(list: any): string | null {
  const msg = list?.warning_message;
  if (typeof msg !== 'string') return null;
  const trimmed = msg.trim();
  return trimmed || null;
}

async function defaultFetchAll(
  listUrl: string,
  fetchJson: Fetcher,
  path: string,
  params: Record<string, string>
): Promise<any[]> {
  const q = new URLSearchParams(params).toString();
  const url = `${apiBaseFromListUrl(listUrl)}${path}?${q}`;
  try {
    const r = await fetchJson(url);
    if (Array.isArray(r)) return r;
    if (Array.isArray(r?.results)) {
      const out = [...r.results];
      let next = r.next as string | null | undefined;
      while (next) {
        const page = await fetchJson(next);
        out.push(...(page?.results ?? []));
        next = page?.next;
      }
      return out;
    }
  } catch {
    // Older instances may not expose membership endpoints.
  }
  return [];
}

/**
 * RadMachine's testlists-details endpoint returns every test already flattened
 * in perform order. Prefer this when available — it avoids filter quirks on
 * testlistmemberships (which expects a list pk, not a full url).
 */
async function loadTestListDetails(
  listUrl: string,
  fetchJson: Fetcher
): Promise<any | null> {
  const id = listIdFromUrl(listUrl);
  if (!id) return null;
  try {
    return await fetchJson(`${apiBaseFromListUrl(listUrl)}/qa/testlists-details/${id}/`);
  } catch {
    return null;
  }
}

function orderedEntriesFromDetails(details: any): SortEntry[] | null {
  if (!Array.isArray(details?.tests) || details.tests.length === 0) return null;
  return details.tests.map((t: any, i: number) => {
    const testUrl = resourceUrl(t?.url ?? t);
    if (!testUrl) throw new Error('Test list details contain an invalid test reference');
    const sublist =
      typeof t?.sublist === 'string'
        ? t.sublist
        : typeof t?.sublist_name === 'string'
          ? t.sublist_name
          : null;
    return { key: [i, i] as [number, number], testUrl, sublistName: sublist };
  });
}

/**
 * Collect test urls in RadMachine order: TestListMembership.order interleaved
 * with Sublist.order, matching TestList.ordered_tests() on the server.
 */
async function orderedTestEntries(
  listUrl: string,
  sublistName: string | null,
  fetchCached: (url: string) => Promise<any>,
  fetchAll: FetchAll
): Promise<SortEntry[]> {
  const entries: SortEntry[] = [];

  const memberships = await fetchAll('/qa/testlistmemberships/', {
    ...listPkFilter(listUrl, 'test_list'),
    ordering: 'order',
  });
  for (const m of memberships) {
    const testUrl = resourceUrl(m.test);
    if (testUrl) entries.push({ key: [m.order, m.order], testUrl, sublistName });
  }

  const sublists = await fetchAll('/qa/sublists/', {
    ...listPkFilter(listUrl, 'parent'),
    ordering: 'order',
  });
  for (const sl of sublists) {
    const childUrl = resourceUrl(sl.child);
    if (!childUrl) continue;
    const child = await fetchCached(childUrl);
    const childName = typeof child?.name === 'string' ? child.name : sublistName;
    const childEntries = await orderedTestEntries(childUrl, childName, fetchCached, fetchAll);
    for (let i = 0; i < childEntries.length; i++) {
      const { key: _ignored, ...rest } = childEntries[i];
      entries.push({ key: [sl.order, i], ...rest });
    }
  }

  if (entries.length === 0) {
    const list = await fetchCached(listUrl);
    for (const rawTestRef of list.tests ?? []) {
      const n = entries.length;
      entries.push({
        key: [n, n],
        testUrl: testResourceUrl(rawTestRef),
        sublistName,
      });
    }
    for (const childRef of list.test_lists ?? []) {
      const childUrl = resourceUrl(childRef);
      if (!childUrl) continue;
      const child = await fetchCached(childUrl);
      const childEntries = await orderedTestEntries(
        childUrl,
        typeof child?.name === 'string' ? child.name : null,
        fetchCached,
        fetchAll
      );
      const base = 1000 + entries.length;
      for (let i = 0; i < childEntries.length; i++) {
        const { key: _ignored, ...rest } = childEntries[i];
        entries.push({ key: [base, i], ...rest });
      }
    }
  }

  entries.sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1]);
  return entries;
}

/**
 * Walk a test list and its sublists into a flat, ordered list of tests.
 *
 * Order follows RadMachine's TestList.ordered_tests(): memberships and sublists
 * are interleaved by their `order` field. When those API endpoints are
 * unavailable, falls back to top-level tests then each sublist in API order.
 *
 * Hand-entered tests (`simple`, `boolean`) are fillable; composites are
 * included for display only — RadMachine calculates them on POST. Any other
 * type is a hard error rather than a silently missing field on the worksheet.
 */
export async function flattenTestList(
  listUrl: string,
  fetchJson: Fetcher,
  fetchAll?: FetchAll
): Promise<FlattenResult> {
  const out: TestDef[] = [];
  const seenSlugs = new Set<string>();
  let warningMessage: string | null = null;

  const cache = new Map<string, Promise<any>>();
  const fetchCached = (url: string): Promise<any> => {
    let p = cache.get(url);
    if (!p) {
      p = fetchJson(url);
      cache.set(url, p);
    }
    return p;
  };

  const listAll: FetchAll =
    fetchAll ??
    ((path, params) => defaultFetchAll(listUrl, fetchJson, path, params));

  const root = await fetchCached(listUrl);
  warningMessage = warningFromList(root);

  const details = await loadTestListDetails(listUrl, fetchJson);
  if (details) warningMessage = warningFromList(details) ?? warningMessage;

  const entries =
    (details ? orderedEntriesFromDetails(details) : null) ??
    (await orderedTestEntries(listUrl, null, fetchCached, listAll));

  for (const entry of entries) {
    const t = await fetchCached(entry.testUrl);
    if (!DOWNLOADABLE_TYPES.includes(t.type)) {
      throw new Error(
        `Test '${t.slug}' is of type '${t.type}', which this app cannot download. ` +
          `Supported types: ${DOWNLOADABLE_TYPES.join(', ')}.`
      );
    }
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
      sublist: entry.sublistName,
      testUrl: entry.testUrl,
      calculationProcedure: extractCalculationProcedure(t),
    });
  }

  return { tests: out, warningMessage };
}

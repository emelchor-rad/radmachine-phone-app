import { flattenTestList, type FetchAll } from '../src/api/definitions';

const API = 'https://x/api';

// A fake fetcher standing in for the API: url -> payload
const payloads: Record<string, any> = {
  'https://x/testlists/571/': {
    name: 'Daily :: Linac QA :: TG-142 Demos',
    warning_message: 'Do not treat',
    tests: ['https://x/tests/1/'],
    test_lists: ['https://x/testlists/900/', 'https://x/testlists/901/'],
  },
  'https://x/testlists/900/': {
    name: 'TG-142 Daily :: CBCT',
    tests: ['https://x/tests/2/', 'https://x/tests/3/'],
    test_lists: [],
  },
  'https://x/testlists/901/': {
    name: 'TG-142 Daily :: Safety',
    tests: ['https://x/tests/4/'],
    test_lists: [],
  },
  'https://x/tests/1/': { slug: 'mlc_check_weekly', name: 'MLC', type: 'boolean' },
  'https://x/tests/2/': { slug: 'cbct_a', name: 'CBCT A', type: 'boolean' },
  'https://x/tests/3/': { slug: 'cbct_b', name: 'CBCT B', type: 'simple' },
  'https://x/tests/4/': { slug: 'beam_on', name: 'Beam on', type: 'boolean' },
};

function membershipKey(listId: string): string {
  return `${API}/qa/testlistmemberships/?test_list=${listId}&ordering=order`;
}

function sublistKey(listId: string): string {
  return `${API}/qa/sublists/?parent=${listId}&ordering=order`;
}

/** RadMachine order: top test, then CBCT sublist, then Safety sublist. */
const memberships: Record<string, any> = {
  [membershipKey('571')]: {
    results: [{ test: 'https://x/tests/1/', order: 0 }],
  },
  [membershipKey('900')]: {
    results: [
      { test: 'https://x/tests/2/', order: 0 },
      { test: 'https://x/tests/3/', order: 1 },
    ],
  },
  [membershipKey('901')]: {
    results: [{ test: 'https://x/tests/4/', order: 0 }],
  },
};

const sublists: Record<string, any> = {
  [sublistKey('571')]: {
    results: [
      { child: 'https://x/testlists/900/', order: 1 },
      { child: 'https://x/testlists/901/', order: 2 },
    ],
  },
  [sublistKey('900')]: { results: [] },
  [sublistKey('901')]: { results: [] },
};

const fetcher = async (url: string) => {
  const all = { ...payloads, ...memberships, ...sublists };
  if (all[url] !== undefined) return all[url];
  throw new Error(`unexpected fetch: ${url}`);
};

const fetchAll: FetchAll = async (path, params) => {
  const q = new URLSearchParams(params).toString();
  const url = `${API}${path}?${q}`;
  const r = await fetcher(url);
  return r.results ?? [];
};

async function flatten(url: string, f = fetcher, fa?: FetchAll) {
  const { tests } = await flattenTestList(url, f, fa);
  return tests;
}

// Variant of the base fixture where the Safety sublist (901) ALSO references
// the CBCT A test (tests/2) that the CBCT sublist (900) already references --
// a test genuinely shared by two sublists in the source test list.
const payloadsSharedTest: Record<string, any> = {
  ...payloads,
  'https://x/testlists/901/': {
    name: 'TG-142 Daily :: Safety',
    tests: ['https://x/tests/2/', 'https://x/tests/4/'],
    test_lists: [],
  },
};

const membershipsShared: Record<string, any> = {
  ...memberships,
  [membershipKey('901')]: {
    results: [
      { test: 'https://x/tests/2/', order: 0 },
      { test: 'https://x/tests/4/', order: 1 },
    ],
  },
};

test('top-level tests come first, then each sublist in order', async () => {
  const out = await flatten('https://x/testlists/571/', fetcher, fetchAll);
  expect(out.map((t) => t.slug)).toEqual(['mlc_check_weekly', 'cbct_a', 'cbct_b', 'beam_on']);
});

test('order is a contiguous index over the whole flattened list', async () => {
  const out = await flatten('https://x/testlists/571/', fetcher, fetchAll);
  expect(out.map((t) => t.order)).toEqual([0, 1, 2, 3]);
});

test('each test remembers the sublist it came from', async () => {
  const out = await flatten('https://x/testlists/571/', fetcher, fetchAll);
  expect(out[0].sublist).toBeNull();
  expect(out[1].sublist).toBe('TG-142 Daily :: CBCT');
  expect(out[3].sublist).toBe('TG-142 Daily :: Safety');
});

test('types are carried through', async () => {
  const out = await flatten('https://x/testlists/571/', fetcher, fetchAll);
  expect(out[2]).toMatchObject({ slug: 'cbct_b', type: 'simple' });
});

test('warning_message is read from the test list', async () => {
  const { warningMessage } = await flattenTestList('https://x/testlists/571/', fetcher, fetchAll);
  expect(warningMessage).toBe('Do not treat');
});

test('prefers testlists-details order when that endpoint is available', async () => {
  const detailsPayloads: Record<string, any> = {
    ...payloads,
    'https://x/api/qa/testlists-details/100/': {
      warning_message: 'Do not treat',
      tests: [
        { url: 'https://x/tests/num/', slug: 'just_a_number', name: 'Just a number', type: 'simple' },
        { url: 'https://x/tests/calc/', slug: 'just_a_calc', name: 'Just a calculation', type: 'composite' },
      ],
    },
    'https://x/tests/num/': { slug: 'just_a_number', name: 'Just a number', type: 'simple' },
    'https://x/tests/calc/': { slug: 'just_a_calc', name: 'Just a calculation', type: 'composite' },
    'https://x/testlists/100/': {
      name: 'Simple composite test list',
      // Wrong M2M order on purpose — details should win.
      tests: ['https://x/tests/calc/', 'https://x/tests/num/'],
      test_lists: [],
    },
  };
  const f = async (url: string) => detailsPayloads[url];
  const out = await flatten('https://x/api/qa/testlists/100/', f, fetchAll);
  expect(out.map((t) => t.slug)).toEqual(['just_a_number', 'just_a_calc']);
});

test('input tests come before composites when membership order says so', async () => {
  const compositePayloads: Record<string, any> = {
    'https://x/testlists/100/': {
      name: 'Simple composite test list',
      warning_message: 'Do not treat',
      // API M2M order wrong on purpose — memberships fix it.
      tests: ['https://x/tests/calc/', 'https://x/tests/num/'],
      test_lists: [],
    },
    'https://x/tests/num/': { slug: 'just_a_number', name: 'Just a number', type: 'simple' },
    'https://x/tests/calc/': { slug: 'just_a_calc', name: 'Just a calculation', type: 'composite' },
    [membershipKey('100')]: {
      results: [
        { test: 'https://x/tests/num/', order: 0 },
        { test: 'https://x/tests/calc/', order: 1 },
      ],
    },
    [sublistKey('100')]: { results: [] },
  };
  const f = async (url: string) => compositePayloads[url];
  const fa: FetchAll = async (path, params) => {
    const q = new URLSearchParams(params).toString();
    const r = await f(`${API}${path}?${q}`);
    return r.results ?? [];
  };
  const out = await flatten('https://x/testlists/100/', f, fa);
  expect(out.map((t) => t.slug)).toEqual(['just_a_number', 'just_a_calc']);
});

test('no url is fetched twice, even when a test is shared by two sublists', async () => {
  const sharedFetchAll: FetchAll = async (path, params) => {
    const q = new URLSearchParams(params).toString();
    const url = `${API}${path}?${q}`;
    const all = { ...membershipsShared, ...sublists };
    return all[url]?.results ?? [];
  };
  const seen: string[] = [];
  const counting = async (url: string) => {
    seen.push(url);
    const all = { ...payloadsSharedTest, ...membershipsShared, ...sublists };
    return all[url];
  };
  await expect(flattenTestList('https://x/testlists/571/', counting, sharedFetchAll)).rejects.toThrow(
    /cbct_a/
  );
  expect(seen.filter((u) => u === 'https://x/tests/2/')).toHaveLength(1);
  expect(seen).toHaveLength(new Set(seen).size);
});

test('a test referenced from two sublists is rejected as a duplicate slug', async () => {
  const sharedFetchAll: FetchAll = async (path, params) => {
    const q = new URLSearchParams(params).toString();
    const url = `${API}${path}?${q}`;
    const all = { ...membershipsShared, ...sublists };
    return all[url]?.results ?? [];
  };
  const f = async (url: string) => {
    const all = { ...payloadsSharedTest, ...membershipsShared, ...sublists };
    return all[url];
  };
  await expect(flattenTestList('https://x/testlists/571/', f, sharedFetchAll)).rejects.toThrow(/cbct_a/);
  await expect(flattenTestList('https://x/testlists/571/', f, sharedFetchAll)).rejects.toThrow(/twice/);
});

test('a test type v1 cannot render is rejected loudly', async () => {
  const withUpload: Record<string, any> = {
    ...payloads,
    ...memberships,
    ...sublists,
    'https://x/tests/4/': { slug: 'up', name: 'Upload', type: 'upload' },
  };
  const f = async (url: string) => withUpload[url];
  await expect(flattenTestList('https://x/testlists/571/', f, fetchAll)).rejects.toThrow(/upload/);
});

test('composite and scomposite tests are included for display', async () => {
  const compositeMemberships: Record<string, any> = {
    ...memberships,
    [membershipKey('901')]: {
      results: [
        { test: 'https://x/tests/4/', order: 0 },
        { test: 'https://x/tests/5/', order: 1 },
      ],
    },
  };
  const withComposite: Record<string, any> = {
    ...payloads,
    ...compositeMemberships,
    ...sublists,
    'https://x/tests/4/': { slug: 'avg_dose', name: 'Average dose', type: 'composite' },
    'https://x/tests/5/': { slug: 'ratio', name: 'Ratio', type: 'scomposite' },
    'https://x/testlists/901/': {
      name: 'TG-142 Daily :: Safety',
      tests: ['https://x/tests/4/', 'https://x/tests/5/'],
      test_lists: [],
    },
  };
  const compositeFetchAll: FetchAll = async (path, params) => {
    const q = new URLSearchParams(params).toString();
    const url = `${API}${path}?${q}`;
    return compositeMemberships[url]?.results ?? sublists[url]?.results ?? [];
  };
  const f = async (url: string) => withComposite[url];
  const out = await flatten('https://x/testlists/571/', f, compositeFetchAll);
  expect(out.map((t) => t.slug)).toEqual([
    'mlc_check_weekly',
    'cbct_a',
    'cbct_b',
    'avg_dose',
    'ratio',
  ]);
  expect(out[3]).toMatchObject({ slug: 'avg_dose', type: 'composite' });
  expect(out[4]).toMatchObject({ slug: 'ratio', type: 'scomposite' });
});

test('string tests are included for download', async () => {
  const withString: Record<string, any> = {
    ...payloads,
    ...memberships,
    ...sublists,
    'https://x/tests/4/': { slug: 'notes', name: 'Notes', type: 'string' },
  };
  const f = async (url: string) => withString[url];
  const out = await flatten('https://x/testlists/571/', f, fetchAll);
  expect(out.find((t) => t.slug === 'notes')).toMatchObject({ type: 'string' });
});

test('falls back to legacy tests field when membership endpoints are missing', async () => {
  const legacyOnly = async (url: string) => payloads[url];
  const out = await flatten('https://x/testlists/571/', legacyOnly);
  expect(out.map((t) => t.slug)).toEqual(['mlc_check_weekly', 'cbct_a', 'cbct_b', 'beam_on']);
});

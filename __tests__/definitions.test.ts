import { flattenTestList } from '../src/api/definitions';

// A fake fetcher standing in for the API: url -> payload
const payloads: Record<string, any> = {
  'https://x/testlists/571/': {
    name: 'Daily :: Linac QA :: TG-142 Demos',
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

const fetcher = async (url: string) => payloads[url];

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

test('top-level tests come first, then each sublist in order', async () => {
  const out = await flattenTestList('https://x/testlists/571/', fetcher);
  expect(out.map((t) => t.slug)).toEqual(['mlc_check_weekly', 'cbct_a', 'cbct_b', 'beam_on']);
});

test('order is a contiguous index over the whole flattened list', async () => {
  const out = await flattenTestList('https://x/testlists/571/', fetcher);
  expect(out.map((t) => t.order)).toEqual([0, 1, 2, 3]);
});

test('each test remembers the sublist it came from', async () => {
  const out = await flattenTestList('https://x/testlists/571/', fetcher);
  expect(out[0].sublist).toBeNull();
  expect(out[1].sublist).toBe('TG-142 Daily :: CBCT');
  expect(out[3].sublist).toBe('TG-142 Daily :: Safety');
});

test('types are carried through', async () => {
  const out = await flattenTestList('https://x/testlists/571/', fetcher);
  expect(out[2]).toMatchObject({ slug: 'cbct_b', type: 'simple' });
});

test('no url is fetched twice, even when a test is shared by two sublists', async () => {
  // Downloading a definition happens over a phone connection, often a poor
  // one. Every redundant round trip is time the physicist spends waiting.
  //
  // A fixture where no url is ever shared between parents would pass this
  // assertion for the wrong reason -- a naive implementation with no dedup
  // at all also fetches every url exactly once there. Only a genuinely
  // shared child (tests/2, referenced by both the CBCT and Safety sublists)
  // actually exercises the dedup path. That same sharing is also a slug
  // collision (see the rejection test below), so this test reaches into the
  // rejection to prove the dedup happened BEFORE the collision was detected,
  // not that the collision was silently accepted.
  const seen: string[] = [];
  const counting = async (url: string) => {
    seen.push(url);
    return payloadsSharedTest[url];
  };
  await expect(flattenTestList('https://x/testlists/571/', counting)).rejects.toThrow(
    /cbct_a/
  );
  expect(seen.filter((u) => u === 'https://x/tests/2/')).toHaveLength(1);
  expect(seen).toHaveLength(new Set(seen).size);
});

test('a test referenced from two sublists is rejected as a duplicate slug', async () => {
  // saveCollection INSERTs on PRIMARY KEY (utc_url, slug); a second test
  // with the same slug aborts that transaction with a raw SQLite constraint
  // error. Reject it here instead, loudly and by name.
  const f = async (url: string) => payloadsSharedTest[url];
  await expect(flattenTestList('https://x/testlists/571/', f)).rejects.toThrow(/cbct_a/);
  await expect(flattenTestList('https://x/testlists/571/', f)).rejects.toThrow(/twice/);
});

test('a test type v1 cannot render is rejected loudly', async () => {
  const withUpload: Record<string, any> = {
    ...payloads,
    'https://x/tests/4/': { slug: 'up', name: 'Upload', type: 'upload' },
  };
  const f = async (url: string) => withUpload[url];
  await expect(flattenTestList('https://x/testlists/571/', f)).rejects.toThrow(/upload/);
});

test('composite and s_composite tests are included for display', async () => {
  const withComposite: Record<string, any> = {
    ...payloads,
    'https://x/tests/4/': { slug: 'avg_dose', name: 'Average dose', type: 'composite' },
    'https://x/testlists/901/': {
      name: 'TG-142 Daily :: Safety',
      tests: ['https://x/tests/4/', 'https://x/tests/5/'],
      test_lists: [],
    },
    'https://x/tests/5/': { slug: 'ratio', name: 'Ratio', type: 's_composite' },
  };
  const f = async (url: string) => withComposite[url];
  const out = await flattenTestList('https://x/testlists/571/', f);
  expect(out.map((t) => t.slug)).toEqual([
    'mlc_check_weekly',
    'cbct_a',
    'cbct_b',
    'avg_dose',
    'ratio',
  ]);
  expect(out[3]).toMatchObject({ slug: 'avg_dose', type: 'composite' });
  expect(out[4]).toMatchObject({ slug: 'ratio', type: 's_composite' });
});

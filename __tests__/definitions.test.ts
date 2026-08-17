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

test('no url is fetched twice', async () => {
  // Downloading a definition happens over a phone connection, often a poor
  // one. Every redundant round trip is time the physicist spends waiting.
  const seen: string[] = [];
  const counting = async (url: string) => {
    seen.push(url);
    return payloads[url];
  };
  await flattenTestList('https://x/testlists/571/', counting);
  expect(seen).toHaveLength(new Set(seen).size);
});

test('a test type v1 cannot render is rejected loudly', async () => {
  const withUpload: Record<string, any> = {
    ...payloads,
    'https://x/tests/4/': { slug: 'up', name: 'Upload', type: 'upload' },
  };
  const f = async (url: string) => withUpload[url];
  await expect(flattenTestList('https://x/testlists/571/', f)).rejects.toThrow(/upload/);
});

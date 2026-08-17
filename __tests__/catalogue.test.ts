import {
  ALL,
  NO_FREQ,
  TEST_LIST,
  TEST_LIST_CYCLE,
  buildCatalogue,
  contentTypeIds,
  definitionUrl,
  hiddenNotice,
  splitByContentType,
  type CatalogueInput,
  type RawCollection,
  type RawContentType,
} from '../src/api/catalogue';

// The two content types the measured tenant actually serves. The integers are
// deliberately NOT round or adjacent: any implementation that recognised a test
// list by its pk instead of its model name would have to hardcode one of these,
// and the "resolved by model name" test below swaps them to prove it does not.
const CT_LIST = 'https://x/contenttypes/contenttypes/2/';
const CT_CYCLE = 'https://x/contenttypes/contenttypes/22/';

const contentTypes: RawContentType[] = [
  { url: CT_LIST, app_label: 'qa', model: 'testlist' },
  { url: CT_CYCLE, app_label: 'qa', model: 'testlistcycle' },
];

const U1 = 'https://x/units/1/';
const U2 = 'https://x/units/2/';
const U9 = 'https://x/units/9/';
const F_DAILY = 'https://x/frequencies/1/';
const F_MONTHLY = 'https://x/frequencies/2/';

const units = [
  { url: U1, name: 'TrueBeam 1' },
  { url: U2, name: 'Halcyon' },
  { url: U9, name: 'Cycle-only unit' },
];
const frequencies = [
  { url: F_DAILY, name: 'Daily' },
  { url: F_MONTHLY, name: 'Monthly' },
];

function col(p: Partial<RawCollection> & { url: string }): RawCollection {
  return {
    name: `list ${p.url}`,
    unit: U1,
    frequency: F_DAILY,
    content_type: CT_LIST,
    object_id: 1,
    ...p,
  };
}

// 1 daily on TrueBeam, 1 monthly on Halcyon, 1 ad hoc on Halcyon,
// 1 cycle on a unit that has nothing else.
const collections: RawCollection[] = [
  col({ url: 'https://x/utc/1/', name: 'Daily TrueBeam', unit: U1, frequency: F_DAILY }),
  col({ url: 'https://x/utc/2/', name: 'Monthly Halcyon', unit: U2, frequency: F_MONTHLY }),
  col({ url: 'https://x/utc/3/', name: 'Ad hoc Halcyon', unit: U2, frequency: null }),
  col({
    url: 'https://x/utc/4/',
    name: 'Weekly cycle',
    unit: U9,
    frequency: F_DAILY,
    content_type: CT_CYCLE,
    object_id: 2, // the pk of a REAL but unrelated test list -- the whole bug
  }),
];

function view(over: Partial<CatalogueInput> = {}) {
  return buildCatalogue({
    collections,
    units,
    frequencies,
    contentTypes,
    unitFilter: ALL,
    freqFilter: ALL,
    ...over,
  });
}

// --- content types ---------------------------------------------------------

test('a cycle is excluded and a test list kept', () => {
  const v = view();
  expect(v.rows.map((r) => r.name)).toEqual([
    'Daily TrueBeam',
    'Monthly Halcyon',
    'Ad hoc Halcyon',
  ]);
  expect(v.hidden).toEqual({ cycles: 1, unresolved: 0 });
});

test('the decision follows the model name, not the content type pk', () => {
  // Same collections, but the tenant assigns the pks the other way round. A
  // pk-based implementation would now show the cycle and hide the lists.
  const swapped: RawContentType[] = [
    { url: CT_LIST, app_label: 'qa', model: 'testlistcycle' },
    { url: CT_CYCLE, app_label: 'qa', model: 'testlist' },
  ];
  const v = view({ contentTypes: swapped });
  expect(v.rows.map((r) => r.name)).toEqual(['Weekly cycle']);
  expect(v.hidden).toEqual({ cycles: 3, unresolved: 0 });
});

test('an unresolvable content type is refused, not assumed to be a test list', () => {
  const odd: RawCollection[] = [
    col({ url: 'https://x/utc/10/', name: 'null content type', content_type: null }),
    col({ url: 'https://x/utc/11/', name: 'unlisted content type', content_type: 'https://x/contenttypes/contenttypes/99/' }),
    col({ url: 'https://x/utc/12/', name: 'fine' }),
  ];
  const v = view({ collections: odd });
  expect(v.rows.map((r) => r.name)).toEqual(['fine']);
  expect(v.hidden).toEqual({ cycles: 0, unresolved: 2 });
});

test('a content type row with no model name resolves nothing', () => {
  // Guessing from app_label alone, or from position in the list, would let this
  // through. contentTypeIds drops it, so its collections are refused.
  expect(contentTypeIds([{ url: CT_LIST, app_label: 'qa' }])).toEqual({});
  const v = view({ contentTypes: [{ url: CT_LIST, app_label: 'qa' }] });
  expect(v.rows).toEqual([]);
  expect(v.hidden).toEqual({ cycles: 0, unresolved: 4 });
});

test('a testlist model in some other app is not a qa test list', () => {
  // Matching the model name alone would make this downloadable and fetch it from
  // /qa/testlists/<object_id>/ -- the wrong-list bug by another route.
  const v = view({
    contentTypes: [
      { url: CT_LIST, app_label: 'somethingelse', model: 'testlist' },
      { url: CT_CYCLE, app_label: 'qa', model: 'testlistcycle' },
    ],
  });
  expect(v.rows).toEqual([]);
  expect(v.hidden).toEqual({ cycles: 1, unresolved: 3 });
});

test('contentTypeIds keys on the dotted app_label.model identity', () => {
  expect(contentTypeIds(contentTypes)).toEqual({
    [CT_LIST]: TEST_LIST,
    [CT_CYCLE]: TEST_LIST_CYCLE,
  });
  expect(TEST_LIST).toBe('qa.testlist');
  expect(TEST_LIST_CYCLE).toBe('qa.testlistcycle');
});

test('a content_type serialized as a bare pk resolves to nothing, not to a list', () => {
  // A tenant whose serializer emits the integer instead of a hyperlink must not
  // read as "plain test list". Refusing is the safe direction, and the notice
  // says so.
  const v = view({
    collections: [col({ url: 'https://x/utc/1/', content_type: '2' as any })],
  });
  expect(v.rows).toEqual([]);
  expect(v.hiddenNotice).toMatch(/content type unknown/);
});

test('no content types at all hides everything rather than downloading blind', () => {
  const v = view({ contentTypes: [] });
  expect(v.rows).toEqual([]);
  expect(v.hidden.unresolved).toBe(4);
});

test('splitByContentType tallies without reordering the kept lists', () => {
  const { lists, hidden } = splitByContentType(collections, {
    [CT_LIST]: TEST_LIST,
    [CT_CYCLE]: TEST_LIST_CYCLE,
  });
  expect(lists.map((c) => c.url)).toEqual([
    'https://x/utc/1/',
    'https://x/utc/2/',
    'https://x/utc/3/',
  ]);
  expect(hidden.cycles).toBe(1);
});

// --- the notice the user reads ---------------------------------------------

test('hiding is never silent', () => {
  expect(view().hiddenNotice).toBe('1 cycle hidden — cycles are not supported yet.');
});

test('the notice pluralises cycles', () => {
  expect(hiddenNotice({ cycles: 3, unresolved: 0 })).toBe(
    '3 cycles hidden — cycles are not supported yet.'
  );
});

test('the notice names an unresolved content type separately', () => {
  expect(hiddenNotice({ cycles: 0, unresolved: 2 })).toBe(
    '2 collections hidden — content type unknown, so the test list cannot be identified safely.'
  );
  expect(hiddenNotice({ cycles: 1, unresolved: 1 })).toBe(
    '1 cycle hidden — cycles are not supported yet. ' +
      '1 collection hidden — content type unknown, so the test list cannot be identified safely.'
  );
});

test('nothing hidden says nothing', () => {
  expect(hiddenNotice({ cycles: 0, unresolved: 0 })).toBe('');
  const v = view({ collections: [col({ url: 'https://x/utc/1/' })] });
  expect(v.hiddenNotice).toBe('');
});

// --- filter sentinels ------------------------------------------------------

test('ALL on both filters shows every test list', () => {
  const v = view();
  expect(v.visible).toHaveLength(3);
  expect(v.visible).toEqual(v.rows);
});

test('ALL unit still respects a frequency filter, and the reverse', () => {
  expect(view({ freqFilter: F_MONTHLY }).visible.map((r) => r.name)).toEqual([
    'Monthly Halcyon',
  ]);
  expect(view({ unitFilter: U2 }).visible.map((r) => r.name)).toEqual([
    'Monthly Halcyon',
    'Ad hoc Halcyon',
  ]);
});

test('NO_FREQ selects exactly the collections with no frequency', () => {
  const v = view({ freqFilter: NO_FREQ });
  expect(v.visible.map((r) => r.name)).toEqual(['Ad hoc Halcyon']);
});

test('NO_FREQ is not a unit-blind escape hatch', () => {
  // The sentinel is a frequency value, so it must still intersect with the unit
  // filter rather than short-circuiting the whole predicate.
  expect(view({ unitFilter: U2, freqFilter: NO_FREQ }).visible.map((r) => r.name)).toEqual([
    'Ad hoc Halcyon',
  ]);
  expect(view({ unitFilter: U1, freqFilter: NO_FREQ }).visible).toEqual([]);
});

test('the sentinels cannot collide with a real url', () => {
  expect(collections.some((c) => c.unit === ALL || c.frequency === ALL)).toBe(false);
  expect(ALL.startsWith('http')).toBe(false);
  expect(NO_FREQ.startsWith('http')).toBe(false);
});

test('a stale filter naming a hidden cycle unit yields an empty list, not a crash', () => {
  expect(view({ unitFilter: U9 }).visible).toEqual([]);
});

test('a stale frequency filter no longer present yields an empty list', () => {
  expect(view({ freqFilter: 'https://x/frequencies/gone/' }).visible).toEqual([]);
});

test('a collection with no unit is reachable only through All units', () => {
  // There is no "No unit" option, so ALL is its one route in. Pre-existing
  // behaviour, pinned here because it lives in a comment otherwise.
  const orphan = [col({ url: 'https://x/utc/1/', name: 'orphan', unit: null })];
  const v = view({ collections: orphan });
  expect(v.unitOptions.map((o) => o.value)).toEqual([ALL]);
  expect(v.visible.map((r) => r.name)).toEqual(['orphan']);
});

// --- the definition url ----------------------------------------------------

test('the definition url is built from object_id, which survives onto the row', () => {
  const v = view();
  expect(v.rows[0].object_id).toBe(1);
  expect(definitionUrl(v.rows[0], 'https://x/api')).toBe('https://x/api/qa/testlists/1/');
});

test('the cycle whose object_id would have collided never reaches a row', () => {
  // utc/4 is a cycle with object_id 2 -- the pk of a real, unrelated test list.
  // Nothing that buildCatalogue returns can produce that url.
  const v = view();
  expect(v.rows.map((r) => definitionUrl(r, 'https://x/api'))).not.toContain(
    'https://x/api/qa/testlists/2/'
  );
});

// --- dropdown options ------------------------------------------------------

test('unit options cover only units with a downloadable list', () => {
  const v = view();
  // U9 carries the cycle only: offering it would read as "0 of 3".
  expect(v.unitOptions).toEqual([
    { value: ALL, label: 'All units (2)' },
    { value: U2, label: 'Halcyon' },
    { value: U1, label: 'TrueBeam 1' },
  ]);
});

test('frequency options lead with the two sentinels and count the ad hoc bucket', () => {
  const v = view();
  expect(v.freqOptions).toEqual([
    { value: ALL, label: 'All frequencies' },
    { value: NO_FREQ, label: 'No frequency (ad hoc) (1)' },
    { value: F_DAILY, label: 'Daily' },
    { value: F_MONTHLY, label: 'Monthly' },
  ]);
});

test('the ad hoc count ignores hidden collections', () => {
  const withAdHocCycle = [
    ...collections,
    col({ url: 'https://x/utc/5/', frequency: null, content_type: CT_CYCLE }),
  ];
  const v = view({ collections: withAdHocCycle });
  expect(v.freqOptions[1].label).toBe('No frequency (ad hoc) (1)');
});

test('options are deduplicated', () => {
  const many = [
    col({ url: 'https://x/utc/a/' }),
    col({ url: 'https://x/utc/b/' }),
    col({ url: 'https://x/utc/c/' }),
  ];
  const v = view({ collections: many });
  expect(v.unitOptions).toHaveLength(2); // ALL + one unit
  expect(v.freqOptions).toHaveLength(3); // ALL + NO_FREQ + one frequency
});

// --- resolved labels -------------------------------------------------------

test('rows carry resolved unit and frequency text', () => {
  const v = view();
  expect(v.rows[0]).toMatchObject({ unitLabel: 'TrueBeam 1', freqLabel: 'Daily' });
  expect(v.rows[2]).toMatchObject({ unitLabel: 'Halcyon', freqLabel: 'ad hoc' });
});

test('an unnameable unit or frequency says so instead of rendering a url', () => {
  const v = view({
    collections: [
      col({ url: 'https://x/utc/1/', unit: 'https://x/units/404/', frequency: 'https://x/frequencies/404/' }),
      col({ url: 'https://x/utc/2/', unit: null, frequency: null }),
    ],
  });
  expect(v.rows[0]).toMatchObject({
    unitLabel: 'Unknown unit',
    freqLabel: 'Unknown frequency',
  });
  expect(v.rows[1]).toMatchObject({ unitLabel: 'No unit', freqLabel: 'ad hoc' });
});

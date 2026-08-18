import { buildPayload } from '../src/sync/payload';
import type { TestDef, Draft } from '../src/api/types';

const defs: TestDef[] = [
  { slug: 'beam_on', name: 'Beam on', type: 'boolean', order: 0, sublist: 'Safety' },
  { slug: 'coll_size', name: 'Collimator', type: 'simple', order: 1, sublist: 'Mechanical' },
  { slug: 'odi_at_iso', name: 'ODI', type: 'simple', order: 2, sublist: 'Mechanical' },
];

const draft: Draft = {
  userKey: 'abc-123',
  utcUrl: 'https://example/api/qa/unittestcollections/105/',
  workStarted: '2026-08-17 07:40:00',
  workCompleted: '2026-08-17 07:55:00',
  values: {
    beam_on: { value: true },
    coll_size: { value: 10.2, comment: 'slightly off' },
    // odi_at_iso deliberately absent
  },
};

test('every test in the definition appears in the payload', () => {
  const p = buildPayload(defs, draft);
  expect(Object.keys(p.tests).sort()).toEqual(['beam_on', 'coll_size', 'odi_at_iso']);
});

test('an unfilled test is submitted as skipped', () => {
  const p = buildPayload(defs, draft);
  expect(p.tests.odi_at_iso).toEqual({ skipped: true });
});

test('a null value is submitted as skipped', () => {
  const d = { ...draft, values: { ...draft.values, odi_at_iso: { value: null } } };
  expect(buildPayload(defs, d).tests.odi_at_iso).toEqual({ skipped: true });
});

test('booleans keep their true/false type', () => {
  const p = buildPayload(defs, draft);
  expect(p.tests.beam_on).toEqual({ value: true });
});

test('false is a real value, not an empty one', () => {
  const d = { ...draft, values: { ...draft.values, beam_on: { value: false } } };
  expect(buildPayload(defs, d).tests.beam_on).toEqual({ value: false });
});

test('a comment travels with the value', () => {
  const p = buildPayload(defs, draft);
  expect(p.tests.coll_size).toEqual({ value: 10.2, comment: 'slightly off' });
});

test('an empty comment is omitted', () => {
  const d = { ...draft, values: { ...draft.values, coll_size: { value: 1, comment: '   ' } } };
  expect(buildPayload(defs, d).tests.coll_size).toEqual({ value: 1 });
});

test('the envelope carries the UTC url, user key and phone timestamps', () => {
  const p = buildPayload(defs, draft);
  expect(p.unit_test_collection).toBe('https://example/api/qa/unittestcollections/105/');
  expect(p.user_key).toBe('abc-123');
  expect(p.work_started).toBe('2026-08-17 07:40:00');
  expect(p.work_completed).toBe('2026-08-17 07:55:00');
  expect(p.day).toBe(0);
  expect(p.in_progress).toBe(false);
});

test('a value for a test not in the definition is dropped', () => {
  const d = { ...draft, values: { ...draft.values, ghost_test: { value: 1 } } };
  expect(buildPayload(defs, d).tests).not.toHaveProperty('ghost_test');
});

test('composite tests are never included in the payload', () => {
  const withComposite: TestDef[] = [
    ...defs,
    { slug: 'avg', name: 'Average', type: 'composite', order: 3, sublist: null },
    { slug: 'ratio', name: 'Ratio', type: 'scomposite', order: 4, sublist: null },
  ];
  const p = buildPayload(withComposite, draft);
  expect(Object.keys(p.tests).sort()).toEqual(['beam_on', 'coll_size', 'odi_at_iso']);
});

test('a string value is submitted as text', () => {
  const withString: TestDef[] = [
    ...defs,
    { slug: 'notes', name: 'Notes', type: 'string', order: 3, sublist: null },
  ];
  const d = {
    ...draft,
    values: { ...draft.values, notes: { value: 'OK after warm-up' } },
  };
  expect(buildPayload(withString, d).tests.notes).toEqual({ value: 'OK after warm-up' });
});

test('an empty string is submitted as skipped', () => {
  const withString: TestDef[] = [
    { slug: 'notes', name: 'Notes', type: 'string', order: 0, sublist: null },
  ];
  const d = { ...draft, values: { notes: { value: '' } } };
  expect(buildPayload(withString, d).tests.notes).toEqual({ skipped: true });
});

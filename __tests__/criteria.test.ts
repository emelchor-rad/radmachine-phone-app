import {
  attachCriteria,
  countWithCriteria,
  criteriaFromUti,
  normalizeApiUrl,
  utiMatchesListTest,
} from '../src/api/criteria';
import { listHasToleranceWarning } from '../src/qa/tolerance-warning';
import type { TestCriteria, TestDef } from '../src/api/types';

const BASE = 'https://x/api';

test('normalizeApiUrl ignores trailing slash differences', () => {
  const a = 'https://radmachine.radformation.com/emelchor/api/qa/tests/12/';
  const b = 'https://radmachine.radformation.com/emelchor/api/qa/tests/12';
  expect(normalizeApiUrl(a)).toBe(normalizeApiUrl(b));
});

test('listHasToleranceWarning is true when a composite is action', () => {
  const band: TestCriteria = {
    refValue: 50,
    refType: 'numerical',
    tolType: 'absolute',
    actLow: -5,
    tolLow: -2,
    tolHigh: 2,
    actHigh: 5,
  };
  const tests: TestDef[] = [
    { slug: 'n', name: 'Number', type: 'simple', order: 0, sublist: null, criteria: band },
    { slug: 'c', name: 'Calc', type: 'composite', order: 1, sublist: null, criteria: band },
  ];
  expect(
    listHasToleranceWarning(tests, { n: { value: 6 } }, { c: 60 })
  ).toBe(true);
});

test('listHasToleranceWarning is false without criteria', () => {
  const tests: TestDef[] = [
    { slug: 'c', name: 'Calc', type: 'composite', order: 0, sublist: null },
  ];
  expect(listHasToleranceWarning(tests, {}, { c: 60 })).toBe(false);
});

test('criteriaFromUti accepts embedded reference and tolerance objects', () => {
  const c = criteriaFromUti(
    {
      test: `${BASE}/qa/tests/1/`,
      reference: { type: 'numerical', value: 50 },
      tolerance: { type: 'absolute', act_low: -5, tol_low: -2, tol_high: 2, act_high: 5 },
    },
    new Map(),
    new Map()
  );
  expect(c).toMatchObject({ refValue: 50, tolType: 'absolute', tolLow: -2, actHigh: 5 });
});

test('utiMatchesListTest matches by normalized url or test id', () => {
  const uti = {
    test: `${BASE}/qa/tests/99/`,
    reference: null,
    tolerance: null,
  };
  const tests: TestDef[] = [
    {
      slug: 'x',
      name: 'X',
      type: 'simple',
      order: 0,
      sublist: null,
      testUrl: `${BASE}/qa/tests/99`,
    },
  ];
  expect(utiMatchesListTest(uti, tests)).toBe(true);
  expect(
    utiMatchesListTest(
      { test: `${BASE}/qa/tests/100/`, reference: null, tolerance: null },
      tests
    )
  ).toBe(false);
});

test('attachCriteria uses unittestinfos and matches by test id when urls differ slightly', async () => {
  const utis = [
    {
      test: `${BASE}/qa/tests/99/`,
      reference: `${BASE}/qa/references/1/`,
      tolerance: `${BASE}/qa/tolerances/1/`,
    },
  ];
  const gets: Record<string, unknown> = {
    [`${BASE}/qa/references/1/`]: { type: 'numerical', value: 50 },
    [`${BASE}/qa/tolerances/1/`]: {
      type: 'absolute',
      act_low: -5,
      tol_low: -2,
      tol_high: 2,
      act_high: 5,
    },
  };
  const client = {
    getAll: jest.fn(async (path: string, params?: Record<string, string>) => {
      if (path === '/qa/unittestinfos/' && params?.unit === '7') return utis;
      if (path === '/qa/unittestinfo/' && params?.unit === '7') return [];
      return [];
    }),
    get: jest.fn(async (url: string) => gets[url]),
  };

  const tests: TestDef[] = [
    {
      slug: 'just_a_number',
      name: 'Just a number',
      type: 'simple',
      order: 0,
      sublist: null,
      testUrl: `${BASE}/qa/tests/99`,
    },
  ];

  const out = await attachCriteria(client as any, `${BASE}/units/units/7/`, tests);
  expect(client.getAll).toHaveBeenCalledWith('/qa/unittestinfos/', { unit: '7', limit: '500' });
  expect(out[0].criteria).toMatchObject({ refValue: 50, tolType: 'absolute' });
  expect(countWithCriteria(out)).toBe(1);
});

test('attachCriteria falls back to slug when test url paths differ', async () => {
  const utis = [
    {
      test: `${BASE}/qa/tests/100/`,
      reference: { type: 'numerical', value: 10 },
      tolerance: null,
    },
  ];
  const client = {
    getAll: jest.fn(async (path: string) => (path === '/qa/unittestinfos/' ? utis : [])),
    get: jest.fn(),
  };

  const tests: TestDef[] = [
    {
      slug: 'dose',
      name: 'Dose',
      type: 'simple',
      order: 0,
      sublist: null,
      testUrl: `${BASE}/qa/tests/100/`,
    },
  ];

  const out = await attachCriteria(client as any, `${BASE}/units/units/3/`, tests);
  expect(out[0].criteria).toMatchObject({ refValue: 10 });
});

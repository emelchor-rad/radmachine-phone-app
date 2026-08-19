import { normalizeApiUrl } from '../src/api/criteria';
import { listHasToleranceWarning } from '../src/qa/tolerance-warning';
import type { TestCriteria, TestDef } from '../src/api/types';

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

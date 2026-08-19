import { missingProcedureInputs, slugsReferencedInProcedure } from '../src/qa/composite-deps';
import { recalculateComposites } from '../src/qa/recalculate';
import { runCompositeScript } from '../src/qa/python-engine';
import type { TestDef } from '../src/api/types';

test('slugsReferencedInProcedure finds slug identifiers in code', () => {
  expect(slugsReferencedInProcedure('p_tp = temperature * 2', ['temperature', 'avg'])).toEqual([
    'temperature',
  ]);
});

test('missingProcedureInputs lists unfilled slugs', () => {
  const tests: TestDef[] = [
    { slug: 'temperature', name: 'T', type: 'simple', order: 0, sublist: null },
    { slug: 'pressure', name: 'P', type: 'simple', order: 1, sublist: null },
  ];
  expect(
    missingProcedureInputs(
      'p_tp = (temperature + 273.15) / pressure',
      tests,
      { temperature: { value: 20 } },
      {}
    )
  ).toEqual(['pressure']);
});

test('runCompositeScript is not called when inputs are missing', async () => {
  const tests: TestDef[] = [
    { slug: 'a', name: 'A', type: 'simple', order: 0, sublist: null },
    { slug: 'b', name: 'B', type: 'simple', order: 1, sublist: null },
    {
      slug: 'avg',
      name: 'Avg',
      type: 'composite',
      order: 2,
      sublist: null,
      calculationProcedure: 'avg = a * b',
    },
  ];
  const out = await recalculateComposites(tests, { a: { value: 2 } }, runCompositeScript);
  expect(out.blocked).toEqual({});
  expect(out.values.avg).toBeUndefined();
});

test('runCompositeScript calculates when all inputs are present', async () => {
  const tests: TestDef[] = [
    { slug: 'a', name: 'A', type: 'simple', order: 0, sublist: null },
    { slug: 'b', name: 'B', type: 'simple', order: 1, sublist: null },
    {
      slug: 'avg',
      name: 'Avg',
      type: 'composite',
      order: 2,
      sublist: null,
      calculationProcedure: 'avg = a * b',
    },
  ];
  const out = await recalculateComposites(
    tests,
    { a: { value: 3 }, b: { value: 4 } },
    runCompositeScript
  );
  expect(out.blocked).toEqual({});
  expect(out.values.avg).toBe(12);
});

import { buildPythonScript, resultCaptureIdent } from '../src/qa/python-script';
import { effectiveDraftValues } from '../src/qa/effective-values';
import {
  missingProcedureInputs,
  procedureDependencies,
  slugsReferencedInProcedure,
} from '../src/qa/composite-deps';
import { recalculateComposites } from '../src/qa/recalculate';
import { runCompositeScript } from '../src/qa/python-engine';
import type { TestDef } from '../src/api/types';

test('slugsReferencedInProcedure finds slug identifiers in code', () => {
  expect(slugsReferencedInProcedure('p_tp = temperature * 2', ['temperature', 'avg'])).toEqual([
    'temperature',
  ]);
});

test('slugsReferencedInProcedure is case-insensitive', () => {
  expect(slugsReferencedInProcedure('dose = Reading * 10', ['reading'])).toEqual(['reading']);
});

test('procedureDependencies falls back to the lone prior fillable test', () => {
  const tests: TestDef[] = [
    { slug: 'raw', name: 'Raw', type: 'simple', order: 0, sublist: null },
    { slug: 'scaled', name: 'Scaled', type: 'composite', order: 1, sublist: null },
  ];
  expect(procedureDependencies('result = value * 10', tests, 'scaled')).toEqual(['raw']);
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
      {},
      'p_tp'
    )
  ).toEqual(['pressure']);
});

test('resultCaptureIdent uses result when the procedure assigns to result', () => {
  expect(resultCaptureIdent('dose', 'result = reading * 10')).toBe('result');
  expect(resultCaptureIdent('dose', 'dose = reading * 10')).toBe('dose');
});

test('buildPythonScript captures result assignments', () => {
  const script = buildPythonScript('dose', 'result = reading * 10', {
    values: { reading: 5 },
    REFS: {},
    TOLS: {},
  });
  expect(script).toContain('__radmachine_result__ = result');
});

test('effectiveDraftValues uses live typed text for simple fields', () => {
  const tests: TestDef[] = [{ slug: 'a', name: 'A', type: 'simple', order: 0, sublist: null }];
  const draft = effectiveDraftValues(tests, { a: { value: null } }, { a: '12' });
  expect(draft.a?.value).toBe(12);
});

test('single-input multiply by 10 works with result= procedure', async () => {
  const tests: TestDef[] = [
    { slug: 'reading', name: 'Reading', type: 'simple', order: 0, sublist: null },
    {
      slug: 'dose',
      name: 'Dose',
      type: 'composite',
      order: 1,
      sublist: null,
      calculationProcedure: 'result = reading * 10',
    },
  ];
  const out = await recalculateComposites(
    tests,
    effectiveDraftValues(tests, {}, { reading: '5' }),
    runCompositeScript
  );
  expect(out.blocked).toEqual({});
  expect(out.waiting).toEqual({});
  expect(out.values.dose).toBe(50);
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
  expect(out.waiting.avg).toEqual(['b']);
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
  expect(out.waiting).toEqual({});
  expect(out.values.avg).toBe(12);
});

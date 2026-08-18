import { canRunOnDevice, BLOCKED_TOKENS } from '../src/qa/composite-gate';
import { buildCalcContext } from '../src/qa/composite-context';
import { buildPythonScript } from '../src/qa/python-script';
import { recalculateComposites } from '../src/qa/recalculate';
import type { TestDef } from '../src/api/types';

const band = {
  refValue: 0,
  refType: 'numerical' as const,
  tolType: 'absolute' as const,
  actLow: -2,
  tolLow: -1,
  tolHigh: 1,
  actHigh: 2,
};

test('canRunOnDevice rejects import and UTILS', () => {
  expect(canRunOnDevice('x = 1')).toEqual({ ok: true });
  expect(canRunOnDevice('import numpy')).toMatchObject({ ok: false });
  expect(canRunOnDevice('UTILS.get_comment("a")')).toMatchObject({ ok: false });
});

test('buildCalcContext merges fillable draft values and computed composites', () => {
  const tests: TestDef[] = [
    { slug: 'a', name: 'A', type: 'simple', order: 0, sublist: null, criteria: band },
    { slug: 'avg', name: 'Avg', type: 'composite', order: 1, sublist: null },
  ];
  const ctx = buildCalcContext(tests, { a: { value: 2 } }, { avg: 2 });
  expect(ctx.values).toEqual({ a: 2, avg: 2 });
  expect(ctx.REFS.a).toBe(0);
  expect(ctx.TOLS.a.type).toBe('absolute');
});

test('buildPythonScript assigns slug variables and captures result', () => {
  const script = buildPythonScript(
    'avg',
    'avg = (a + b) / 2',
    {
      values: { a: 2, b: 4 },
      REFS: {},
      TOLS: {},
    }
  );
  expect(script).toContain('a = 2');
  expect(script).toContain('b = 4');
  expect(script).toContain('__radmachine_result__ = avg');
});

test('recalculateComposites runs in list order with a mock runner', async () => {
  const tests: TestDef[] = [
    { slug: 'a', name: 'A', type: 'simple', order: 0, sublist: null },
    {
      slug: 'sum_ab',
      name: 'Sum',
      type: 'composite',
      order: 1,
      sublist: null,
      calculationProcedure: 'sum_ab = a + 1',
    },
  ];
  const run = async (slug: string, _procedure: string, _ctx: unknown) =>
    slug === 'sum_ab' ? 5 : null;
  const out = await recalculateComposites(tests, { a: { value: 4 } }, run);
  expect(out.values.sum_ab).toBe(5);
  expect(out.blocked).toEqual({});
});

test('recalculateComposites marks gated procedures as blocked', async () => {
  const tests: TestDef[] = [
    {
      slug: 'dose',
      name: 'Dose',
      type: 'composite',
      order: 0,
      sublist: null,
      calculationProcedure: 'dose = pylinac.analyze()',
    },
  ];
  const out = await recalculateComposites(tests, {}, async () => 1);
  expect(out.values).toEqual({});
  expect(out.blocked.dose).toMatch(/pylinac/);
});

test('blocked token list stays stable', () => {
  expect(BLOCKED_TOKENS).toContain('import ');
});

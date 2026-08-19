import { criteriaFromUti } from '../src/api/criteria';
import type { TestCriteria } from '../src/api/types';
import {
  criteriaLine,
  criteriaDisplay,
  criteriaSummary,
  evaluateReading,
  type EvalLevel,
} from '../src/qa/evaluate';

const band: TestCriteria = {
  refValue: 0,
  refType: 'numerical',
  tolType: 'absolute',
  actLow: -1.5,
  tolLow: -1,
  tolHigh: 1,
  actHigh: 1.5,
};

test('unrecorded stays unrecorded', () => {
  expect(evaluateReading('simple', null, band)).toBe('unrecorded');
});

test('no criteria means no_tol', () => {
  expect(evaluateReading('simple', 0.2, null)).toBe('no_tol');
});

test('string with multchoice tolerance matches pass, tol and action', () => {
  const mc: TestCriteria = {
    refValue: null,
    refType: 'numerical',
    tolType: 'multchoice',
    actLow: null,
    tolLow: null,
    tolHigh: null,
    actHigh: null,
    mcPassChoices: ['Pass', 'OK'],
    mcTolChoices: ['Review'],
  };
  expect(evaluateReading('string', 'pass', mc)).toBe('ok');
  expect(evaluateReading('string', 'Review', mc)).toBe('tolerance');
  expect(evaluateReading('string', 'Fail', mc)).toBe('action');
});

test('composite numerical value uses the same band as simple', () => {
  expect(evaluateReading('composite', -0.3, band)).toBe('ok');
  expect(evaluateReading('composite', 2, band)).toBe('action');
});

test('inside the tolerance band is ok', () => {
  expect(evaluateReading('simple', -0.3, band)).toBe('ok');
  expect(evaluateReading('simple', 0, band)).toBe('ok');
});

test('between tolerance and action is tolerance', () => {
  expect(evaluateReading('simple', -1.2, band)).toBe('tolerance');
  expect(evaluateReading('simple', 1.2, band)).toBe('tolerance');
});

test('outside action is action', () => {
  expect(evaluateReading('simple', -2, band)).toBe('action');
  expect(evaluateReading('simple', 2, band)).toBe('action');
});

test('percent tolerance uses percent diff', () => {
  const pct: TestCriteria = {
    refValue: 100,
    refType: 'numerical',
    tolType: 'percent',
    actLow: -3,
    tolLow: -2,
    tolHigh: 2,
    actHigh: 3,
  };
  expect(evaluateReading('simple', 101, pct)).toBe('ok');
  expect(evaluateReading('simple', 102.5, pct)).toBe('tolerance');
  expect(evaluateReading('simple', 104, pct)).toBe('action');
});

test('boolean matching reference is ok', () => {
  const refPass: TestCriteria = {
    refValue: 1,
    refType: 'boolean',
    tolType: null,
    actLow: null,
    tolLow: null,
    tolHigh: null,
    actHigh: null,
  };
  expect(evaluateReading('boolean', true, refPass)).toBe('ok');
  expect(evaluateReading('boolean', false, refPass)).toBe('action');
});

test('criteriaLine names a boolean reference as Pass or Fail', () => {
  expect(
    criteriaLine({
      refValue: 1,
      refType: 'boolean',
      tolType: null,
      actLow: null,
      tolLow: null,
      tolHigh: null,
      actHigh: null,
    })
  ).toBe('Ref: Pass');
});

test('criteriaFromUti resolves linked reference and tolerance', () => {
  const refs = new Map([
    ['ref/1', { type: 'numerical', value: 0 }],
  ]);
  const tols = new Map([
    ['tol/1', { type: 'absolute', act_low: -1.5, tol_low: -1, tol_high: 1, act_high: 1.5 }],
  ]);
  const c = criteriaFromUti(
    { test: 'test/1', reference: 'ref/1', tolerance: 'tol/1' },
    refs,
    tols
  );
  expect(c).toMatchObject({ refValue: 0, tolType: 'absolute', tolLow: -1 });
});

test('criteriaFromUti without reference returns null', () => {
  expect(criteriaFromUti({ test: 't/1', reference: null, tolerance: null }, new Map(), new Map())).toBeNull();
});

test('criteriaFromUti resolves multchoice tolerance without a reference', () => {
  const tols = new Map([
    [
      'tol/mc',
      { type: 'multchoice', mc_pass_choices: 'Pass, OK', mc_tol_choices: 'Review' },
    ],
  ]);
  const c = criteriaFromUti(
    { test: 't/1', reference: null, tolerance: 'tol/mc' },
    new Map(),
    tols
  );
  expect(c).toMatchObject({
    tolType: 'multchoice',
    mcPassChoices: ['Pass', 'OK'],
    mcTolChoices: ['Review'],
  });
});

test('criteriaLine describes multchoice pass and tolerance lists', () => {
  expect(
    criteriaLine({
      refValue: null,
      refType: 'numerical',
      tolType: 'multchoice',
      actLow: null,
      tolLow: null,
      tolHigh: null,
      actHigh: null,
      mcPassChoices: ['A'],
      mcTolChoices: ['B'],
    })
  ).toBe('Pass: A · Tol: B');
});

test('criteriaDisplay converts absolute diffs to band values like the web UI', () => {
  expect(
    criteriaDisplay({
      refValue: 50,
      refType: 'numerical',
      tolType: 'absolute',
      actLow: -5,
      tolLow: -2,
      tolHigh: 2,
      actHigh: 5,
    })
  ).toEqual({
    kind: 'absolute',
    bands: { actLow: 45, tolLow: 48, ref: 50, tolHigh: 52, actHigh: 55 },
  });
});

test('criteriaSummary reads like RadMachine evaluation line', () => {
  expect(
    criteriaSummary({
      refValue: 50,
      refType: 'numerical',
      tolType: 'absolute',
      actLow: -5,
      tolLow: -2,
      tolHigh: 2,
      actHigh: 5,
    })
  ).toBe('Reference: 50 · Tolerance: 48 – 52 · Action: 45 – 55');
});

const levels: EvalLevel[] = ['ok', 'tolerance', 'action', 'no_tol', 'unrecorded'];
test.each(levels)('evaluateReading always returns a known level (%s)', (level) => {
  const value =
    level === 'unrecorded' ? null : level === 'action' ? 99 : level === 'tolerance' ? 1.2 : 0;
  const got = evaluateReading('simple', value, band);
  expect(['ok', 'tolerance', 'action', 'no_tol', 'unrecorded']).toContain(got);
});

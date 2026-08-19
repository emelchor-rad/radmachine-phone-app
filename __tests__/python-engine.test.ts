import { buildPythonScript } from '../src/qa/python-script';
import {
  isPythonEngineReady,
  runCompositeScript,
} from '../src/qa/python-engine';

test('python engine loads Skulpt', () => {
  expect(isPythonEngineReady()).toBe(true);
});

test('runCompositeScript evaluates a simple average', async () => {
  const script = buildPythonScript(
    'avg',
    'avg = (a + b) / 2',
    {
      values: { a: 2, b: 4 },
      REFS: {},
      TOLS: {},
    }
  );
  const result = await runCompositeScript('avg', 'avg = (a + b) / 2', {
    values: { a: 2, b: 4 },
    REFS: {},
    TOLS: {},
  });
  expect(result).toBe(3);
  expect(script).toContain('a = 2');
});

test('runCompositeScript supports import math and dict bindings', async () => {
  const result = await runCompositeScript(
    'hyp',
    'hyp = math.sqrt(a * a + b * b)',
    {
      values: { a: 3, b: 4 },
      REFS: { a: 0 },
      TOLS: {
        a: {
          type: 'absolute',
          act_low: -2,
          tol_low: -1,
          tol_high: 1,
          act_high: 2,
        },
      },
    }
  );
  expect(result).toBe(5);
});

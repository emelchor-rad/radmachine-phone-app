import {
  attachCalculationProcedures,
  extractCalculationProcedure,
  testResourceUrl,
} from '../src/api/procedures';
import type { TestDef } from '../src/api/types';

test('extractCalculationProcedure reads snake_case and camelCase', () => {
  expect(extractCalculationProcedure({ calculation_procedure: 'x = 1' })).toBe('x = 1');
  expect(extractCalculationProcedure({ calculationProcedure: 'y = 2' })).toBe('y = 2');
  expect(extractCalculationProcedure({ calculation_procedure: '  ' })).toBeNull();
});

test('testResourceUrl accepts url strings and embedded objects', () => {
  expect(testResourceUrl('https://x/tests/1/')).toBe('https://x/tests/1/');
  expect(testResourceUrl({ url: 'https://x/tests/2/' })).toBe('https://x/tests/2/');
});

test('attachCalculationProcedures re-fetches missing procedures', async () => {
  const tests: TestDef[] = [
    {
      slug: 'avg',
      name: 'Avg',
      type: 'composite',
      order: 0,
      sublist: null,
      testUrl: 'https://x/tests/1/',
    },
  ];
  const client = {
    get: async (url: string) => {
      if (url === 'https://x/tests/1/') return { slug: 'avg', calculation_procedure: 'avg = a + b' };
      throw new Error('unexpected');
    },
    getAll: async () => [],
  };
  const out = await attachCalculationProcedures(client as any, tests);
  expect(out[0].calculationProcedure).toBe('avg = a + b');
});

test('attachCalculationProcedures falls back to slug lookup', async () => {
  const tests: TestDef[] = [
    { slug: 'avg', name: 'Avg', type: 'composite', order: 0, sublist: null },
  ];
  const client = {
    get: async () => ({}),
    getAll: async (_path: string, params: Record<string, string>) => {
      expect(params.slug).toBe('avg');
      return [{ calculation_procedure: 'avg = 1' }];
    },
  };
  const out = await attachCalculationProcedures(client as any, tests);
  expect(out[0].calculationProcedure).toBe('avg = 1');
});

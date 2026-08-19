const mockRunAsync = jest.fn(async () => {});

jest.mock('../src/db/schema', () => ({
  getDb: jest.fn(async () => ({
    withTransactionAsync: async (fn: () => Promise<void>) => fn(),
    runAsync: mockRunAsync,
  })),
}));

import { clearAllDownloaded } from '../src/db/clear-downloaded';

beforeEach(() => {
  mockRunAsync.mockClear();
});

test('clearAllDownloaded wipes every local list and session table', async () => {
  await clearAllDownloaded();
  expect(mockRunAsync.mock.calls.map((c) => c[0])).toEqual([
    'DELETE FROM value',
    'DELETE FROM outbox',
    'DELETE FROM session',
    'DELETE FROM test',
    'DELETE FROM collection',
    'DELETE FROM schedule',
  ]);
});

import { nextState, backoffMs } from '../src/sync/worker';

test('a send finishes the row and records the url', () => {
  expect(nextState({ kind: 'sent', url: 'https://x/500/' }, 1)).toEqual({
    status: 'sent',
    sessionUrl: 'https://x/500/',
    error: null,
  });
});

test('a duplicate also finishes the row, url resolved separately', () => {
  expect(nextState({ kind: 'duplicate' }, 3)).toEqual({
    status: 'sent',
    sessionUrl: null,
    error: null,
  });
});

test('a rejection stops the row so it stops burning battery', () => {
  const s = nextState({ kind: 'rejected', message: 'tests: required' }, 1);
  expect(s.status).toBe('failed');
  expect(s.error).toContain('required');
});

test('an auth problem stops the row too', () => {
  expect(nextState({ kind: 'auth', message: 'bad token' }, 1).status).toBe('failed');
});

test('a transient error keeps the row queued', () => {
  expect(nextState({ kind: 'retry', message: 'HTTP 502' }, 1).status).toBe('queued');
});

test('backoff grows with attempts', () => {
  expect(backoffMs(1)).toBeLessThan(backoffMs(2));
  expect(backoffMs(2)).toBeLessThan(backoffMs(3));
});

test('backoff is capped so it never parks a row for hours', () => {
  expect(backoffMs(50)).toBeLessThanOrEqual(5 * 60 * 1000);
});

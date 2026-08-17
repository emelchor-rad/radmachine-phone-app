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

/**
 * An auth error is a property of the CREDENTIALS, not of the payload -- which
 * makes it transient in exactly the way a network error is. An expired or
 * rotated token, or a captive portal answering 403, would otherwise mark every
 * queued session 'failed' in one pass, and nothing moves a row from 'failed'
 * back to 'queued': the morning's readings would still be in the value table
 * with no code path able to reach them. A token can be fixed; a failed row
 * cannot be un-failed. So the row stays queued and keeps the message.
 */
test('an auth problem keeps the row queued, because a token can be fixed', () => {
  const s = nextState({ kind: 'auth', message: 'bad token' }, 1);
  expect(s.status).toBe('queued');
  expect(s.error).toContain('bad token');
  expect(s.sessionUrl).toBeNull();
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

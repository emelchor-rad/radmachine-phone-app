/**
 * drain.ts is the file that decides whether a morning's readings reach the
 * server or sit on the phone, so it is worth testing hard. Every dependency
 * it has is a plain module import, so jest.mock covers all of it -- no device
 * and no SQLite involved.
 *
 * What is mocked: the database, the keystore and the HTTP client -- the three
 * things that need a device. What is NOT mocked: worker.nextState and
 * submit.classifyResponse. Those are the real logic under test here; the whole
 * point is to prove the drain wires them together correctly, so a change in
 * either shows up in these tests instead of hiding behind a stub.
 */
import type { SubmitPayload } from '../src/api/types';
import type { OutboxRow } from '../src/db/outbox';

const mockPost = jest.fn();
const mockGet = jest.fn();

jest.mock('../src/api/client', () => ({
  RadClient: jest.fn().mockImplementation(() => ({ post: mockPost, get: mockGet })),
}));

jest.mock('../src/secure/credentials', () => ({
  loadCredentials: jest.fn(),
}));

jest.mock('../src/db/outbox', () => ({
  dueRows: jest.fn(),
  applyState: jest.fn(),
}));

import { applyState, dueRows } from '../src/db/outbox';
import { loadCredentials } from '../src/secure/credentials';
import { drainOutbox } from '../src/sync/drain';

const mockDueRows = dueRows as jest.MockedFunction<typeof dueRows>;
const mockApplyState = applyState as jest.MockedFunction<typeof applyState>;
const mockLoadCredentials = loadCredentials as jest.MockedFunction<typeof loadCredentials>;

const CREDS = { baseUrl: 'https://radmachine.radformation.com/emelchor/api', token: 'fake-token' };

function payload(userKey: string): SubmitPayload {
  return {
    unit_test_collection: `${CREDS.baseUrl}/qa/unittestcollections/1/`,
    day: 0,
    in_progress: false,
    work_started: '2026-08-17 08:00:00',
    work_completed: '2026-08-17 08:12:00',
    user_key: userKey,
    tests: { dose_6mv: { value: 1.002 } },
  };
}

function row(id: string, over: Partial<OutboxRow> = {}): OutboxRow {
  return {
    sessionId: id,
    payload: payload(`key-${id}`),
    status: 'queued',
    attempts: 0,
    nextAttempt: null,
    sessionUrl: null,
    error: null,
    ...over,
  };
}

/** The arguments of the applyState call for a given session id. */
function stateFor(sessionId: string) {
  const call = mockApplyState.mock.calls.find((c) => c[0] === sessionId);
  if (!call) throw new Error(`no applyState for ${sessionId}`);
  return { state: call[1], attempts: call[2], nextAttempt: call[3] };
}

const ok = (url: string) => ({ status: 201, body: JSON.stringify({ url }) });
const duplicate = { status: 400, body: '{"user_key": ["A test list instance with this user key already exists."]}' };
const unauthorized = { status: 401, body: 'Invalid token.' };

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadCredentials.mockResolvedValue(CREDS);
  mockDueRows.mockResolvedValue([]);
  mockApplyState.mockResolvedValue(undefined);
});

test('with no credentials stored it posts nothing and reports nothing done', async () => {
  mockLoadCredentials.mockResolvedValue(null);
  await expect(drainOutbox()).resolves.toBe(0);
  expect(mockPost).not.toHaveBeenCalled();
  expect(mockApplyState).not.toHaveBeenCalled();
});

test('a 201 marks the row sent with the url the server returned', async () => {
  mockDueRows.mockResolvedValue([row('a')]);
  mockPost.mockResolvedValue(ok('https://x/api/qa/testlistinstances/500/'));

  await expect(drainOutbox()).resolves.toBe(1);

  expect(mockPost).toHaveBeenCalledWith('/qa/testlistinstances/', row('a').payload);
  const { state, attempts, nextAttempt } = stateFor('a');
  expect(state).toEqual({
    status: 'sent',
    sessionUrl: 'https://x/api/qa/testlistinstances/500/',
    error: null,
  });
  expect(attempts).toBe(1);
  // A finished row must not keep a next_attempt, or it looks due forever.
  expect(nextAttempt).toBeNull();
});

/**
 * A duplicate user_key 400 is proof the session already landed: an earlier
 * attempt reached the server and only the response was lost. The row is done,
 * and the session url is recovered by GET ?user_key=... so the deep link works.
 */
test('a duplicate 400 marks the row sent and recovers the url by user_key', async () => {
  mockDueRows.mockResolvedValue([row('a')]);
  mockPost.mockResolvedValue(duplicate);
  mockGet.mockResolvedValue({ results: [{ url: 'https://x/api/qa/testlistinstances/77/' }] });

  await expect(drainOutbox()).resolves.toBe(1);

  expect(mockGet).toHaveBeenCalledWith('/qa/testlistinstances/', { user_key: 'key-a' });
  expect(stateFor('a').state).toEqual({
    status: 'sent',
    sessionUrl: 'https://x/api/qa/testlistinstances/77/',
    error: null,
  });
});

test('if the recovery GET fails the row is still sent, only the url is lost', async () => {
  mockDueRows.mockResolvedValue([row('a')]);
  mockPost.mockResolvedValue(duplicate);
  mockGet.mockRejectedValue(new Error('Network request failed'));

  await expect(drainOutbox()).resolves.toBe(1);

  // Losing a deep link is an inconvenience; losing the session is not.
  expect(stateFor('a').state).toEqual({ status: 'sent', sessionUrl: null, error: null });
});

test('a network throw leaves the row queued and due again later', async () => {
  const before = Date.now();
  mockDueRows.mockResolvedValue([row('a', { attempts: 2 })]);
  mockPost.mockRejectedValue(new Error('Network request failed'));

  await expect(drainOutbox()).resolves.toBe(1);

  const { state, attempts, nextAttempt } = stateFor('a');
  expect(state.status).toBe('queued');
  expect(state.error).toContain('Network request failed');
  expect(attempts).toBe(3);
  expect(new Date(nextAttempt as string).getTime()).toBeGreaterThan(before);
});

test('a 500 also leaves the row queued and backed off', async () => {
  const before = Date.now();
  mockDueRows.mockResolvedValue([row('a')]);
  mockPost.mockResolvedValue({ status: 500, body: 'upstream exploded' });

  await expect(drainOutbox()).resolves.toBe(1);

  const { state, attempts, nextAttempt } = stateFor('a');
  expect(state.status).toBe('queued');
  expect(state.error).toContain('500');
  expect(attempts).toBe(1);
  expect(new Date(nextAttempt as string).getTime()).toBeGreaterThan(before);
});

test('a 400 that is not a duplicate fails the row, since retrying cannot help', async () => {
  mockDueRows.mockResolvedValue([row('a')]);
  mockPost.mockResolvedValue({ status: 400, body: '{"tests": ["This field is required."]}' });

  await expect(drainOutbox()).resolves.toBe(1);

  const { state, nextAttempt } = stateFor('a');
  expect(state.status).toBe('failed');
  expect(state.error).toContain('required');
  expect(nextAttempt).toBeNull();
});

test('one row blowing up does not strand the rows behind it', async () => {
  mockDueRows.mockResolvedValue([row('a'), row('b'), row('c')]);
  mockPost
    .mockResolvedValueOnce(ok('https://x/1/'))
    .mockRejectedValueOnce(new Error('socket hang up'))
    .mockResolvedValueOnce(ok('https://x/3/'));

  await expect(drainOutbox()).resolves.toBe(3);

  expect(mockPost).toHaveBeenCalledTimes(3);
  expect(stateFor('a').state.status).toBe('sent');
  expect(stateFor('b').state.status).toBe('queued');
  expect(stateFor('c').state.status).toBe('sent');
});

/**
 * The other half of the auth fix. Keeping the row queued is what makes the
 * data recoverable; stopping the pass is what stops the phone burning ten
 * POSTs and ten backoff bumps against a token that is known to be bad.
 */
test('an auth failure keeps the row queued and stops the pass there', async () => {
  mockDueRows.mockResolvedValue([row('a'), row('b'), row('c')]);
  mockPost.mockResolvedValue(unauthorized);

  await expect(drainOutbox()).resolves.toBe(1);

  expect(mockPost).toHaveBeenCalledTimes(1);
  expect(mockApplyState).toHaveBeenCalledTimes(1);

  const { state } = stateFor('a');
  expect(state.status).toBe('queued');
  expect(state.error).toContain('Invalid token');
});

test('the row that hit the auth error is still retried on the next pass', async () => {
  mockDueRows.mockResolvedValue([row('a')]);
  mockPost.mockResolvedValue(unauthorized);
  await drainOutbox();

  const { nextAttempt } = stateFor('a');
  expect(nextAttempt).not.toBeNull();
});

/**
 * Walking out of a bunker fires the connectivity and the foreground event
 * within milliseconds of each other, so overlapping calls are the normal case.
 * A second pass over the same rows doubles the traffic on a link that is
 * marginal by definition, and can overwrite a recovered session url with null.
 */
test('two overlapping drains are one pass, and both callers get an answer', async () => {
  mockDueRows.mockResolvedValue([row('a'), row('b')]);
  mockPost.mockResolvedValue(ok('https://x/1/'));

  const [first, second] = await Promise.all([drainOutbox(), drainOutbox()]);

  expect(mockPost).toHaveBeenCalledTimes(2);
  expect(first).toBe(2);
  expect(second).toBe(2);
});

test('a later drain runs again once the first one has finished', async () => {
  mockDueRows.mockResolvedValue([row('a')]);
  mockPost.mockResolvedValue(ok('https://x/1/'));

  await drainOutbox();
  await drainOutbox();

  // The guard must not latch: it deduplicates concurrent passes, not all of them.
  expect(mockPost).toHaveBeenCalledTimes(2);
});

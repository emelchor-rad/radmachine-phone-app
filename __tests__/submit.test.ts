import { classifyResponse } from '../src/api/submit';

test('201 is a send, and keeps the session url', () => {
  const body = JSON.stringify({ url: 'https://example/api/qa/testlistinstances/500/' });
  expect(classifyResponse(201, body)).toEqual({
    kind: 'sent',
    url: 'https://example/api/qa/testlistinstances/500/',
  });
});

test('a duplicate user key means an earlier attempt already landed', () => {
  const body = JSON.stringify({
    user_key: ['test list instance with this user key already exists.'],
  });
  expect(classifyResponse(400, body)).toEqual({ kind: 'duplicate' });
});

test('the duplicate check is case insensitive', () => {
  const body = 'Test List Instance With This User Key Already Exists.';
  expect(classifyResponse(400, body)).toEqual({ kind: 'duplicate' });
});

test('any other 400 is a rejection that must not be retried', () => {
  const body = JSON.stringify({ tests: ['This field is required.'] });
  const out = classifyResponse(400, body);
  expect(out.kind).toBe('rejected');
  expect(out.kind === 'rejected' && out.message).toContain('This field is required.');
});

test('401 is an auth problem, not a transient one', () => {
  expect(classifyResponse(401, 'Invalid token').kind).toBe('auth');
});

test('403 is an auth problem too', () => {
  expect(classifyResponse(403, 'Forbidden').kind).toBe('auth');
});

test('a 500 is worth retrying', () => {
  expect(classifyResponse(500, 'Server Error').kind).toBe('retry');
});

test('a 502 is worth retrying', () => {
  expect(classifyResponse(502, 'Bad Gateway').kind).toBe('retry');
});

import { RadClient } from '../src/api/client';

const BASE = 'https://radmachine.radformation.com/emelchor/api';

beforeEach(() => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    status: 200,
    text: async () => '{"count": 0}',
  }) as unknown as typeof fetch;
});

test('it authenticates with the RadAuthorization header, not Authorization', async () => {
  const c = new RadClient(BASE, 'secret-token');
  await c.get('/qa/testlistinstances/');
  const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
  expect(init.headers.RadAuthorization).toBe('Token secret-token');
  expect(init.headers.Authorization).toBeUndefined();
});

test('a relative path is resolved against the base url', async () => {
  const c = new RadClient(BASE, 't');
  await c.get('/qa/testlistinstances/');
  const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe(`${BASE}/qa/testlistinstances/`);
});

test('an absolute url is used as given', async () => {
  const c = new RadClient(BASE, 't');
  await c.get(`${BASE}/qa/testlists/571/`);
  const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe(`${BASE}/qa/testlists/571/`);
});

test('query params are appended', async () => {
  const c = new RadClient(BASE, 't');
  await c.get('/qa/testlistinstances/', { user_key: 'abc-123' });
  const [url] = (globalThis.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain('user_key=abc-123');
});

test('a non-2xx GET raises with the status and body', async () => {
  (globalThis.fetch as jest.Mock).mockResolvedValue({ status: 401, text: async () => 'nope' });
  const c = new RadClient(BASE, 't');
  await expect(c.get('/qa/testlistinstances/')).rejects.toThrow(/401/);
});

test('post returns status and raw body without raising', async () => {
  (globalThis.fetch as jest.Mock).mockResolvedValue({ status: 400, text: async () => 'bad' });
  const c = new RadClient(BASE, 't');
  await expect(c.post('/qa/testlistinstances/', {})).resolves.toEqual({
    status: 400,
    body: 'bad',
  });
});

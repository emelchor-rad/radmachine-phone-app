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

/**
 * Pagination. The live API pages unittestcollections at 10 of 336, so a caller
 * that reads `results` from one GET silently sees 3% of the catalogue.
 */

/** Queue up one fetch reply per page, in order. */
function pages(...bodies: unknown[]) {
  const f = globalThis.fetch as jest.Mock;
  f.mockReset();
  for (const b of bodies) {
    f.mockResolvedValueOnce({ status: 200, text: async () => JSON.stringify(b) });
  }
}

test('getAll follows next across pages and concatenates every result', async () => {
  pages(
    { count: 5, next: `${BASE}/units/units/?limit=2&offset=2`, results: [{ id: 1 }, { id: 2 }] },
    { count: 5, next: `${BASE}/units/units/?limit=2&offset=4`, results: [{ id: 3 }, { id: 4 }] },
    { count: 5, next: null, results: [{ id: 5 }] }
  );
  const c = new RadClient(BASE, 't');
  const all = await c.getAll<{ id: number }>('/units/units/');
  expect(all.map((u) => u.id)).toEqual([1, 2, 3, 4, 5]);
});

test('getAll requests each page exactly once, following the next url verbatim', async () => {
  pages(
    { next: `${BASE}/units/units/?limit=2&offset=2`, results: [{ id: 1 }] },
    { next: `${BASE}/units/units/?limit=2&offset=4`, results: [{ id: 2 }] },
    { next: null, results: [{ id: 3 }] }
  );
  const c = new RadClient(BASE, 't');
  await c.getAll('/units/units/');
  const f = globalThis.fetch as jest.Mock;
  expect(f).toHaveBeenCalledTimes(3);
  expect(f.mock.calls.map((call) => call[0])).toEqual([
    `${BASE}/units/units/`,
    `${BASE}/units/units/?limit=2&offset=2`,
    `${BASE}/units/units/?limit=2&offset=4`,
  ]);
});

test('getAll stops after a single request when next is null', async () => {
  pages({ count: 2, next: null, results: [{ id: 1 }, { id: 2 }] });
  const c = new RadClient(BASE, 't');
  const all = await c.getAll<{ id: number }>('/units/units/');
  expect(all).toHaveLength(2);
  expect(globalThis.fetch as jest.Mock).toHaveBeenCalledTimes(1);
});

test('getAll treats a missing next key as the last page', async () => {
  pages({ results: [{ id: 1 }] });
  const c = new RadClient(BASE, 't');
  await expect(c.getAll('/units/units/')).resolves.toHaveLength(1);
  expect(globalThis.fetch as jest.Mock).toHaveBeenCalledTimes(1);
});

test('getAll returns a bare array unchanged when the endpoint is not paginated', async () => {
  pages([{ id: 7 }, { id: 8 }]);
  const c = new RadClient(BASE, 't');
  const all = await c.getAll<{ id: number }>('/qa/frequencies/');
  expect(all.map((x) => x.id)).toEqual([7, 8]);
  expect(globalThis.fetch as jest.Mock).toHaveBeenCalledTimes(1);
});

test('getAll passes query params on the first page only', async () => {
  pages(
    { next: `${BASE}/qa/unittestcollections/?limit=10&offset=10`, results: [{ id: 1 }] },
    { next: null, results: [{ id: 2 }] }
  );
  const c = new RadClient(BASE, 't');
  await c.getAll('/qa/unittestcollections/', { unit: '77' });
  const f = globalThis.fetch as jest.Mock;
  expect(f.mock.calls[0][0]).toBe(`${BASE}/qa/unittestcollections/?unit=77`);
  expect(f.mock.calls[1][0]).toBe(`${BASE}/qa/unittestcollections/?limit=10&offset=10`);
});

# RadMachine Mobile v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Android app that downloads the RadMachine test list `Daily :: Linac QA :: TG-142 Demos`, lets a physicist fill it in with no connectivity, and submits it to the `emelchor` tenant when the network returns.

**Architecture:** Expo/React Native app with a SQLite local store. Definitions are downloaded and flattened into ordered test rows; a fill-in produces a draft; on "done" the draft is frozen into an immutable JSON payload in an outbox. A sync worker drains the outbox on connectivity, using a device-generated `user_key` so retries are idempotent. The server calculates everything derived — the app never runs a `calculation_procedure`.

**Tech Stack:** Expo SDK (React Native, TypeScript), expo-router, expo-sqlite, expo-secure-store, @react-native-community/netinfo, jest-expo.

**Spec:** `docs/superpowers/specs/2026-08-17-radmachine-mobile-design.md`

**Project location:** `C:\Users\eduar\Claude Code\radmachine-mobile` — a NEW repo, separate from the RadMachine API Python repo. All paths below are relative to it.

---

## Reference constants (used throughout)

```
Base URL   https://radmachine.radformation.com/emelchor/api
Auth       header  RadAuthorization: Token <token>     (NOT Authorization)
UTC        https://radmachine.radformation.com/emelchor/api/qa/unittestcollections/105/
Unit       9  TrueBeam1 Demo
Test list  571  Daily :: Linac QA :: TG-142 Demos
Tests      10 boolean + 6 simple, no composites, no uploads
```

The 16 slugs, in list order (top-level test first, then each sublist):

```
mlc_check_weekly                                boolean
cbct_collision_interlocks_functional            boolean   (sublist: TG-142 Daily :: CBCT)
cbct_imaging_treatment_coordinate_coincidence   simple    (sublist: TG-142 Daily :: CBCT)
cbct_positioning_repositioning                  simple    (sublist: TG-142 Daily :: CBCT)
coll_size                                       simple    (sublist: TG-142 Daily :: Mechanical)
odi_at_iso                                      simple    (sublist: TG-142 Daily :: Mechanical)
laser_localization                              boolean   (sublist: TG-142 Daily :: Mechanical)
kv_mv_collision_interlocks_functional           boolean   (sublist: TG-142 Daily :: Planer kV and MV Imaging)
kv_mv_imaging_treatment_coordinate_coincidence  simple    (sublist: TG-142 Daily :: Planer kV and MV Imaging)
kv_mv_positioning_repositioning                 simple    (sublist: TG-142 Daily :: Planer kV and MV Imaging)
av_monitors                                     boolean   (sublist: TG-142 Daily :: Safety)
beam_on                                         boolean   (sublist: TG-142 Daily :: Safety)
door_closing_safety                             boolean   (sublist: TG-142 Daily :: Safety)
door_interlock                                  boolean   (sublist: TG-142 Daily :: Safety)
radiation_area_monitor                          boolean   (sublist: TG-142 Daily :: Safety)
stero_interlocks                                boolean   (sublist: TG-142 Daily :: Safety)
```

**Never commit a token.** The token is typed into the app at runtime and lives in Android's keystore. Tests use a fake token.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/api/types.ts` | Shapes of what the API returns and what we submit |
| `src/api/client.ts` | Authenticated fetch wrapper; nothing domain-specific |
| `src/api/definitions.ts` | Fetch a UTC + its test list tree, flatten to ordered test rows |
| `src/api/submit.ts` | POST a payload; classify the response into an outcome |
| `src/sync/payload.ts` | **Pure.** definition + draft → submission JSON |
| `src/sync/worker.ts` | Outbox drain: outcome → next state, backoff |
| `src/db/schema.ts` | SQLite DDL and open/migrate |
| `src/db/collections.ts` | Read/write downloaded definitions |
| `src/db/sessions.ts` | Read/write drafts and their values |
| `src/db/outbox.ts` | Read/write the send queue |
| `src/secure/credentials.ts` | Token in secure storage, tenant in plain settings |
| `app/_layout.tsx` | Navigation shell |
| `app/connect.tsx` | Credential entry screen |
| `app/index.tsx` | Catalogue: browse and download UTCs |
| `app/worksheet/[sessionId].tsx` | The fill-in form |
| `app/queue.tsx` | Send queue status |

The three pure-logic modules (`payload.ts`, `submit.ts` classification, `worker.ts` transitions) hold all the risky behaviour and are tested in plain Node with no device.

---

## Task 1: Scaffold the project and get it running on the phone

**Files:**
- Create: the whole project via the Expo template

- [ ] **Step 1: Create the project**

```bash
cd "C:/Users/eduar/Claude Code"
npx create-expo-app@latest radmachine-mobile --template blank-typescript
```

- [ ] **Step 2: Install the runtime dependencies**

```bash
cd "C:/Users/eduar/Claude Code/radmachine-mobile"
npx expo install expo-router expo-sqlite expo-secure-store @react-native-community/netinfo react-native-safe-area-context react-native-screens expo-linking expo-constants
```

- [ ] **Step 3: Install the test toolchain**

```bash
npm install --save-dev jest jest-expo @types/jest
```

- [ ] **Step 4: Configure jest**

Add to `package.json`, merging into the existing top-level object:

```json
{
  "scripts": {
    "test": "jest",
    "start": "expo start"
  },
  "jest": {
    "preset": "jest-expo"
  }
}
```

- [ ] **Step 5: Prove the toolchain works before writing app code**

Create `__tests__/sanity.test.ts`:

```ts
test('the test runner runs', () => {
  expect(1 + 1).toBe(2);
});
```

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 6: Run the app on the phone**

```bash
npx expo start
```

Install *Expo Go* from Play Store on the Android phone, scan the QR from the terminal. Expected: the blank template screen appears on the phone. The phone and the PC must be on the same Wi-Fi.

- [ ] **Step 7: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold Expo app with jest"
```

---

## Task 2: The submission payload builder (pure, TDD)

This is the heart of the app. Definition + draft in, the exact JSON RadMachine expects out.

**Files:**
- Create: `src/api/types.ts`
- Create: `src/sync/payload.ts`
- Test: `__tests__/payload.test.ts`

- [ ] **Step 1: Write the types**

Create `src/api/types.ts`:

```ts
export type TestType = 'simple' | 'boolean';

/** One test as stored locally after downloading a definition. */
export type TestDef = {
  slug: string;
  name: string;
  type: TestType;
  order: number;          // display order across the whole flattened list
  sublist: string | null; // null for tests at the top level of the list
};

/** What the user has entered so far. */
export type DraftValue = {
  value: number | boolean | null; // null = not filled in
  comment?: string;
};

export type Draft = {
  userKey: string;        // uuid, generated when the session is created
  utcUrl: string;         // full URL of the UnitTestCollection
  workStarted: string;    // 'YYYY-MM-DD HH:mm:ss', phone local time
  workCompleted: string;
  values: Record<string, DraftValue>;
};

export type SubmittedTest =
  | { value: number | boolean; comment?: string }
  | { skipped: true };

export type SubmitPayload = {
  unit_test_collection: string;
  day: number;
  in_progress: false;
  work_started: string;
  work_completed: string;
  user_key: string;
  tests: Record<string, SubmittedTest>;
};
```

- [ ] **Step 2: Write the failing tests**

Create `__tests__/payload.test.ts`:

```ts
import { buildPayload } from '../src/sync/payload';
import type { TestDef, Draft } from '../src/api/types';

const defs: TestDef[] = [
  { slug: 'beam_on', name: 'Beam on', type: 'boolean', order: 0, sublist: 'Safety' },
  { slug: 'coll_size', name: 'Collimator', type: 'simple', order: 1, sublist: 'Mechanical' },
  { slug: 'odi_at_iso', name: 'ODI', type: 'simple', order: 2, sublist: 'Mechanical' },
];

const draft: Draft = {
  userKey: 'abc-123',
  utcUrl: 'https://example/api/qa/unittestcollections/105/',
  workStarted: '2026-08-17 07:40:00',
  workCompleted: '2026-08-17 07:55:00',
  values: {
    beam_on: { value: true },
    coll_size: { value: 10.2, comment: 'slightly off' },
    // odi_at_iso deliberately absent
  },
};

test('every test in the definition appears in the payload', () => {
  const p = buildPayload(defs, draft);
  expect(Object.keys(p.tests).sort()).toEqual(['beam_on', 'coll_size', 'odi_at_iso']);
});

test('an unfilled test is submitted as skipped', () => {
  const p = buildPayload(defs, draft);
  expect(p.tests.odi_at_iso).toEqual({ skipped: true });
});

test('a null value is submitted as skipped', () => {
  const d = { ...draft, values: { ...draft.values, odi_at_iso: { value: null } } };
  expect(buildPayload(defs, d).tests.odi_at_iso).toEqual({ skipped: true });
});

test('booleans keep their true/false type', () => {
  const p = buildPayload(defs, draft);
  expect(p.tests.beam_on).toEqual({ value: true });
});

test('false is a real value, not an empty one', () => {
  const d = { ...draft, values: { ...draft.values, beam_on: { value: false } } };
  expect(buildPayload(defs, d).tests.beam_on).toEqual({ value: false });
});

test('a comment travels with the value', () => {
  const p = buildPayload(defs, draft);
  expect(p.tests.coll_size).toEqual({ value: 10.2, comment: 'slightly off' });
});

test('an empty comment is omitted', () => {
  const d = { ...draft, values: { ...draft.values, coll_size: { value: 1, comment: '   ' } } };
  expect(buildPayload(defs, d).tests.coll_size).toEqual({ value: 1 });
});

test('the envelope carries the UTC url, user key and phone timestamps', () => {
  const p = buildPayload(defs, draft);
  expect(p.unit_test_collection).toBe('https://example/api/qa/unittestcollections/105/');
  expect(p.user_key).toBe('abc-123');
  expect(p.work_started).toBe('2026-08-17 07:40:00');
  expect(p.work_completed).toBe('2026-08-17 07:55:00');
  expect(p.day).toBe(0);
  expect(p.in_progress).toBe(false);
});

test('a value for a test not in the definition is dropped', () => {
  const d = { ...draft, values: { ...draft.values, ghost_test: { value: 1 } } };
  expect(buildPayload(defs, d).tests).not.toHaveProperty('ghost_test');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- payload`
Expected: FAIL — `Cannot find module '../src/sync/payload'`.

- [ ] **Step 4: Implement**

Create `src/sync/payload.ts`:

```ts
import type { Draft, SubmitPayload, SubmittedTest, TestDef } from '../api/types';

/**
 * Build the exact JSON RadMachine expects for a new session.
 *
 * The API requires EVERY non-composite test to be present on POST, so tests
 * the user left alone are submitted as skipped rather than omitted. Composites
 * are never included -- the server calculates them.
 */
export function buildPayload(defs: TestDef[], draft: Draft): SubmitPayload {
  const tests: Record<string, SubmittedTest> = {};

  for (const def of defs) {
    const entry = draft.values[def.slug];
    if (!entry || entry.value === null || entry.value === undefined) {
      tests[def.slug] = { skipped: true };
      continue;
    }
    const comment = entry.comment?.trim();
    tests[def.slug] = comment ? { value: entry.value, comment } : { value: entry.value };
  }

  return {
    unit_test_collection: draft.utcUrl,
    day: 0,
    in_progress: false,
    work_started: draft.workStarted,
    work_completed: draft.workCompleted,
    user_key: draft.userKey,
    tests,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- payload`
Expected: 9 passing.

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/sync/payload.ts __tests__/payload.test.ts
git commit -m "feat: build submission payload from a draft"
```

---

## Task 3: Classify the submission response (pure, TDD)

The outbox needs to know what a response *means* — especially that a duplicate `user_key` is a success, not a failure.

**Files:**
- Create: `src/api/submit.ts`
- Test: `__tests__/submit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/submit.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- submit`
Expected: FAIL — `Cannot find module '../src/api/submit'`.

- [ ] **Step 3: Implement**

Create `src/api/submit.ts`:

```ts
export type SubmitOutcome =
  | { kind: 'sent'; url: string }
  | { kind: 'duplicate' }
  | { kind: 'rejected'; message: string }
  | { kind: 'auth'; message: string }
  | { kind: 'retry'; message: string };

const DUPLICATE_MARKER = 'user key already exists';

/**
 * What does this response mean for the outbox?
 *
 * The important case is the duplicate user_key. If a previous attempt reached
 * the server but the response never got back to the phone, the retry is
 * rejected with a 400 -- and that rejection is proof the session exists.
 */
export function classifyResponse(status: number, body: string): SubmitOutcome {
  if (status === 201 || status === 200) {
    let url = '';
    try {
      url = JSON.parse(body)?.url ?? '';
    } catch {
      url = '';
    }
    return { kind: 'sent', url };
  }

  if (status === 400) {
    if (body.toLowerCase().includes(DUPLICATE_MARKER)) return { kind: 'duplicate' };
    return { kind: 'rejected', message: body };
  }

  if (status === 401 || status === 403) return { kind: 'auth', message: body };

  return { kind: 'retry', message: `HTTP ${status}: ${body}` };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- submit`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add src/api/submit.ts __tests__/submit.test.ts
git commit -m "feat: classify submission responses, duplicate key as success"
```

---

## Task 4: The API client

**Files:**
- Create: `src/api/client.ts`
- Test: `__tests__/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/client.test.ts`:

```ts
import { RadClient } from '../src/api/client';

const BASE = 'https://radmachine.radformation.com/emelchor/api';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    status: 200,
    text: async () => '{"count": 0}',
  }) as unknown as typeof fetch;
});

test('it authenticates with the RadAuthorization header, not Authorization', async () => {
  const c = new RadClient(BASE, 'secret-token');
  await c.get('/qa/testlistinstances/');
  const [, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(init.headers.RadAuthorization).toBe('Token secret-token');
  expect(init.headers.Authorization).toBeUndefined();
});

test('a relative path is resolved against the base url', async () => {
  const c = new RadClient(BASE, 't');
  await c.get('/qa/testlistinstances/');
  const [url] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe(`${BASE}/qa/testlistinstances/`);
});

test('an absolute url is used as given', async () => {
  const c = new RadClient(BASE, 't');
  await c.get(`${BASE}/qa/testlists/571/`);
  const [url] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe(`${BASE}/qa/testlists/571/`);
});

test('query params are appended', async () => {
  const c = new RadClient(BASE, 't');
  await c.get('/qa/testlistinstances/', { user_key: 'abc-123' });
  const [url] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toContain('user_key=abc-123');
});

test('a non-2xx GET raises with the status and body', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ status: 401, text: async () => 'nope' });
  const c = new RadClient(BASE, 't');
  await expect(c.get('/qa/testlistinstances/')).rejects.toThrow(/401/);
});

test('post returns status and raw body without raising', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ status: 400, text: async () => 'bad' });
  const c = new RadClient(BASE, 't');
  await expect(c.post('/qa/testlistinstances/', {})).resolves.toEqual({
    status: 400,
    body: 'bad',
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- client`
Expected: FAIL — `Cannot find module '../src/api/client'`.

- [ ] **Step 3: Implement**

Create `src/api/client.ts`:

```ts
/**
 * Thin RadMachine REST client.
 *
 * Auth is a CUSTOM header: RadAuthorization. The standard Authorization
 * header does not work against this API.
 *
 * get() raises on non-2xx because callers want the data or nothing.
 * post() does NOT raise -- the outbox needs to inspect the status itself,
 * since a 400 can mean success (duplicate user_key).
 */
export class RadClient {
  constructor(private base: string, private token: string) {}

  private url(path: string, params?: Record<string, string>): string {
    const full = path.startsWith('http') ? path : this.base + path;
    if (!params) return full;
    const q = new URLSearchParams(params).toString();
    return q ? `${full}?${q}` : full;
  }

  private headers(): Record<string, string> {
    return {
      RadAuthorization: `Token ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.url(path, params);
    const r = await fetch(url, { method: 'GET', headers: this.headers() });
    const body = await r.text();
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`GET ${url} -> ${r.status}: ${body.slice(0, 300)}`);
    }
    return JSON.parse(body) as T;
  }

  async post(path: string, data: unknown): Promise<{ status: number; body: string }> {
    const r = await fetch(this.url(path), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    return { status: r.status, body: await r.text() };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- client`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts __tests__/client.test.ts
git commit -m "feat: RadMachine API client with RadAuthorization header"
```

---

## Task 5: Flatten a test list definition

A test list holds `tests` (test URLs) and `test_lists` (sublist URLs). Order within each array is meaningful; interleaving between them is not expressible from this payload, so top-level tests render first, then each sublist in order — which matches how the list reads in the UI.

**Files:**
- Create: `src/api/definitions.ts`
- Test: `__tests__/definitions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/definitions.test.ts`:

```ts
import { flattenTestList } from '../src/api/definitions';

// A fake fetcher standing in for the API: url -> payload
const payloads: Record<string, any> = {
  'https://x/testlists/571/': {
    name: 'Daily :: Linac QA :: TG-142 Demos',
    tests: ['https://x/tests/1/'],
    test_lists: ['https://x/testlists/900/', 'https://x/testlists/901/'],
  },
  'https://x/testlists/900/': {
    name: 'TG-142 Daily :: CBCT',
    tests: ['https://x/tests/2/', 'https://x/tests/3/'],
    test_lists: [],
  },
  'https://x/testlists/901/': {
    name: 'TG-142 Daily :: Safety',
    tests: ['https://x/tests/4/'],
    test_lists: [],
  },
  'https://x/tests/1/': { slug: 'mlc_check_weekly', name: 'MLC', type: 'boolean' },
  'https://x/tests/2/': { slug: 'cbct_a', name: 'CBCT A', type: 'boolean' },
  'https://x/tests/3/': { slug: 'cbct_b', name: 'CBCT B', type: 'simple' },
  'https://x/tests/4/': { slug: 'beam_on', name: 'Beam on', type: 'boolean' },
};

const fetcher = async (url: string) => payloads[url];

test('top-level tests come first, then each sublist in order', async () => {
  const out = await flattenTestList('https://x/testlists/571/', fetcher);
  expect(out.map((t) => t.slug)).toEqual(['mlc_check_weekly', 'cbct_a', 'cbct_b', 'beam_on']);
});

test('order is a contiguous index over the whole flattened list', async () => {
  const out = await flattenTestList('https://x/testlists/571/', fetcher);
  expect(out.map((t) => t.order)).toEqual([0, 1, 2, 3]);
});

test('each test remembers the sublist it came from', async () => {
  const out = await flattenTestList('https://x/testlists/571/', fetcher);
  expect(out[0].sublist).toBeNull();
  expect(out[1].sublist).toBe('TG-142 Daily :: CBCT');
  expect(out[3].sublist).toBe('TG-142 Daily :: Safety');
});

test('types are carried through', async () => {
  const out = await flattenTestList('https://x/testlists/571/', fetcher);
  expect(out[2]).toMatchObject({ slug: 'cbct_b', type: 'simple' });
});

test('a test type v1 cannot render is rejected loudly', async () => {
  const withUpload = {
    ...payloads,
    'https://x/tests/4/': { slug: 'up', name: 'Upload', type: 'upload' },
  };
  const f = async (url: string) => withUpload[url];
  await expect(flattenTestList('https://x/testlists/571/', f)).rejects.toThrow(/upload/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- definitions`
Expected: FAIL — `Cannot find module '../src/api/definitions'`.

- [ ] **Step 3: Implement**

Create `src/api/definitions.ts`:

```ts
import type { TestDef, TestType } from './types';

export type Fetcher = (url: string) => Promise<any>;

const SUPPORTED: TestType[] = ['simple', 'boolean'];

/**
 * Walk a test list and its sublists into a flat, ordered list of tests.
 *
 * Top-level tests render first, then each sublist in the order the API gives
 * them. The payload does not express interleaving between the two, and this
 * matches how the list reads in the RadMachine UI.
 *
 * v1 supports only hand-entered tests. Anything else is a hard error rather
 * than a silently missing field on the worksheet.
 */
export async function flattenTestList(listUrl: string, fetchJson: Fetcher): Promise<TestDef[]> {
  const out: TestDef[] = [];

  const walk = async (url: string, sublistName: string | null): Promise<void> => {
    const list = await fetchJson(url);

    for (const testUrl of list.tests ?? []) {
      const t = await fetchJson(testUrl);
      if (!SUPPORTED.includes(t.type)) {
        throw new Error(
          `Test '${t.slug}' is of type '${t.type}', which this app cannot fill in. ` +
            `Supported types: ${SUPPORTED.join(', ')}.`
        );
      }
      out.push({
        slug: t.slug,
        name: t.name,
        type: t.type as TestType,
        order: out.length,
        sublist: sublistName,
      });
    }

    for (const childUrl of list.test_lists ?? []) {
      const child = await fetchJson(childUrl);
      await walk(childUrl, child.name);
    }
  };

  await walk(listUrl, null);
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- definitions`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/api/definitions.ts __tests__/definitions.test.ts
git commit -m "feat: flatten a test list and its sublists into ordered tests"
```

---

## Task 6: The outbox state machine (pure, TDD)

**Files:**
- Create: `src/sync/worker.ts`
- Test: `__tests__/worker.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/worker.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- worker`
Expected: FAIL — `Cannot find module '../src/sync/worker'`.

- [ ] **Step 3: Implement**

Create `src/sync/worker.ts`:

```ts
import type { SubmitOutcome } from '../api/submit';

export type OutboxStatus = 'queued' | 'sent' | 'failed';

export type OutboxState = {
  status: OutboxStatus;
  sessionUrl: string | null;
  error: string | null;
};

const MAX_BACKOFF_MS = 5 * 60 * 1000;

/** Where does an outbox row go after this response? */
export function nextState(outcome: SubmitOutcome, _attempts: number): OutboxState {
  switch (outcome.kind) {
    case 'sent':
      return { status: 'sent', sessionUrl: outcome.url || null, error: null };
    case 'duplicate':
      // An earlier attempt landed. The real url is resolved by a follow-up
      // GET ?user_key=..., which is not this function's job.
      return { status: 'sent', sessionUrl: null, error: null };
    case 'rejected':
      return { status: 'failed', sessionUrl: null, error: outcome.message };
    case 'auth':
      return { status: 'failed', sessionUrl: null, error: outcome.message };
    case 'retry':
      return { status: 'queued', sessionUrl: null, error: outcome.message };
  }
}

/** Exponential backoff, capped at five minutes. */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, MAX_BACKOFF_MS);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- worker`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sync/worker.ts __tests__/worker.test.ts
git commit -m "feat: outbox state machine with capped backoff"
```

---

## Task 7: SQLite schema and stores

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/collections.ts`
- Create: `src/db/sessions.ts`
- Create: `src/db/outbox.ts`

These wrap `expo-sqlite`, which needs a device, so they are exercised by the end-to-end test in Task 11 rather than by unit tests. Keep them thin — all judgement lives in the pure modules already tested.

- [ ] **Step 1: Write the schema**

Create `src/db/schema.ts`:

```ts
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('radmachine.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS collection (
      utc_url     TEXT PRIMARY KEY,
      utc_name    TEXT NOT NULL,
      unit_name   TEXT NOT NULL,
      list_url    TEXT NOT NULL,
      downloaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS test (
      utc_url  TEXT NOT NULL,
      slug     TEXT NOT NULL,
      name     TEXT NOT NULL,
      type     TEXT NOT NULL,
      ord      INTEGER NOT NULL,
      sublist  TEXT,
      PRIMARY KEY (utc_url, slug)
    );

    CREATE TABLE IF NOT EXISTS session (
      id             TEXT PRIMARY KEY,
      utc_url        TEXT NOT NULL,
      user_key       TEXT NOT NULL UNIQUE,
      status         TEXT NOT NULL,
      work_started   TEXT NOT NULL,
      work_completed TEXT
    );

    CREATE TABLE IF NOT EXISTS value (
      session_id TEXT NOT NULL,
      slug       TEXT NOT NULL,
      value      TEXT,
      comment    TEXT,
      PRIMARY KEY (session_id, slug)
    );

    CREATE TABLE IF NOT EXISTS outbox (
      session_id   TEXT PRIMARY KEY,
      payload      TEXT NOT NULL,
      status       TEXT NOT NULL,
      attempts     INTEGER NOT NULL DEFAULT 0,
      next_attempt TEXT,
      session_url  TEXT,
      error        TEXT
    );
  `);
  return db;
}
```

`value.value` is TEXT because SQLite has no boolean: store `'true'`/`'false'` for booleans and the number as text for `simple`, and convert on read.

- [ ] **Step 2: Write the collection store**

Create `src/db/collections.ts`:

```ts
import type { TestDef } from '../api/types';
import { getDb } from './schema';

export type Collection = {
  utcUrl: string;
  utcName: string;
  unitName: string;
  listUrl: string;
  downloadedAt: string;
};

export async function saveCollection(c: Collection, tests: TestDef[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO collection (utc_url, utc_name, unit_name, list_url, downloaded_at)
       VALUES (?, ?, ?, ?, ?)`,
      [c.utcUrl, c.utcName, c.unitName, c.listUrl, c.downloadedAt]
    );
    await db.runAsync(`DELETE FROM test WHERE utc_url = ?`, [c.utcUrl]);
    for (const t of tests) {
      await db.runAsync(
        `INSERT INTO test (utc_url, slug, name, type, ord, sublist) VALUES (?, ?, ?, ?, ?, ?)`,
        [c.utcUrl, t.slug, t.name, t.type, t.order, t.sublist]
      );
    }
  });
}

export async function listCollections(): Promise<Collection[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(`SELECT * FROM collection ORDER BY utc_name`);
  return rows.map((r) => ({
    utcUrl: r.utc_url,
    utcName: r.utc_name,
    unitName: r.unit_name,
    listUrl: r.list_url,
    downloadedAt: r.downloaded_at,
  }));
}

export async function getTests(utcUrl: string): Promise<TestDef[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM test WHERE utc_url = ? ORDER BY ord`,
    [utcUrl]
  );
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    type: r.type,
    order: r.ord,
    sublist: r.sublist,
  }));
}
```

- [ ] **Step 3: Write the session store**

Create `src/db/sessions.ts`:

```ts
import type { Draft, DraftValue } from '../api/types';
import { getDb } from './schema';

/** SQLite has no boolean; keep the type recoverable on read. */
function encode(v: number | boolean | null): string | null {
  if (v === null) return null;
  return typeof v === 'boolean' ? String(v) : String(v);
}

function decode(raw: string | null): number | boolean | null {
  if (raw === null) return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

export async function createSession(
  id: string,
  utcUrl: string,
  userKey: string,
  workStarted: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO session (id, utc_url, user_key, status, work_started) VALUES (?, ?, ?, 'draft', ?)`,
    [id, utcUrl, userKey, workStarted]
  );
}

export async function setValue(
  sessionId: string,
  slug: string,
  v: DraftValue
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO value (session_id, slug, value, comment) VALUES (?, ?, ?, ?)`,
    [sessionId, slug, encode(v.value), v.comment ?? null]
  );
}

export async function loadDraft(sessionId: string): Promise<Draft> {
  const db = await getDb();
  const s = await db.getFirstAsync<any>(`SELECT * FROM session WHERE id = ?`, [sessionId]);
  if (!s) throw new Error(`No session ${sessionId}`);
  const rows = await db.getAllAsync<any>(`SELECT * FROM value WHERE session_id = ?`, [sessionId]);

  const values: Record<string, DraftValue> = {};
  for (const r of rows) {
    values[r.slug] = { value: decode(r.value), comment: r.comment ?? undefined };
  }

  return {
    userKey: s.user_key,
    utcUrl: s.utc_url,
    workStarted: s.work_started,
    workCompleted: s.work_completed ?? '',
    values,
  };
}

export async function markCompleted(sessionId: string, workCompleted: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE session SET status = 'queued', work_completed = ? WHERE id = ?`,
    [workCompleted, sessionId]
  );
}
```

- [ ] **Step 4: Write the outbox store**

Create `src/db/outbox.ts`:

```ts
import type { SubmitPayload } from '../api/types';
import type { OutboxState } from '../sync/worker';
import { getDb } from './schema';

export type OutboxRow = {
  sessionId: string;
  payload: SubmitPayload;
  status: string;
  attempts: number;
  nextAttempt: string | null;
  sessionUrl: string | null;
  error: string | null;
};

export async function enqueue(sessionId: string, payload: SubmitPayload): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO outbox (session_id, payload, status, attempts) VALUES (?, ?, 'queued', 0)`,
    [sessionId, JSON.stringify(payload)]
  );
}

export async function dueRows(nowIso: string): Promise<OutboxRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM outbox WHERE status = 'queued' AND (next_attempt IS NULL OR next_attempt <= ?)`,
    [nowIso]
  );
  return rows.map(toRow);
}

export async function allRows(): Promise<OutboxRow[]> {
  const db = await getDb();
  return (await db.getAllAsync<any>(`SELECT * FROM outbox`)).map(toRow);
}

export async function applyState(
  sessionId: string,
  state: OutboxState,
  attempts: number,
  nextAttemptIso: string | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox SET status = ?, session_url = ?, error = ?, attempts = ?, next_attempt = ?
     WHERE session_id = ?`,
    [state.status, state.sessionUrl, state.error, attempts, nextAttemptIso, sessionId]
  );
}

function toRow(r: any): OutboxRow {
  return {
    sessionId: r.session_id,
    payload: JSON.parse(r.payload),
    status: r.status,
    attempts: r.attempts,
    nextAttempt: r.next_attempt,
    sessionUrl: r.session_url,
    error: r.error,
  };
}
```

- [ ] **Step 5: Check it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/db
git commit -m "feat: SQLite schema and stores for collections, sessions, outbox"
```

---

## Task 8: Credentials in secure storage

**Files:**
- Create: `src/secure/credentials.ts`

- [ ] **Step 1: Implement**

Create `src/secure/credentials.ts`:

```ts
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'radmachine_token';
const BASE_KEY = 'radmachine_base_url';

export function baseUrlFor(tenant: string): string {
  return `https://radmachine.radformation.com/${tenant}/api`;
}

/** Store only after the caller has verified the token against the API. */
export async function saveCredentials(baseUrl: string, token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(BASE_KEY, baseUrl);
}

export async function loadCredentials(): Promise<{ baseUrl: string; token: string } | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  const baseUrl = await SecureStore.getItemAsync(BASE_KEY);
  if (!token || !baseUrl) return null;
  return { baseUrl, token };
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(BASE_KEY);
}
```

- [ ] **Step 2: Check it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/secure/credentials.ts
git commit -m "feat: token in Android keystore via expo-secure-store"
```

---

## Task 9: Screens

**Files:**
- Create: `app/_layout.tsx`, `app/connect.tsx`, `app/index.tsx`, `app/worksheet/[sessionId].tsx`, `app/queue.tsx`
- Modify: `package.json` (main entry), `app.json` (scheme)

- [ ] **Step 1: Point the app at expo-router**

In `package.json` set:

```json
{ "main": "expo-router/entry" }
```

In `app.json`, inside the existing `expo` object, add:

```json
{ "scheme": "radmachine" }
```

- [ ] **Step 2: Write the navigation shell**

Create `app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Collections' }} />
      <Stack.Screen name="connect" options={{ title: 'Connection' }} />
      <Stack.Screen name="queue" options={{ title: 'Send queue' }} />
      <Stack.Screen name="worksheet/[sessionId]" options={{ title: 'Worksheet' }} />
    </Stack>
  );
}
```

- [ ] **Step 3: Write the connection screen**

Create `app/connect.tsx`. It verifies the token with a real GET before storing it — an unverified token would fail silently later, in a bunker, with no way to diagnose it.

```tsx
import { useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { RadClient } from '../src/api/client';
import { baseUrlFor, saveCredentials } from '../src/secure/credentials';

export default function Connect() {
  const [tenant, setTenant] = useState('emelchor');
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');

  const verify = async () => {
    setStatus('Checking...');
    const baseUrl = baseUrlFor(tenant.trim());
    try {
      const c = new RadClient(baseUrl, token.trim());
      await c.get('/qa/unittestcollections/', { limit: '1' });
      await saveCredentials(baseUrl, token.trim());
      setStatus('Connected.');
      router.replace('/');
    } catch (e: any) {
      setStatus(`Failed: ${e.message}`);
    }
  };

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text>Tenant</Text>
      <TextInput
        value={tenant}
        onChangeText={setTenant}
        autoCapitalize="none"
        style={{ borderWidth: 1, padding: 8 }}
      />
      <Text>API token</Text>
      <TextInput
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        secureTextEntry
        style={{ borderWidth: 1, padding: 8 }}
      />
      <Button title="Verify and save" onPress={verify} />
      <Text>{status}</Text>
    </View>
  );
}
```

- [ ] **Step 4: Write the catalogue screen**

Create `app/index.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { RadClient } from '../src/api/client';
import { flattenTestList } from '../src/api/definitions';
import { listCollections, saveCollection, type Collection } from '../src/db/collections';
import { createSession } from '../src/db/sessions';
import { loadCredentials } from '../src/secure/credentials';
import { nowStamp } from '../src/sync/time';

export default function Catalogue() {
  const [local, setLocal] = useState<Collection[]>([]);
  const [remote, setRemote] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  useFocusEffect(
    useCallback(() => {
      listCollections().then(setLocal);
    }, [])
  );

  const browse = async () => {
    const creds = await loadCredentials();
    if (!creds) return router.push('/connect');
    setMsg('Loading...');
    const c = new RadClient(creds.baseUrl, creds.token);
    const r = await c.get<any>('/qa/unittestcollections/');
    setRemote(r.results ?? []);
    setMsg('');
  };

  const download = async (utc: any) => {
    const creds = await loadCredentials();
    if (!creds) return router.push('/connect');
    setMsg(`Downloading ${utc.name}...`);
    const c = new RadClient(creds.baseUrl, creds.token);
    try {
      const listUrl = `${creds.baseUrl}/qa/testlists/${utc.object_id}/`;
      const tests = await flattenTestList(listUrl, (u) => c.get<any>(u));
      const unit = await c.get<any>(utc.unit);
      await saveCollection(
        {
          utcUrl: utc.url,
          utcName: utc.name,
          unitName: unit.name,
          listUrl,
          downloadedAt: nowStamp(),
        },
        tests
      );
      setLocal(await listCollections());
      setMsg(`Saved ${tests.length} tests.`);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const startSession = async (col: Collection) => {
    const id = Crypto.randomUUID();
    await createSession(id, col.utcUrl, Crypto.randomUUID(), nowStamp());
    router.push(`/worksheet/${id}`);
  };

  return (
    <View style={{ padding: 16, gap: 12, flex: 1 }}>
      <Button title="Connection settings" onPress={() => router.push('/connect')} />
      <Button title="Send queue" onPress={() => router.push('/queue')} />
      <Button title="Browse instance" onPress={browse} />
      <Text>{msg}</Text>

      <Text style={{ fontWeight: 'bold' }}>Available offline</Text>
      <FlatList
        data={local}
        keyExtractor={(i) => i.utcUrl}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8 }}>
            <Text>{item.unitName} — {item.utcName}</Text>
            <Button title="Start session" onPress={() => startSession(item)} />
          </View>
        )}
      />

      <Text style={{ fontWeight: 'bold' }}>On the instance</Text>
      <FlatList
        data={remote}
        keyExtractor={(i) => i.url}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8 }}>
            <Text>{item.name}</Text>
            <Button title="Download" onPress={() => download(item)} />
          </View>
        )}
      />
    </View>
  );
}
```

- [ ] **Step 5: Add the timestamp helper the screens use**

Create `src/sync/time.ts`:

```ts
/**
 * 'YYYY-MM-DD HH:mm:ss' in the PHONE's local time.
 *
 * These stamps record when the physicist did the work, not when the phone
 * managed to sync, so they must never be derived from the server clock.
 */
export function nowStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}
```

- [ ] **Step 6: Install the uuid dependency the catalogue uses**

```bash
npx expo install expo-crypto
```

- [ ] **Step 7: Write the worksheet screen**

Create `app/worksheet/[sessionId].tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Button, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { getTests } from '../../src/db/collections';
import { loadDraft, markCompleted, setValue } from '../../src/db/sessions';
import { enqueue } from '../../src/db/outbox';
import { buildPayload } from '../../src/sync/payload';
import { nowStamp } from '../../src/sync/time';
import type { TestDef, DraftValue } from '../../src/api/types';

export default function Worksheet() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const [tests, setTests] = useState<TestDef[]>([]);
  const [values, setValues] = useState<Record<string, DraftValue>>({});

  useEffect(() => {
    (async () => {
      const draft = await loadDraft(sessionId);
      setTests(await getTests(draft.utcUrl));
      setValues(draft.values);
    })();
  }, [sessionId]);

  const update = async (slug: string, v: DraftValue) => {
    setValues((prev) => ({ ...prev, [slug]: v }));
    await setValue(sessionId, slug, v); // persist on every change
  };

  const finish = async () => {
    const completed = nowStamp();
    await markCompleted(sessionId, completed);
    const draft = await loadDraft(sessionId);
    const payload = buildPayload(tests, { ...draft, workCompleted: completed });
    await enqueue(sessionId, payload);
    router.replace('/queue');
  };

  let lastSublist: string | null | undefined;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      {tests.map((t) => {
        const header = t.sublist !== lastSublist ? ((lastSublist = t.sublist), t.sublist) : null;
        const v = values[t.slug]?.value ?? null;
        return (
          <View key={t.slug}>
            {header ? (
              <Text style={{ fontWeight: 'bold', marginTop: 12 }}>{header}</Text>
            ) : null}
            <Text>{t.name}</Text>
            {t.type === 'boolean' ? (
              <Switch
                value={v === true}
                onValueChange={(b) => update(t.slug, { value: b })}
              />
            ) : (
              <TextInput
                keyboardType="numeric"
                value={v === null ? '' : String(v)}
                onChangeText={(txt) =>
                  update(t.slug, { value: txt.trim() === '' ? null : Number(txt) })
                }
                style={{ borderWidth: 1, padding: 8 }}
              />
            )}
          </View>
        );
      })}
      <Button title="Finish and queue" onPress={finish} />
    </ScrollView>
  );
}
```

- [ ] **Step 8: Write the queue screen**

Create `app/queue.tsx`:

```tsx
import { useCallback, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { allRows, type OutboxRow } from '../src/db/outbox';
import { drainOutbox } from '../src/sync/drain';

export default function Queue() {
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => setRows(await allRows()), []);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const send = async () => {
    setMsg('Sending...');
    const n = await drainOutbox();
    setMsg(`Processed ${n} session(s).`);
    await refresh();
  };

  return (
    <View style={{ padding: 16, gap: 12, flex: 1 }}>
      <Button title="Send now" onPress={send} />
      <Text>{msg}</Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.sessionId}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8 }}>
            <Text>{item.status.toUpperCase()} — attempts {item.attempts}</Text>
            {item.sessionUrl ? <Text>{item.sessionUrl}</Text> : null}
            {item.error ? <Text style={{ color: 'red' }}>{item.error}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
```

- [ ] **Step 9: Check it compiles**

Run: `npx tsc --noEmit`
Expected: errors only for `../src/sync/drain`, written in Task 10.

- [ ] **Step 10: Commit**

```bash
git add app package.json app.json src/sync/time.ts
git commit -m "feat: connection, catalogue, worksheet and queue screens"
```

---

## Task 10: Wire the outbox drain

**Files:**
- Create: `src/sync/drain.ts`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Implement the drain**

Create `src/sync/drain.ts`:

```ts
import { RadClient } from '../api/client';
import { classifyResponse } from '../api/submit';
import { applyState, dueRows } from '../db/outbox';
import { loadCredentials } from '../secure/credentials';
import { backoffMs, nextState } from './worker';

/**
 * Send every due row. Returns how many were processed.
 *
 * A duplicate user_key means an earlier attempt already reached the server;
 * we then GET by user_key to recover the session url instead of losing it.
 */
export async function drainOutbox(): Promise<number> {
  const creds = await loadCredentials();
  if (!creds) return 0;

  const client = new RadClient(creds.baseUrl, creds.token);
  const rows = await dueRows(new Date().toISOString());

  for (const row of rows) {
    const attempts = row.attempts + 1;
    let outcome;
    try {
      const r = await client.post('/qa/testlistinstances/', row.payload);
      outcome = classifyResponse(r.status, r.body);
    } catch (e: any) {
      outcome = { kind: 'retry' as const, message: String(e?.message ?? e) };
    }

    const state = nextState(outcome, attempts);

    if (outcome.kind === 'duplicate') {
      try {
        const found = await client.get<any>('/qa/testlistinstances/', {
          user_key: row.payload.user_key,
        });
        state.sessionUrl = found?.results?.[0]?.url ?? null;
      } catch {
        // Leave it null; the row is still correctly marked sent.
      }
    }

    const nextAttempt =
      state.status === 'queued'
        ? new Date(Date.now() + backoffMs(attempts)).toISOString()
        : null;

    await applyState(row.sessionId, state, attempts, nextAttempt);
  }

  return rows.length;
}
```

- [ ] **Step 2: Drain on connectivity and on foreground**

Replace `app/_layout.tsx` with:

```tsx
import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Stack } from 'expo-router';
import { drainOutbox } from '../src/sync/drain';

export default function Layout() {
  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) {
        drainOutbox().catch(() => {});
      }
    });
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') drainOutbox().catch(() => {});
    });
    return () => {
      unsubNet();
      sub.remove();
    };
  }, []);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Collections' }} />
      <Stack.Screen name="connect" options={{ title: 'Connection' }} />
      <Stack.Screen name="queue" options={{ title: 'Send queue' }} />
      <Stack.Screen name="worksheet/[sessionId]" options={{ title: 'Worksheet' }} />
    </Stack>
  );
}
```

- [ ] **Step 3: Check everything compiles and the suite is green**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all tests pass (payload 9, submit 8, client 6, definitions 5, worker 7, sanity 1).

- [ ] **Step 4: Commit**

```bash
git add src/sync/drain.ts app/_layout.tsx
git commit -m "feat: drain the outbox on connectivity and foreground"
```

---

## Task 11: End-to-end on the real tenant

This is the acceptance test. It creates real sessions on `emelchor`; note that a submitted session **cannot be deleted by API** (DELETE returns 500 once a session exists), so test sessions stay until removed by hand in the UI.

- [ ] **Step 1: Run the app and connect**

```bash
npx expo start
```

On the phone: open the app, go to Connection, tenant `emelchor`, paste the token from `API_Context/credentials.txt`. Expected: "Connected."

- [ ] **Step 2: Download the target list**

Browse instance → find `Daily :: Linac QA :: TG-142 Demos` → Download.
Expected: "Saved 16 tests."

- [ ] **Step 3: Confirm the boolean encoding, online, with one session**

Start a session, set every boolean and fill the 6 numeric fields, Finish, Send now.
Expected: the queue row shows SENT with a session url.

If instead it shows FAILED with a validation message about the boolean fields, change `encode`/the payload to submit `1`/`0` instead of `true`/`false`, update the `payload.test.ts` expectations to match, re-run `npm test`, and repeat this step. **Record the answer in the spec's open items section either way.**

- [ ] **Step 4: Verify by GET, not by the app's own claim**

From the RadMachine API repo:

```bash
cd "C:/Users/eduar/Claude Code/RadMachine API"
python API_Context/test_connection.py
```

Then check the session with a scratchpad script that GETs
`/qa/testlistinstances/?user_key=<the uuid shown in the queue>` and prints
`work_started`, `work_completed` and every test instance value. Expected: 16 values, matching what was entered on the phone.

- [ ] **Step 5: The actual acceptance test — airplane mode**

1. Start a new session while online.
2. Turn on airplane mode.
3. Fill the whole list. Note the wall-clock time.
4. Press Finish. Expected: the queue shows QUEUED, and sending fails silently into retry.
5. Wait two minutes, then turn airplane mode off.
6. Expected: within a few seconds the queue flips to SENT without being touched.

- [ ] **Step 6: Verify the timestamps are the work time, not the sync time**

GET the new session by `user_key`. Expected: `work_started` and `work_completed` match step 5's wall-clock times, **not** the moment airplane mode was switched off. This is the requirement that makes the record trustworthy.

- [ ] **Step 7: Verify retry is idempotent**

With the row already SENT, press "Send now" again. Expected: no second session appears on the tenant — confirm by GET that `?user_key=<uuid>` still returns exactly one result.

- [ ] **Step 8: Commit the findings**

Update the spec's open-items section with the confirmed boolean encoding, then:

```bash
cd "C:/Users/eduar/Claude Code/RadMachine API"
git add docs/superpowers/specs/2026-08-17-radmachine-mobile-design.md
git commit -m "spec: record verified boolean encoding for mobile v1"
```

---

## Done when

- `npm test` is green and `npx tsc --noEmit` is clean.
- A list filled entirely in airplane mode appears on `emelchor` after connectivity returns, with the phone's timestamps.
- Pressing send twice produces exactly one session.

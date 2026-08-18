# RadMachine Mobile v1.1 — close the failure paths

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Make the failure paths as finished as the happy path. v1 proved the offline cycle end to end on real hardware; a final review found that when anything goes wrong the app records it correctly in SQLite and then has no way to tell the user or reach the data again.

**Origin:** final code review of v1 (`3a93dba..2cfc87c`). v1 plan: `2026-08-17-radmachine-mobile-v1.md`. Spec: `../specs/2026-08-17-radmachine-mobile-design.md`.

**Project:** `C:\Users\eduar\Claude Code\radmachine-mobile` — Expo SDK 54, expo-router 6.0.24. Entry state: 43 tests passing, `tsc` clean.

---

## The shape of every finding

The values are never destroyed — per-keystroke persistence works. But four separate paths leave them **unreachable**, which for the physicist is the same thing. Nothing here is architectural: a status transition, a validity check on state we already hold, a list query.

## What v1.1 fixes

| Ref | Problem | Fix |
|---|---|---|
| **C1** | One 401 marks *every* queued session `failed`, and nothing can move a row back to `queued`. A morning's QA round becomes unreachable. The v1 spec specified a manual retry; it was never built. | `auth` keeps rows `queued` and aborts the pass; add per-row Retry |
| **C2** | A non-empty numeric field that doesn't parse (`1.2.3`, a bare `-`) is submitted as `{"skipped": true}` while the box visibly contains text | Surface invalidity, block finish |
| **C3** | An abandoned draft is unreachable forever — nothing lists `status='draft'` sessions | "Sessions in progress" on the catalogue |
| **Summary** | Nothing tells the physicist "16 tests, 4 will be recorded as skipped" | Pre-submit confirmation |
| **I2** | `finish()` builds the payload from React state that may not have loaded; the button is tappable during first render | Re-read definitions from the DB; disable until loaded |
| **I4** | `getDb()` memoizes the handle, not the promise, so cold start opens two connections and defeats write ordering | Memoize the promise |
| **I5** | A UTC pointing at a **cycle** downloads an unrelated test list under the cycle's name. Verified: `emelchor` has one such UTC (`content_type` 22 = `qa.testlistcycle`) | Filter the catalogue by `model === 'testlist'` |
| **Tests** | `src/sync/drain.ts` — the most safety-critical file — has zero tests, though all its deps are mockable module imports. `definitions.test.ts`'s "no url is fetched twice" asserts nothing (its fixture is a tree, so no url is shared) | Add drain tests; give the fixture a shared test url |

Deferred to v2, deliberately: three-state booleans (I1), request timeouts (I6), timezone offsets (I7), duplicate-slug messaging (I8), and every Minor.

---

## Task 13 — Pure logic, extracted and tested

**Files:** create `src/sync/reading.ts`, `src/db/codec.ts`, `__tests__/reading.test.ts`, `__tests__/codec.test.ts`, `__tests__/time.test.ts`; modify `src/db/sessions.ts`, `src/api/definitions.ts`, `__tests__/definitions.test.ts`.

The subtle logic in the worksheet (text/value duality, comma normalisation, sign toggling) currently lives inside a component and cannot be tested. Extract it.

- `parseReading(text: string): number | null` — trims, normalises `,`→`.`, returns `null` for empty or unparseable. This is the whole surface of C2.
- Move `encode`/`decode` out of `sessions.ts` into `src/db/codec.ts` (pure), round-trip `true`/`false`/`0`/`-0.3`/`null`. `0` and `false` are what a sloppy codec loses.
- Test `nowStamp`: month +1, zero-padding, midnight, single-digit day.
- `flattenTestList`: reject a slug appearing twice with the same explanatory style already used for unsupported types, and change the test fixture so two sublists share a test url — which makes the existing "no url is fetched twice" test actually test something.

## Task 14 — Drain and schema

**Files:** modify `src/sync/worker.ts`, `src/sync/drain.ts`, `src/db/schema.ts`; create `__tests__/drain.test.ts`.

- An auth error is a property of the *credentials*, not the payload — transient by nature. `nextState` maps `auth` to `queued`, and the drain **aborts the remaining rows** on the first auth failure rather than burning ten rows against a bad token, surfacing one clear message.
- `getDb`: memoize the promise, not the handle.
- Drain tests via `jest.mock` of `../db/outbox`, `../secure/credentials`, `../api/client`: one failing row does not abort the others; a duplicate-400 triggers the recovery GET and stores its url; `next_attempt` set on retry and cleared on success; an auth failure leaves rows queued and stops the pass.

## Task 15 — The retry path

**Files:** modify `src/db/outbox.ts`, `app/queue.tsx`.

- `requeue(sessionId)` — `status='queued', attempts=0, next_attempt=NULL, error=NULL`. This is what rescues C1, and also a `rejected` row after the definition is re-downloaded.
- Queue screen: a Retry button on any non-`sent` row, and an honest summary (`N sent, N failed, N still queued`) instead of "Processed N session(s)", which reads as success when it isn't.

## Task 16 — The worksheet

**Files:** modify `app/worksheet/[sessionId].tsx`.

- Use `parseReading`. When `texts[slug]` is non-empty but the parsed value is `null`, mark the field visibly invalid.
- Block finish while any field is invalid.
- `finish()` re-reads definitions with `getTests(draft.utcUrl)` rather than trusting React state, and refuses to enqueue an empty definition. Disable the button until loaded.
- Pre-submit confirmation: counts filled and skipped, names the skipped tests, and cannot be dismissed into a submit while anything is invalid. The review's verdict: if only one thing gets built, this is it — it turns three silent failures into one readable moment.

## Task 17 — The catalogue

**Files:** modify `app/index.tsx`.

- "Sessions in progress": `SELECT * FROM session WHERE status='draft'`, each linking to `/worksheet/<id>`. Needs a `listDrafts()` in `src/db/sessions.ts`.
- Resolve each UTC's `content_type` and show only `model === 'testlist'`. Resolve by model name, not by hardcoded pk — the pk is per-tenant. Note how many were hidden rather than dropping them silently.

## Done when

`npm test` green with the new suites, `tsc` clean, and on the phone: a bad token leaves the queue retryable, an unparseable field cannot be submitted as skipped, an abandoned draft can be reopened, and finishing shows what is about to be recorded.

# RadMachine mobile — offline QA capture, v1 design

**Date:** 2026-08-17
**Scope:** a new Android/iOS app that captures RadMachine QA results offline and submits them
by API when connectivity returns. This spec covers **v1 only** — one vertical slice through
the whole system.
**Tenant:** `emelchor` (sandbox) exclusively.
**Audience:** proof of concept for Eduard. Not a product, not distributed, not for clients.

## Purpose

A physicist doing a daily QA round walks the treatment room with a paper sheet because the
bunker has no signal, then types the numbers into RadMachine afterwards. The transcription
step is where errors and delays come from.

v1 replaces the paper sheet for **one scheduled daily list**: download the list definition
while online, fill it in with no connectivity, and have the session appear in RadMachine once
the phone is back on the network — with the timestamps of when the work actually happened.

Explicitly **not** a mobile RadMachine client: no browsing history, no reports, no scheduling,
no administration.

## Findings that shape the design

All verified against `emelchor` on 2026-08-17 unless noted.

### The API is unreachable from a browser

An unauthenticated CORS preflight returns no CORS headers at all:

```
OPTIONS /qa/testlistinstances/  (Origin + Access-Control-Request-Headers)
  -> 401, no Access-Control-Allow-Origin
GET /  (Origin)
  -> 401, no Access-Control-Allow-Origin
```

A PWA — otherwise the cheapest path to both platforms — would need a hosted proxy to relay
every request. That is infrastructure to run, secure and pay for, which a proof of concept
does not justify. **A native app has no same-origin policy and talks to the API directly.**
This is the single decisive reason for the stack choice.

### The server is the calculation engine

`POST /qa/testlistinstances/` auto-calculates composites — they must **not** be submitted
(`RADMACHINE_API_CONTEXT.md:112`). `PATCH` recalculates every composite in the list.

So the app never needs to run a `calculation_procedure`. It captures the directly entered
values; RadMachine computes everything derived, with its own Python, its own libraries and
its own `pylinac`. The stored record is byte-for-byte what the web UI would have produced.

**Design rule, binding on all future phases:** anything the phone computes is an *indication*
shown to the user, never a stored result. Two calculation engines that can disagree by a
decimal is a validation liability in a clinical QA context. The record of truth is always what
RadMachine computed.

### `user_key` makes the outbox idempotent

`user_key` is a free-text field (max 255 chars), unique per submission; a duplicate returns
HTTP 400 "test list instance with this user key already exists".

This solves the hardest problem in offline sync. If the phone POSTs, the server commits, and
the connection drops before the response arrives, the phone cannot tell success from failure.
Blind retry duplicates the session; not retrying loses it.

With a UUID `user_key` generated **on the phone at session-creation time** and frozen into the
payload, retry is safe by construction: either the POST succeeds, or the duplicate-400 *is*
the confirmation that a previous attempt landed. The queue can retry indefinitely.

### Target for v1

| | |
|---|---|
| Unit | 9 — TrueBeam1 Demo |
| UTC | 105 — `.../qa/unittestcollections/105/` |
| Test list | 571 — `Daily :: Linac QA :: TG-142 Demos` |
| Frequency | 1 (daily) |
| Composition | 10 `boolean`, 6 `simple`, **0 composites, 0 uploads** |

Four sublists (CBCT, Mechanical, Planer kV and MV Imaging, Safety) plus one test
(`mlc_check_weekly`) at the top level. Every test is fillable by hand — this is a safety-and-mechanics walkaround, the exact
workflow a phone suits.

The 16 slugs, in list order:

```
mlc_check_weekly, cbct_collision_interlocks_functional,
cbct_imaging_treatment_coordinate_coincidence, cbct_positioning_repositioning,
coll_size, odi_at_iso, laser_localization, kv_mv_collision_interlocks_functional,
kv_mv_imaging_treatment_coordinate_coincidence, kv_mv_positioning_repositioning,
av_monitors, beam_on, door_closing_safety, door_interlock, radiation_area_monitor,
stero_interlocks
```

Consequence accepted knowingly: with no composites in this list, **v1 does not demonstrate
server-side calculation live**. What it demonstrates is the offline cycle. Adding a list with
composites later is a data change, not an architecture change.

## Scope

**In:**

- One-time credential entry (tenant + token), verified against the API before being stored.
- Browse assigned UTCs; mark one or more for offline use; download their definitions.
- Fill a downloaded list offline: numeric fields for `simple`, switches for `boolean`,
  optional per-test comment.
- Queue completed sessions; submit automatically when connectivity returns; retry safely.
- See queue state: pending, sent, failed with reason.

**Out (deferred, each with a later phase):**

- Offline tolerance evaluation (the pass/tolerance/fail traffic light).
- Upload tests and any file handling.
- Running `calculation_procedure` on the device (Pyodide).
- `in_progress` sessions; editing sessions already submitted.
- Test types beyond `simple` and `boolean`.
- Multi-tenant, multi-user, iOS builds via EAS, store distribution.

## Stack

**Expo (React Native), TypeScript.** Rationale: one codebase for both platforms; native HTTP
so CORS does not apply; and the development loop is a QR scan — *Expo Go* on the Android phone
reloads on every save, with no Android SDK, emulator or Apple Developer account. Everything v1
needs is bundled in Expo Go, so the running cost is zero.

- `expo-sqlite` — local store.
- `expo-secure-store` — the API token, in Android's keystore, never in SQLite.
- `@react-native-community/netinfo` — connectivity transitions to trigger the queue.

Flutter was considered and rejected: equally capable, but Dart is used nowhere else here and
buys nothing for this slice.

**Location:** its own repository at `C:\Users\eduar\Claude Code\radmachine-mobile`, separate
from this Python repo. Only this spec lives here.

## Architecture

Four screens, one background worker.

### Screens

1. **Connection** — tenant + token, entered once. Validated with a real GET before saving; the
   token then goes to secure storage.
2. **Catalogue** — lists the UTCs on the instance. Select which to keep offline and download.
   Downloading stores the definition: every test's slug, name, type, order and sublist.
3. **Worksheet** — the downloaded list, grouped by sublist in list order. A numeric keypad
   field per `simple`, a switch per `boolean`. Values save to the draft on every keystroke, so
   a killed app loses nothing.
4. **Queue** — pending / sent / failed, with the failure reason and a manual retry.

### Local data model (SQLite)

- `collection` — one row per downloaded UTC: url, name, unit name, list name, frequency,
  `downloaded_at`.
- `test` — one row per test in a collection: slug, name, type, display order, sublist name.
- `session` — one row per fill-in: uuid, collection url, status, `user_key`, `work_started`,
  `work_completed`.
- `value` — one row per test per session: slug, value, skipped flag, comment.
- `outbox` — one row per session ready to send: the **frozen JSON payload**, attempt count,
  last error, next attempt time.

The payload is frozen at "done", not built at send time. What gets submitted is exactly what
the user saw when they finished, even if the definition changes on the server in between.

### Timestamps

`work_started` and `work_completed` are captured **on the phone, when the work happens**, and
travel inside the payload. They are never the sync time. A control done at 07:40 in a bunker
and synced at 11:00 must be recorded as 07:40.

### Submission payload

```
POST /qa/testlistinstances/
{
  "unit_test_collection": "<full UTC url>",
  "day": 0,
  "in_progress": false,
  "work_started": "<local ISO>",
  "work_completed": "<local ISO>",
  "user_key": "<uuid generated at session creation>",
  "tests": { "<slug>": {"value": <n|true|false>, "comment": "..."}, ... }
}
```

All 16 non-composite tests must be present on POST. A test left blank is submitted as
`{"skipped": true}` — this mirrors how a physicist actually works, rather than blocking
submission until every field is filled.

### Sync worker

A session moves `draft → queued → sent`, or `queued → failed`.

Triggered on connectivity regained and on app foreground; exponential backoff between
attempts.

| Response | Handling |
|---|---|
| 201 | `sent`; record the returned session URL |
| 400, duplicate `user_key` | **`sent`** — a previous attempt landed; idempotent success |
| 400, other | `failed` with the server's message; no automatic retry |
| 401 / 403 | `failed`; surface as an auth problem, do not retry |
| Network error / timeout | stay `queued`, retry with backoff |

Definition drift (a test added or removed server-side after download) surfaces as an "other
400" with a message telling the user to re-download the definition.

## Testing

- **Unit, TDD:** the payload builder is a pure function (definition + draft → JSON). Covers
  skipped tests, boolean encoding, all-16-present, timestamp formatting.
- **Unit, TDD:** the sync state machine against each row of the response table above,
  especially the duplicate-400 → `sent` path.
- **End-to-end, manual:** download online → airplane mode → fill → restore connectivity →
  confirm **by GET** that the session exists on `emelchor` with the expected values and
  timestamps. Never by status code.

## Resolved: `user_key` is a real GET filter

Verified 2026-08-17 on `emelchor`. Unknown filters on this API are silently ignored and return
everything, so the check used a control:

```
GET /qa/testlistinstances/                          -> count 416
GET /qa/testlistinstances/?user_key=<garbage>       -> count 0      (narrowed)
GET /qa/testlistinstances/?bogus_filter_xyz=...     -> count 416    (control: ignored)
```

So after a duplicate-400 the queue can `GET ?user_key=<uuid>` to resolve the session that the
earlier attempt created, and record its real URL rather than marking it sent blind.

## Resolved: booleans submit as `true`/`false`, and negatives are accepted

Verified 2026-08-17 by POSTing all 16 tests of UTC 105 to `emelchor` (session 444):

- `{"value": true}` on a `boolean` test → **201**. The server stores `value: 1.0` and renders
  `value_display: "Pass"`, `pass_fail: ["ok","OK"]`. No `1`/`0` conversion is needed.
- A negative reading is accepted and evaluated correctly: `cbct_positioning_repositioning`
  submitted as `-0.3` against reference 0.0 with a ±1.0 band came back `pass_fail: ["ok","OK"]`.

The second point is why the worksheet needs a sign control: **four of the six numeric tests on
this list have reference 0.0 and a ±1.0 band**, so they record a deviation and half the valid
readings are negative — and Android's numeric keypad has no minus key.

A submitted session **cannot be deleted** by API (`DELETE` returns 500 once a session exists),
so test sessions accumulate on `emelchor` and are removed by hand in the UI if wanted.

## Status

**v1 shipped and verified on device** 2026-08-17: a session filled entirely in airplane mode
reached `emelchor` (session 445) on reconnection, with the phone's work timestamps and no
duplicate `user_key`.

**v1.1 shipped** the same day, after a full code review found the failure paths much less
finished than the happy path — every finding the same shape: the app recorded the problem
correctly in SQLite and then had no way to tell the user or reach the data again. Suite grew
from 43 to 125 tests. Plan: `../plans/2026-08-17-radmachine-mobile-v1-1.md`. It closed:

- an auth error marking every queued session permanently `failed`, plus the manual retry the
  v1 spec specified and v1 never built;
- a non-empty unparseable reading being submitted as `{"skipped": true}` while the field
  visibly held text;
- abandoned drafts being unreachable, and no confirmation of what was about to be recorded;
- a UTC pointing at a **cycle** silently downloading an unrelated test list under the cycle's
  name (`emelchor` has one such collection);
- `getDb` opening two connections on a cold start; `finish()` trusting unloaded React state.

## Known gaps carried into v2

- A draft cannot be discarded, so a mistaken "Start session" leaves a row forever.
- A draft that already has an outbox row can lose later edits. Made **visible** (the row warns)
  rather than fixed — the real fix belongs in the worksheet's pre-submit path.
- Invalid text does not survive an app restart: the field reloads empty and reads as skipped.
- A boolean switch cannot distinguish "recorded as No" from "never touched".
- No request timeouts; naive local timestamps depend on the tenant's timezone matching the
  phone's.
- Catalogue layout was corrected by arithmetic, not observation, before the on-device check.

# RadMachine Mobile

An Android app that lets a medical physicist record QA results **at the treatment machine,
with no network**, and submits them to RadMachine (QATrack+) when connectivity returns.

Proof of concept. Single user, sandbox tenant `emelchor`, run through Expo Go.

## Run it

```bash
npm install
npx expo start --clear
```

Scan the QR with **Expo Go** on an Android phone on the same Wi-Fi. The app runs on the phone;
the terminal is only the bundler. `--clear` matters — a new directory is invisible to Metro
until its cache is reset, which has cost real debugging time twice.

```bash
npm test          # 179 tests, no device needed
npx tsc --noEmit  # must be clean
```

**Expo SDK 54 is pinned deliberately.** The target phone runs Expo Go 54.0.8, which refuses a
newer project outright. Do not upgrade without checking the device first.

## How it is built

The rule the whole codebase follows: **all judgement lives in pure functions that run under
jest on a laptop; the screens and the SQLite wrappers compute nothing.** That is why 179 tests
run in seconds with no device, and why every data-safety bug found so far was caught by a test
rather than by a physicist.

```
src/api/       client (RadAuthorization header), catalogue shaping, definition flattening,
               response classification
src/sync/      payload builder, outbox state machine, drain, schedule refresh, reading parser
src/schedule/  dueState, unit-card grouping                          <- pure, tested
src/qa/        offline tolerance evaluation (ok / tolerance / action) <- pure, tested
src/db/        expo-sqlite stores: collections, sessions, outbox, schedule, codec
src/secure/    the API token, in the Android keystore
src/ui/        Dropdown, PassFail, SettingsMenu (core React Native only, no native pickers)
app/(tabs)/    Dashboard, Downloaded, Browse
app/           worksheet/[sessionId], queue, connect
docs/          the design specs and implementation plans this was built from
```

### The flow

Browse the instance → download a list's definition → fill it in offline (every keystroke
persists) → confirm a pre-submit summary → the payload is frozen into an outbox → a drain sends
it when connectivity returns or the app foregrounds.

### Three decisions worth knowing before changing anything

**The server is the calculation engine.** The app never computes a QA result. It captures
directly entered values; RadMachine calculates composites. Anything the phone computed would be
an indication only, never a stored result — two engines that can disagree by a decimal is a
validation problem in clinical software.

**Retry is idempotent by construction.** A `user_key` is generated on the device before the
first attempt. If a POST reaches the server but the reply is lost, the retry gets a 400 saying
the key already exists — and that rejection *is* the confirmation the session landed. The queue
can retry forever without duplicating a clinical record.

**When the phone and the server can disagree, the phone reports, it does not decide.** The
dashboard shows what the last refresh knew, with a visible "synced N days ago", and never
subtracts work the phone has done but not yet sent. Every attempt to make a number look tidier
by hiding something has produced a bug — see the git log for three of them.

## Verified API facts

Measured against a live tenant, not assumed. Getting any of these wrong is silent.

| | |
|---|---|
| Auth | `RadAuthorization: Token <token>` — **not** the standard `Authorization` header |
| CORS | None at all. The API is unreachable from a browser; a PWA would need a proxy |
| Pagination | `qa/unittestcollections` and `qa/testlistinstances` page at **10**, others at 100. `limit=200` is honoured |
| Composites | Auto-calculated on POST. Never submit them |
| POST | Every non-composite test must be present; unfilled ones go as `{"skipped": true}` |
| Booleans | Submit as `true`/`false`. Stored as `1.0`, displayed as `Pass` |
| Negatives | Accepted and evaluated normally against a two-sided band |
| `user_key` | A real GET filter, so a duplicate-400 can be resolved back to its session |
| DELETE | Returns 500 once a session exists. Test sessions are removed by hand in the UI |

## State

**v1** — the offline cycle, verified on a real phone: a session filled entirely in airplane
mode reached the tenant on reconnection with the bunker's timestamps and no duplicate.

**v1.1** — closed the failure paths a code review found. Every finding had the same shape: the
app recorded the problem correctly and then had no way to tell the user or reach the data
again. An expired token stranding the whole queue, an unparseable reading submitted as skipped
while the field visibly held text, abandoned drafts unreachable, a cycle silently downloading
an unrelated test list.

**v2.0** — three tabs, a schedule store refreshed separately from definitions, and a dashboard
of what each unit owes. Plus, from user feedback: tab icons, a settings menu, RadMachine-style
frequency tiles, instant appearance after download, pull-to-refresh, a Pass/Fail control that
can show "not recorded", and Browse reduced to one job.

**v2.1** — offline tolerance feedback on the worksheet (`ok` / `tolerance` / `action`), reference
and tolerance downloaded with each list, and Browse simplified to filters-only with an automatic
hand-off to Downloaded after a download.

### Next: v2.2 — broader test-type coverage

Uploads, composites, and cycles — the only phase that changes the sync architecture (the queue
would carry files).

### Known gaps carried forward

- A draft cannot be discarded, so a mistaken "Start session" leaves a row forever.
- Re-downloading a list whose server-side definition dropped a test orphans any reading already
  recorded under that slug: not deleted, but invisible and never submitted.
- A draft that already has an outbox row can lose later edits. Visible (the row warns), not fixed.
- Invalid text does not survive an app restart; the field reloads empty and reads as skipped.
- No request timeouts. Timestamps are naive and assume the tenant's timezone matches the phone's
  — the site payload carries a `time_zone`, so the data for a proper fix is available.

## Testing philosophy

Verify by GET, never by status code. A 201 is not evidence that a field stored — the API has
at least one endpoint that returns 201 and silently drops a field. A green test suite proves
the local logic, not what RadMachine actually recorded.

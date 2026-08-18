# RadMachine Mobile v2.0 — the library and the dashboard

**Date:** 2026-08-17
**Scope:** restructure the app around three destinations, store scheduling metadata for
downloaded lists, and add a per-unit dashboard of what is due.
**Tenant:** `emelchor` (sandbox). Android, Expo Go.
**Predecessors:** `2026-08-17-radmachine-mobile-design.md` (v1 + v1.1, both shipped and
verified on device).

## Purpose

v1 answered "can I record a QA round with no signal and have it arrive?" — yes. v2.0 answers
the question a physicist asks *before* walking to the machine: **what do I owe today, and on
which unit?**

Today the app has one screen doing five jobs, and it can only tell you what you downloaded —
not what is due. This adds the scheduling half, and gives the three jobs their own screens.

Explicitly **not** in v2.0: offline tolerance evaluation and boolean Pass/Fail (v2.1), and
broader test-type coverage — uploads, composites, cycles (v2.2).

## Decomposition

The user's v2 request covered four subsystems. Split into three projects, in this order:

| | Project | Why this order |
|---|---|---|
| **v2.0** | This spec — navigation, schedule store, dashboard | The container. Everything else lands inside these screens. |
| **v2.1** | Tolerance feedback offline, and booleans as Pass/Fail | A boolean in RadMachine is not a switch: it is a choice evaluated against a reference, so it belongs with tolerances, not with navigation. |
| **v2.2** | Coverage: missing test types, uploads, composites, cycles | Largest, and the only one that changes the sync architecture (the queue would carry files). |

Building the traffic light before the restructure would mean building it into screens that then
get reorganised.

## Verified facts this design rests on

Measured against `emelchor`, 2026-08-17.

**The UTC payload already carries everything the dashboard needs:**

```json
{ "due_date": "2026-08-18T08:57:00+02:00",
  "frequency": ".../qa/frequencies/1/",
  "unit": ".../units/units/9/",
  "last_instance": ".../qa/testlistinstances/446/" }
```

**Units carry a site, and a site carries a timezone:**

```json
{ "url": ".../units/sites/2/", "name": "A_External RT", "time_zone": "Europe/Madrid" }
```

Six sites on the tenant. The timezone is noted for a later fix — v1's naive timestamps assume
the tenant's timezone matches the phone's — but v2.0 does not act on it.

**`@react-navigation/bottom-tabs` 7.18.16 is already installed** (via expo-router), so a tab
bar costs no new dependency.

Due dates are populated on scheduled collections and `null` on ad-hoc ones.

## Decisions taken

**Staleness: report it, never guess around it.** Cards show the numbers from the last refresh
with a visible "synced N days ago". The alternative — subtracting sessions the phone has
completed but not yet sent — produces a number that corresponds to nothing RadMachine knows,
and silently over-credits work if that session later fails to submit.

This is v1's rule applied again: **when the phone and the server can disagree, the phone
reports, it does not decide.** Lists with unsent sessions get their own marker beside the
count rather than being subtracted from it, so both facts are visible and neither number lies.

**Tapping a frequency opens the library pre-filtered**, rather than the dashboard rendering its
own list. One list screen, used twice. Two list screens would eventually disagree.

**Due and overdue are counted together but distinguished** — `4 (2 overdue)`. A daily control
three days late and one due this morning are different situations; a single combined number
hides that, and showing only overdue hides today's work.

**Only frequencies with a downloaded list appear.** RadMachine can show `Annually 0` because it
knows every schedule; this app knows only what was downloaded, so a permanent zero would be
misinformation rather than information.

## Architecture

### Navigation

Three tab destinations: **Dashboard** (home), **Downloaded**, **Browse**. Connection and Queue
are reachable from the Dashboard. The worksheet remains a stacked screen.

This also resolves a real defect: v1.1's catalogue put three lists in one column, and a section
added at the top computed the one below it to near-zero height. Giving each job a whole screen
removes the class of bug, not just the instance.

### The schedule store, refreshed separately from definitions

A definition (which tests, in what order) changes perhaps yearly. A due date changes daily.
Storing them together means re-downloading every test to refresh a date.

```
schedule(utc_url PK, unit_url, unit_name, site_url, site_name,
         frequency_url, frequency_name, due_date, refreshed_at)
```

`refreshSchedule()` makes **one pass** — collections, units, sites and frequencies, paginated
at `limit=200` — keeps only `utc_url`s present in `collection`, and rewrites the table. It
records a single `refreshed_at`, which is what the staleness line reports.

It runs **attached to the existing outbox drain**: on connectivity regained and on app
foreground. Leaving the bunker sends the work and refreshes the schedule in the same moment,
with no user interaction.

Rewrite, not merge: simpler, and no half-updated state. The cost is that a collection removed
server-side vanishes from the dashboard silently — accepted for v2.0, noted below.

### Due state is a pure function

```ts
dueState(dueDate: string | null, now: Date): 'overdue' | 'due' | 'ok' | 'unscheduled'
```

`overdue` before the start of today, `due` today or already past within it, `unscheduled` for a
null date. Every dashboard number is a count over this function, so the whole rule is tested
without a device and the screens only paint.

### The dashboard

Site filter (with "All sites"). One card per unit holding at least one downloaded collection:

```
TrueBeam1 Demo
8 due or overdue                       synced 3 days ago

Daily      4  (2 overdue)   ->  opens Downloaded, filtered to this unit + Daily
Monthly    4
```

Lists with a session in the outbox carry their own marker.

### Downloaded

The single list of downloaded collections, with unit and frequency dropdowns. Each row shows
name, unit, frequency, due date and local state (draft open, session queued). Accepts preset
filters from the dashboard. Start or resume a session from here.

## Testing

Pure and device-free: `dueState`; grouping collections by unit and by frequency; counting due
and overdue; applying the site/unit/frequency filters. The SQLite store and the refresh path
stay thin and are verified on the phone, consistent with v1.

Acceptance on device: after a refresh, a unit's card counts match what RadMachine's own card
shows **for the downloaded lists only**; tapping a frequency lands on the library already
filtered; and with the phone offline the card still renders, with an honest staleness line.

## Known limitations accepted for v2.0

- A collection removed server-side disappears from the dashboard without notice.
- The counts cover downloaded lists only, so they will not match RadMachine's own totals. This
  is intended — it is what the user asked for — but it means the card answers "what do I owe on
  the lists I carry", not "what does this unit owe".
- Timestamps remain naive; the site timezone is recorded here for a later fix.

# RadMachine Mobile v2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the app into three destinations and add a dashboard that answers "what do I owe today, and on which unit?" from data the phone holds offline.

**Architecture:** Scheduling metadata lives in its own `schedule` table, refreshed in one API pass attached to the existing outbox drain — separately from test definitions, which change yearly rather than daily. Every dashboard number is a count over one pure `dueState` function, so the rules are tested without a device and the screens only paint. The dashboard renders no list of its own: tapping a frequency opens the shared library pre-filtered.

**Tech Stack:** Expo SDK 54, expo-router 6.0.24 (tabs via the already-installed `@react-navigation/bottom-tabs` 7.18.16), expo-sqlite, TypeScript, jest.

**Spec:** `../specs/2026-08-17-radmachine-mobile-v2-0-design.md`

**Project:** `C:\Users\eduar\Claude Code\radmachine-mobile`. Entry state: **125 tests passing, `npx tsc --noEmit` clean.** Both must hold after every task.

---

## Reference constants

```
Base URL   https://radmachine.radformation.com/emelchor/api
Auth       header  RadAuthorization: Token <token>
```

A UTC payload carries everything the dashboard needs:

```json
{ "url": ".../qa/unittestcollections/105/",
  "due_date": "2026-08-18T08:57:00+02:00",
  "frequency": ".../qa/frequencies/1/",
  "unit": ".../units/units/9/",
  "object_id": 571,
  "content_type": ".../contenttypes/contenttypes/2/" }
```

A unit carries `site`; a site carries `name` and `time_zone`. `due_date` is `null` on ad-hoc collections. `limit=200` is honoured; `qa/unittestcollections` otherwise pages at **10**.

Existing modules this plan builds on:

- `src/api/client.ts` — `RadClient` with `get<T>`, `getAll<T>`, `post`
- `src/api/catalogue.ts` — existing pure shaping for Browse (leave alone)
- `src/db/collections.ts` — `listCollections()`, `type Collection = { utcUrl, utcName, unitName, listUrl, downloadedAt }`
- `src/db/sessions.ts` — `listDrafts()`, `createSession(id, utcUrl, userKey, workStarted)`
- `src/db/outbox.ts` — `allRows()`, `type OutboxRow`
- `src/db/schema.ts` — `getDb()`, memoized promise
- `src/sync/drain.ts` — `drainOutbox(): Promise<DrainSummary>`
- `src/ui/Dropdown.tsx` — `Dropdown`, `type Option`
- `src/secure/credentials.ts` — `loadCredentials()`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/schedule/due.ts` | **Pure.** One function: is this collection overdue, due, ok, or unscheduled |
| `src/schedule/summary.ts` | **Pure.** Group schedule rows into unit cards and frequency rows; apply site/unit/frequency filters |
| `src/db/schedule.ts` | The `schedule` table: rewrite it, read it, report when it was last refreshed |
| `src/sync/refresh.ts` | One API pass that fills `schedule` for downloaded collections |
| `src/db/schema.ts` | *modify* — add the `schedule` table |
| `app/_layout.tsx` | *modify* — root Stack; drain and refresh triggers |
| `app/(tabs)/_layout.tsx` | The three-tab bar |
| `app/(tabs)/index.tsx` | Dashboard |
| `app/(tabs)/downloaded.tsx` | The library, with unit and frequency filters |
| `app/(tabs)/browse.tsx` | Browse — the current catalogue's remote half, moved |

The two pure modules hold every rule. The screens compute nothing.

---

## Task 18: `dueState` — the one rule everything counts

**Files:**
- Create: `src/schedule/due.ts`
- Test: `__tests__/due.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/due.test.ts`:

```ts
import { dueState } from '../src/schedule/due';

// A fixed "now": 2026-08-17 14:30 local.
const now = new Date(2026, 7, 17, 14, 30, 0);

test('a date before today is overdue', () => {
  expect(dueState('2026-08-16T23:59:00+02:00', now)).toBe('overdue');
});

test('a date earlier today is due, not overdue', () => {
  expect(dueState('2026-08-17T08:00:00+02:00', now)).toBe('due');
});

test('a date later today is due', () => {
  expect(dueState('2026-08-17T23:00:00+02:00', now)).toBe('due');
});

test('midnight this morning is due, not overdue', () => {
  expect(dueState('2026-08-17T00:00:00+02:00', now)).toBe('due');
});

test('tomorrow is not due yet', () => {
  expect(dueState('2026-08-18T08:57:00+02:00', now)).toBe('ok');
});

test('a collection with no due date is unscheduled, not overdue', () => {
  // Ad-hoc collections have due_date null. Counting them as overdue would
  // put permanent red numbers on the dashboard for work nobody scheduled.
  expect(dueState(null, now)).toBe('unscheduled');
});

test('an unparseable date is unscheduled rather than silently overdue', () => {
  expect(dueState('not a date', now)).toBe('unscheduled');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- due`
Expected: FAIL — `Cannot find module '../src/schedule/due'`.

- [ ] **Step 3: Implement**

Create `src/schedule/due.ts`:

```ts
export type DueState = 'overdue' | 'due' | 'ok' | 'unscheduled';

/**
 * Where does this collection stand, as of `now`?
 *
 * Overdue and due are counted together on the dashboard but shown apart: a
 * daily control three days late and one due this morning are different
 * situations, and a single combined number hides that.
 *
 * A missing or unparseable date is 'unscheduled', never 'overdue' -- ad-hoc
 * collections have no due date, and painting them red would be noise the user
 * cannot act on.
 */
export function dueState(dueDate: string | null, now: Date): DueState {
  if (!dueDate) return 'unscheduled';
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return 'unscheduled';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  if (d < startOfToday) return 'overdue';
  if (d < startOfTomorrow) return 'due';
  return 'ok';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- due`
Expected: 7 passing.

- [ ] **Step 5: Commit**

```bash
git add src/schedule/due.ts __tests__/due.test.ts
git commit -m "feat: dueState, the one rule every dashboard number counts"
```

---

## Task 19: Shaping the dashboard, as pure functions

**Files:**
- Create: `src/schedule/summary.ts`
- Test: `__tests__/summary.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/summary.test.ts`:

```ts
import {
  ALL,
  NO_FREQUENCY,
  buildUnitCards,
  filterSchedule,
  type ScheduleRow,
} from '../src/schedule/summary';

const now = new Date(2026, 7, 17, 14, 30, 0);

const row = (over: Partial<ScheduleRow>): ScheduleRow => ({
  utcUrl: 'u1',
  unitUrl: 'unit/9',
  unitName: 'TrueBeam1 Demo',
  siteUrl: 'site/2',
  siteName: 'A_External RT',
  frequencyUrl: 'freq/1',
  frequencyName: 'Daily',
  dueDate: '2026-08-16T08:00:00+02:00', // overdue
  ...over,
});

test('one card per unit that has rows', () => {
  const cards = buildUnitCards(
    [row({ utcUrl: 'a' }), row({ utcUrl: 'b', unitUrl: 'unit/10', unitName: 'Halcyon' })],
    now,
    ALL
  );
  expect(cards.map((c) => c.unitName)).toEqual(['Halcyon', 'TrueBeam1 Demo']);
});

test('a frequency row counts due and overdue together, and overdue apart', () => {
  const cards = buildUnitCards(
    [
      row({ utcUrl: 'a', dueDate: '2026-08-16T08:00:00+02:00' }), // overdue
      row({ utcUrl: 'b', dueDate: '2026-08-17T08:00:00+02:00' }), // due today
      row({ utcUrl: 'c', dueDate: '2026-08-20T08:00:00+02:00' }), // not yet
    ],
    now,
    ALL
  );
  expect(cards[0].rows).toEqual([{ frequencyName: 'Daily', total: 2, overdue: 1 }]);
});

test('the card total is the sum of its frequency rows', () => {
  const cards = buildUnitCards(
    [
      row({ utcUrl: 'a' }),
      row({ utcUrl: 'b', frequencyUrl: 'freq/3', frequencyName: 'Monthly' }),
    ],
    now,
    ALL
  );
  expect(cards[0].dueTotal).toBe(2);
  expect(cards[0].overdueTotal).toBe(2);
});

test('a frequency with nothing due still appears, showing zero', () => {
  // The user downloaded a Monthly list; it is simply not due yet. Hiding the
  // row would make the downloaded list invisible on the dashboard.
  const cards = buildUnitCards([row({ dueDate: '2026-09-01T08:00:00+02:00' })], now, ALL);
  expect(cards[0].rows).toEqual([{ frequencyName: 'Daily', total: 0, overdue: 0 }]);
});

test('a frequency the user downloaded nothing for does not appear at all', () => {
  const cards = buildUnitCards([row({ frequencyName: 'Daily' })], now, ALL);
  expect(cards[0].rows.map((r) => r.frequencyName)).toEqual(['Daily']);
});

test('ad-hoc collections group under their own row and never count as due', () => {
  const cards = buildUnitCards(
    [row({ frequencyUrl: null, frequencyName: null, dueDate: null })],
    now,
    ALL
  );
  expect(cards[0].rows).toEqual([{ frequencyName: 'Ad hoc', total: 0, overdue: 0 }]);
  expect(cards[0].dueTotal).toBe(0);
});

test('the site filter keeps only that site', () => {
  const cards = buildUnitCards(
    [
      row({ utcUrl: 'a' }),
      row({ utcUrl: 'b', unitUrl: 'unit/77', unitName: 'Unity', siteUrl: 'site/4', siteName: 'Brachy' }),
    ],
    now,
    'site/4'
  );
  expect(cards.map((c) => c.unitName)).toEqual(['Unity']);
});

test('filterSchedule with ALL returns everything', () => {
  const rows = [row({ utcUrl: 'a' }), row({ utcUrl: 'b', unitUrl: 'unit/10' })];
  expect(filterSchedule(rows, ALL, ALL)).toHaveLength(2);
});

test('filterSchedule narrows by unit and by frequency together', () => {
  const rows = [
    row({ utcUrl: 'a' }),
    row({ utcUrl: 'b', frequencyName: 'Monthly', frequencyUrl: 'freq/3' }),
    row({ utcUrl: 'c', unitUrl: 'unit/10' }),
  ];
  expect(filterSchedule(rows, 'unit/9', 'Daily').map((r) => r.utcUrl)).toEqual(['a']);
});

test('the ad-hoc bucket is reachable through the frequency filter', () => {
  const rows = [row({ utcUrl: 'a' }), row({ utcUrl: 'b', frequencyName: null, frequencyUrl: null })];
  expect(filterSchedule(rows, ALL, NO_FREQUENCY).map((r) => r.utcUrl)).toEqual(['b']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- summary`
Expected: FAIL — `Cannot find module '../src/schedule/summary'`.

- [ ] **Step 3: Implement**

Create `src/schedule/summary.ts`:

```ts
import { dueState } from './due';

/** One downloaded collection's scheduling metadata, as stored locally. */
export type ScheduleRow = {
  utcUrl: string;
  unitUrl: string;
  unitName: string;
  siteUrl: string | null;
  siteName: string | null;
  frequencyUrl: string | null;
  frequencyName: string | null; // null = ad hoc
  dueDate: string | null;
};

export type FrequencyRow = { frequencyName: string; total: number; overdue: number };

export type UnitCard = {
  unitUrl: string;
  unitName: string;
  siteName: string | null;
  dueTotal: number;
  overdueTotal: number;
  rows: FrequencyRow[];
};

/** Sentinel for "no filter applied". */
export const ALL = '__all__';
/** Sentinel for the ad-hoc bucket -- collections with no frequency. */
export const NO_FREQUENCY = '__none__';

const AD_HOC = 'Ad hoc';

const label = (r: ScheduleRow) => r.frequencyName ?? AD_HOC;

/**
 * Group downloaded collections into one card per unit.
 *
 * Only frequencies the user actually downloaded something for get a row:
 * RadMachine can show "Annually 0" because it knows every schedule, but this
 * app knows only what was downloaded, so a permanent zero would be
 * misinformation rather than information.
 */
export function buildUnitCards(rows: ScheduleRow[], now: Date, siteUrl: string): UnitCard[] {
  const kept = siteUrl === ALL ? rows : rows.filter((r) => r.siteUrl === siteUrl);

  const byUnit = new Map<string, ScheduleRow[]>();
  for (const r of kept) {
    const list = byUnit.get(r.unitUrl);
    if (list) list.push(r);
    else byUnit.set(r.unitUrl, [r]);
  }

  const cards: UnitCard[] = [];
  for (const [unitUrl, unitRows] of byUnit) {
    const byFreq = new Map<string, ScheduleRow[]>();
    for (const r of unitRows) {
      const k = label(r);
      const list = byFreq.get(k);
      if (list) list.push(r);
      else byFreq.set(k, [r]);
    }

    const freqRows: FrequencyRow[] = [];
    for (const [frequencyName, group] of byFreq) {
      let total = 0;
      let overdue = 0;
      for (const r of group) {
        const s = dueState(r.dueDate, now);
        if (s === 'overdue') {
          overdue += 1;
          total += 1;
        } else if (s === 'due') {
          total += 1;
        }
      }
      freqRows.push({ frequencyName, total, overdue });
    }
    freqRows.sort((a, b) => a.frequencyName.localeCompare(b.frequencyName));

    cards.push({
      unitUrl,
      unitName: unitRows[0].unitName,
      siteName: unitRows[0].siteName,
      dueTotal: freqRows.reduce((n, r) => n + r.total, 0),
      overdueTotal: freqRows.reduce((n, r) => n + r.overdue, 0),
      rows: freqRows,
    });
  }

  cards.sort((a, b) => a.unitName.localeCompare(b.unitName));
  return cards;
}

/** The library's filters. Both accept ALL; frequency also accepts NO_FREQUENCY. */
export function filterSchedule(
  rows: ScheduleRow[],
  unitUrl: string,
  frequencyName: string
): ScheduleRow[] {
  return rows.filter((r) => {
    if (unitUrl !== ALL && r.unitUrl !== unitUrl) return false;
    if (frequencyName === ALL) return true;
    if (frequencyName === NO_FREQUENCY) return r.frequencyName === null;
    return r.frequencyName === frequencyName;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- summary`
Expected: 10 passing.

- [ ] **Step 5: Commit**

```bash
git add src/schedule/summary.ts __tests__/summary.test.ts
git commit -m "feat: shape downloaded collections into unit cards, purely"
```

---

## Task 20: The schedule table

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/schedule.ts`

- [ ] **Step 1: Add the table to the schema**

In `src/db/schema.ts`, inside the existing `db.execAsync(...)` template literal, after the `outbox` table, add:

```sql
    CREATE TABLE IF NOT EXISTS schedule (
      utc_url        TEXT PRIMARY KEY,
      unit_url       TEXT NOT NULL,
      unit_name      TEXT NOT NULL,
      site_url       TEXT,
      site_name      TEXT,
      frequency_url  TEXT,
      frequency_name TEXT,
      due_date       TEXT,
      refreshed_at   TEXT NOT NULL
    );
```

Change nothing else in that file.

- [ ] **Step 2: Write the store**

Create `src/db/schedule.ts`:

```ts
import type { ScheduleRow } from '../schedule/summary';
import { getDb } from './schema';

/**
 * Replace the whole schedule table.
 *
 * Rewrite rather than merge: scheduling is a snapshot of one moment, and a
 * half-updated table would mix two. Every row carries the same refreshed_at,
 * which is what the dashboard's staleness line reports.
 */
export async function saveSchedule(rows: ScheduleRow[], refreshedAt: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM schedule`);
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO schedule (utc_url, unit_url, unit_name, site_url, site_name,
                               frequency_url, frequency_name, due_date, refreshed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.utcUrl, r.unitUrl, r.unitName, r.siteUrl, r.siteName,
          r.frequencyUrl, r.frequencyName, r.dueDate, refreshedAt,
        ]
      );
    }
  });
}

export async function listSchedule(): Promise<ScheduleRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(`SELECT * FROM schedule`);
  return rows.map((r) => ({
    utcUrl: r.utc_url,
    unitUrl: r.unit_url,
    unitName: r.unit_name,
    siteUrl: r.site_url,
    siteName: r.site_name,
    frequencyUrl: r.frequency_url,
    frequencyName: r.frequency_name,
    dueDate: r.due_date,
  }));
}

/** When the schedule was last refreshed, or null if it never has been. */
export async function lastRefreshedAt(): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<any>(`SELECT refreshed_at FROM schedule LIMIT 1`);
  return r?.refreshed_at ?? null;
}
```

- [ ] **Step 3: Check it compiles and nothing regressed**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: 142 passing (125 entry + 7 from Task 18 + 10 from Task 19).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/schedule.ts
git commit -m "feat: a schedule table, refreshed independently of definitions"
```

---

## Task 21: One API pass that fills the schedule

**Files:**
- Create: `src/sync/refresh.ts`
- Test: `__tests__/refresh.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/refresh.test.ts`:

```ts
import { buildScheduleRows } from '../src/sync/refresh';

const utcs = [
  {
    url: 'utc/105',
    unit: 'unit/9',
    frequency: 'freq/1',
    due_date: '2026-08-18T08:57:00+02:00',
  },
  { url: 'utc/999', unit: 'unit/9', frequency: 'freq/3', due_date: null },
  { url: 'utc/111', unit: 'unit/77', frequency: null, due_date: null },
];
const units = [
  { url: 'unit/9', name: 'TrueBeam1 Demo', site: 'site/2' },
  { url: 'unit/77', name: 'Unity', site: null },
];
const sites = [{ url: 'site/2', name: 'A_External RT' }];
const freqs = [
  { url: 'freq/1', name: 'Daily' },
  { url: 'freq/3', name: 'Monthly' },
];

test('only downloaded collections are kept', () => {
  const rows = buildScheduleRows(utcs, units, sites, freqs, new Set(['utc/105']));
  expect(rows.map((r) => r.utcUrl)).toEqual(['utc/105']);
});

test('unit, site and frequency names are resolved', () => {
  const rows = buildScheduleRows(utcs, units, sites, freqs, new Set(['utc/105']));
  expect(rows[0]).toMatchObject({
    unitName: 'TrueBeam1 Demo',
    siteName: 'A_External RT',
    frequencyName: 'Daily',
    dueDate: '2026-08-18T08:57:00+02:00',
  });
});

test('a collection with no frequency keeps a null frequency name', () => {
  const rows = buildScheduleRows(utcs, units, sites, freqs, new Set(['utc/111']));
  expect(rows[0].frequencyName).toBeNull();
});

test('a unit with no site is kept, with a null site', () => {
  const rows = buildScheduleRows(utcs, units, sites, freqs, new Set(['utc/111']));
  expect(rows[0]).toMatchObject({ unitName: 'Unity', siteUrl: null, siteName: null });
});

test('a collection whose unit cannot be resolved is dropped, not guessed', () => {
  // A card attributing a list to the wrong machine is worse than a missing row.
  const orphan = [{ url: 'utc/1', unit: 'unit/nope', frequency: 'freq/1', due_date: null }];
  expect(buildScheduleRows(orphan, units, sites, freqs, new Set(['utc/1']))).toEqual([]);
});

test('downloading nothing yields no rows', () => {
  expect(buildScheduleRows(utcs, units, sites, freqs, new Set())).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- refresh`
Expected: FAIL — `Cannot find module '../src/sync/refresh'`.

- [ ] **Step 3: Implement**

Create `src/sync/refresh.ts`:

```ts
import { RadClient } from '../api/client';
import { listCollections } from '../db/collections';
import { saveSchedule } from '../db/schedule';
import { loadCredentials } from '../secure/credentials';
import type { ScheduleRow } from '../schedule/summary';

type Named = { url: string; name: string; site?: string | null };

/**
 * Turn one API pass into schedule rows for the collections we hold.
 *
 * Pure, so the resolution rules are testable: a collection whose unit cannot
 * be resolved is dropped rather than guessed at -- a card attributing a list
 * to the wrong machine is worse than a missing row.
 */
export function buildScheduleRows(
  utcs: any[],
  units: Named[],
  sites: Named[],
  frequencies: Named[],
  downloaded: Set<string>
): ScheduleRow[] {
  const unitBy = new Map(units.map((u) => [u.url, u]));
  const siteBy = new Map(sites.map((s) => [s.url, s]));
  const freqBy = new Map(frequencies.map((f) => [f.url, f]));

  const out: ScheduleRow[] = [];
  for (const utc of utcs) {
    if (!downloaded.has(utc.url)) continue;
    const unit = unitBy.get(utc.unit);
    if (!unit) continue;
    const site = unit.site ? siteBy.get(unit.site) : undefined;
    const freq = utc.frequency ? freqBy.get(utc.frequency) : undefined;
    out.push({
      utcUrl: utc.url,
      unitUrl: unit.url,
      unitName: unit.name,
      siteUrl: site?.url ?? null,
      siteName: site?.name ?? null,
      frequencyUrl: freq?.url ?? null,
      frequencyName: freq?.name ?? null,
      dueDate: utc.due_date ?? null,
    });
  }
  return out;
}

/**
 * Refresh the schedule for every downloaded collection, in one pass.
 *
 * A definition changes perhaps yearly; a due date changes daily. Keeping them
 * apart means refreshing dates costs one paginated request rather than a full
 * re-download of every test in every list.
 *
 * Returns how many rows were stored, or null if there is nothing to do.
 */
export async function refreshSchedule(nowIso: string): Promise<number | null> {
  const creds = await loadCredentials();
  if (!creds) return null;

  const collections = await listCollections();
  if (collections.length === 0) return null;
  const downloaded = new Set(collections.map((c) => c.utcUrl));

  const client = new RadClient(creds.baseUrl, creds.token);
  const [utcs, units, sites, frequencies] = await Promise.all([
    client.getAll<any>('/qa/unittestcollections/', { limit: '200' }),
    client.getAll<Named>('/units/units/', { limit: '200' }),
    client.getAll<Named>('/units/sites/', { limit: '200' }),
    client.getAll<Named>('/qa/frequencies/', { limit: '200' }),
  ]);

  const rows = buildScheduleRows(utcs, units, sites, frequencies, downloaded);
  await saveSchedule(rows, nowIso);
  return rows.length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- refresh`
Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/sync/refresh.ts __tests__/refresh.test.ts
git commit -m "feat: refresh the schedule in one API pass"
```

---

## Task 22: Three tabs

**Files:**
- Modify: `app/_layout.tsx`
- Create: `app/(tabs)/_layout.tsx`
- Move: `app/index.tsx` → `app/(tabs)/browse.tsx` (renamed; content unchanged in this task)
- Create: `app/(tabs)/index.tsx` (placeholder Dashboard, filled in Task 23)
- Create: `app/(tabs)/downloaded.tsx` (placeholder, filled in Task 24)

- [ ] **Step 1: Move the current catalogue to the Browse tab**

```bash
git mv app/index.tsx "app/(tabs)/browse.tsx"
```

Then fix its relative imports: every `../src/...` becomes `../../src/...`. Change nothing else about it in this task.

- [ ] **Step 2: Write the tab layout**

Create `app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="downloaded" options={{ title: 'Downloaded' }} />
      <Tabs.Screen name="browse" options={{ title: 'Browse' }} />
    </Tabs>
  );
}
```

- [ ] **Step 3: Add the two placeholder screens**

Create `app/(tabs)/index.tsx`:

```tsx
import { Text, View } from 'react-native';

export default function Dashboard() {
  return (
    <View style={{ padding: 16 }}>
      <Text>Dashboard</Text>
    </View>
  );
}
```

Create `app/(tabs)/downloaded.tsx`:

```tsx
import { Text, View } from 'react-native';

export default function Downloaded() {
  return (
    <View style={{ padding: 16 }}>
      <Text>Downloaded</Text>
    </View>
  );
}
```

- [ ] **Step 4: Point the root layout at the tab group, and refresh alongside the drain**

Replace `app/_layout.tsx` with:

```tsx
import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Stack } from 'expo-router';
import { drainOutbox } from '../src/sync/drain';
import { refreshSchedule } from '../src/sync/refresh';

/**
 * Leaving the bunker should both send the work and refresh what is due, in the
 * same moment and without being asked. Failures are swallowed on purpose:
 * these run in the background and the screens report their own state.
 */
function syncAll() {
  drainOutbox().catch(() => {});
  refreshSchedule(new Date().toISOString()).catch(() => {});
}

export default function Layout() {
  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) syncAll();
    });
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') syncAll();
    });
    return () => {
      unsubNet();
      sub.remove();
    };
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="connect" options={{ title: 'Connection' }} />
      <Stack.Screen name="queue" options={{ title: 'Send queue' }} />
      <Stack.Screen name="worksheet/[sessionId]" options={{ title: 'Worksheet' }} />
    </Stack>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: 148 passing.

- [ ] **Step 6: Commit**

```bash
git add app
git commit -m "feat: three tabs -- dashboard, downloaded, browse"
```

---

## Task 23: The dashboard

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Build the screen**

Replace `app/(tabs)/index.tsx` with:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Dropdown, type Option } from '../../src/ui/Dropdown';
import { lastRefreshedAt, listSchedule } from '../../src/db/schedule';
import { allRows } from '../../src/db/outbox';
import { ALL, buildUnitCards, type ScheduleRow } from '../../src/schedule/summary';

/** "synced 3 days ago" -- the dashboard never hides how old its numbers are. */
function staleness(iso: string | null, now: Date): string {
  if (!iso) return 'never synced';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'never synced';
  const mins = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (mins < 1) return 'synced just now';
  if (mins < 60) return `synced ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `synced ${hours} h ago`;
  return `synced ${Math.floor(hours / 24)} days ago`;
}

export default function Dashboard() {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [refreshed, setRefreshed] = useState<string | null>(null);
  const [unsent, setUnsent] = useState(0);
  const [site, setSite] = useState<string>(ALL);
  const [msg, setMsg] = useState('');

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          setRows(await listSchedule());
          setRefreshed(await lastRefreshedAt());
          const out = await allRows();
          setUnsent(out.filter((r) => r.status !== 'sent').length);
        } catch (e: any) {
          setMsg(`Could not read the dashboard: ${e?.message ?? e}`);
        }
      })();
    }, [])
  );

  const now = new Date();
  const cards = useMemo(() => buildUnitCards(rows, now, site), [rows, site]);

  const siteOptions: Option[] = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.siteUrl) seen.set(r.siteUrl, r.siteName ?? r.siteUrl);
    return [
      { value: ALL, label: 'All sites' },
      ...[...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
    ];
  }, [rows]);

  const open = (unitUrl: string, frequencyName: string) =>
    router.push({ pathname: '/downloaded', params: { unitUrl, frequencyName } });

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Dropdown label="Site" options={siteOptions} value={site} onSelect={setSite} />
      {msg ? <Text style={{ color: '#b00020' }}>{msg}</Text> : null}

      {unsent > 0 ? (
        <Pressable onPress={() => router.push('/queue')}>
          <Text style={{ color: '#8a6d00' }}>
            {unsent} session{unsent === 1 ? '' : 's'} waiting to send — tap to open the queue
          </Text>
        </Pressable>
      ) : null}

      {cards.length === 0 ? (
        <Text>
          Nothing downloaded yet. Use Browse to download a list, then it appears here.
        </Text>
      ) : null}

      {cards.map((c) => (
        <View
          key={c.unitUrl}
          style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, gap: 6 }}
        >
          <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{c.unitName}</Text>
          <Text style={{ color: c.overdueTotal > 0 ? '#b00020' : '#555' }}>
            {c.dueTotal} due or overdue
          </Text>
          <Text style={{ color: '#888', fontSize: 12 }}>{staleness(refreshed, now)}</Text>

          {c.rows.map((r) => (
            <Pressable
              key={r.frequencyName}
              onPress={() => open(c.unitUrl, r.frequencyName)}
              style={{ paddingVertical: 6, flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text>{r.frequencyName}</Text>
              <Text style={{ color: r.overdue > 0 ? '#b00020' : '#333' }}>
                {r.total}
                {r.overdue > 0 ? ` (${r.overdue} overdue)` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. `Dropdown`'s interface is confirmed as
`{ label: string; options: Option[]; value: string; onSelect: (value: string) => void }`
with `type Option = { value: string; label: string }`.

Run: `npm test`
Expected: 148 passing.

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "feat: a dashboard of what each unit owes, from downloaded lists"
```

---

## Task 24: The library

**Files:**
- Modify: `src/db/sessions.ts`
- Modify: `app/(tabs)/downloaded.tsx`

- [ ] **Step 1: Expose which lists have a session still waiting to send**

The spec requires lists with an unsent session to carry their own marker, *beside* the count
rather than subtracted from it — the count says what RadMachine believes you owe, the marker
says what you have already done but not yet delivered.

Add to `src/db/sessions.ts`:

```ts
/**
 * Which downloaded lists have a session that has not reached the server yet,
 * keyed by collection url.
 *
 * Shown beside a list, never subtracted from a due count: the count reflects
 * what the server knows, and a phone-side adjustment would make it correspond
 * to nothing auditable.
 */
export async function listUnsentByUtc(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT s.utc_url, o.status
       FROM outbox o
       JOIN session s ON s.id = o.session_id
      WHERE o.status != 'sent'`
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.utc_url] = r.status;
  return out;
}
```

- [ ] **Step 2: Build the screen**

Replace `app/(tabs)/downloaded.tsx` with:

```tsx
import { useCallback, useMemo, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { Dropdown, type Option } from '../../src/ui/Dropdown';
import { listSchedule } from '../../src/db/schedule';
import { listCollections } from '../../src/db/collections';
import { createSession, listDrafts, listUnsentByUtc } from '../../src/db/sessions';
import { nowStamp } from '../../src/sync/time';
import { dueState } from '../../src/schedule/due';
import { ALL, NO_FREQUENCY, filterSchedule, type ScheduleRow } from '../../src/schedule/summary';

export default function Downloaded() {
  const params = useLocalSearchParams<{ unitUrl?: string; frequencyName?: string }>();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [unsent, setUnsent] = useState<Record<string, string>>({});
  const [unit, setUnit] = useState<string>(ALL);
  const [freq, setFreq] = useState<string>(ALL);
  const [msg, setMsg] = useState('');

  // The dashboard opens this screen with a filter already chosen.
  useFocusEffect(
    useCallback(() => {
      if (params.unitUrl) setUnit(params.unitUrl);
      if (params.frequencyName) setFreq(params.frequencyName);
      (async () => {
        try {
          setRows(await listSchedule());
          const cols = await listCollections();
          setNames(Object.fromEntries(cols.map((c) => [c.utcUrl, c.utcName])));
          const ds = await listDrafts();
          setDrafts(Object.fromEntries(ds.map((d) => [d.utcUrl, d.id])));
          setUnsent(await listUnsentByUtc());
        } catch (e: any) {
          setMsg(`Could not read the library: ${e?.message ?? e}`);
        }
      })();
    }, [params.unitUrl, params.frequencyName])
  );

  const unitOptions: Option[] = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) seen.set(r.unitUrl, r.unitName);
    return [
      { value: ALL, label: 'All units' },
      ...[...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label })),
    ];
  }, [rows]);

  const freqOptions: Option[] = useMemo(() => {
    const seen = new Set<string>();
    let adHoc = false;
    for (const r of rows) {
      if (r.frequencyName) seen.add(r.frequencyName);
      else adHoc = true;
    }
    return [
      { value: ALL, label: 'All frequencies' },
      ...(adHoc ? [{ value: NO_FREQUENCY, label: 'Ad hoc' }] : []),
      ...[...seen].sort().map((f) => ({ value: f, label: f })),
    ];
  }, [rows]);

  const now = new Date();
  const shown = useMemo(() => filterSchedule(rows, unit, freq), [rows, unit, freq]);

  const start = async (utcUrl: string) => {
    const existing = drafts[utcUrl];
    if (existing) return router.push(`/worksheet/${existing}`);
    const id = Crypto.randomUUID();
    await createSession(id, utcUrl, Crypto.randomUUID(), nowStamp());
    router.push(`/worksheet/${id}`);
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Dropdown label="Unit" options={unitOptions} value={unit} onSelect={setUnit} />
        </View>
        <View style={{ flex: 1 }}>
          <Dropdown label="Frequency" options={freqOptions} value={freq} onSelect={setFreq} />
        </View>
      </View>

      <Text style={{ color: '#555' }}>
        {shown.length} of {rows.length} downloaded
      </Text>
      {msg ? <Text style={{ color: '#b00020' }}>{msg}</Text> : null}

      <FlatList
        style={{ flex: 1 }}
        data={shown}
        keyExtractor={(r) => r.utcUrl}
        ListEmptyComponent={<Text>No downloaded list matches these filters.</Text>}
        renderItem={({ item }) => {
          const state = dueState(item.dueDate, now);
          const draftId = drafts[item.utcUrl];
          return (
            <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee', gap: 2 }}>
              <Text style={{ fontWeight: 'bold' }}>{names[item.utcUrl] ?? item.utcUrl}</Text>
              <Text style={{ color: '#555' }}>
                {item.unitName} · {item.frequencyName ?? 'Ad hoc'}
              </Text>
              <Text style={{ color: state === 'overdue' ? '#b00020' : '#555' }}>
                {state === 'unscheduled'
                  ? 'no due date'
                  : `due ${new Date(item.dueDate as string).toLocaleDateString()}${
                      state === 'overdue' ? ' — overdue' : state === 'due' ? ' — today' : ''
                    }`}
              </Text>
              {draftId ? <Text style={{ color: '#8a6d00' }}>unfinished session</Text> : null}
              {unsent[item.utcUrl] ? (
                <Text style={{ color: '#8a6d00' }}>
                  done, waiting to send ({unsent[item.utcUrl]})
                </Text>
              ) : null}
              <Button
                title={draftId ? 'Resume session' : 'Start session'}
                onPress={() => start(item.utcUrl)}
              />
            </View>
          );
        }}
      />
    </View>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. `listDrafts()` is confirmed to return
`DraftSummary[] = { id, utcUrl, utcName, unitName, workStarted, outboxStatus }[]`.

Run: `npm test`
Expected: 148 passing.

- [ ] **Step 4: Commit**

```bash
git add src/db/sessions.ts "app/(tabs)/downloaded.tsx"
git commit -m "feat: the downloaded library, filtered by unit and frequency"
```

---

## Task 25: On-device acceptance

Run by the user, not an agent.

- [ ] **Step 1: Start the app**

```bash
cd "C:/Users/eduar/Claude Code/radmachine-mobile"; npx expo start --clear
```

`--clear` matters: earlier in this project a new directory was invisible to the bundler until the cache was reset.

- [ ] **Step 2: Check the tabs**

Three tabs at the bottom. Dashboard opens first.

- [ ] **Step 3: Check a card**

With at least one list downloaded, the unit's card shows a per-frequency count, an overdue count in red where applicable, and a staleness line. Frequencies with nothing downloaded do not appear.

- [ ] **Step 4: Check the link**

Tapping a frequency opens Downloaded with unit and frequency already selected, and the count reads `N of M downloaded`.

- [ ] **Step 5: Check it offline**

Airplane mode, reopen the app: the card still renders, with an older staleness line. Nothing blank, nothing crashing.

- [ ] **Step 6: Check the numbers against RadMachine**

Open the unit in the RadMachine web UI. The app's counts should match **for the downloaded lists only** — they will be lower than the web card's totals, and that is intended.

---

## Done when

`npm test` green, `npx tsc --noEmit` clean, and on the phone: the dashboard renders offline with an honest staleness line, its counts match RadMachine for downloaded lists, and tapping a frequency lands on a pre-filtered library.

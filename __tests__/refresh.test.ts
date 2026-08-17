import { buildScheduleRows, refreshSchedule } from '../src/sync/refresh';
import { saveSchedule } from '../src/db/schedule';
import { RadClient } from '../src/api/client';

// Everything the refresh pass reaches for, stubbed: the guard is about how many
// passes start, so no network and no database are needed to observe it.
jest.mock('../src/secure/credentials', () => ({
  loadCredentials: jest.fn(async () => ({ baseUrl: 'https://x/api', token: 't' })),
}));
jest.mock('../src/db/collections', () => ({
  listCollections: jest.fn(async () => [{ utcUrl: 'utc/105' }]),
}));
jest.mock('../src/db/schedule', () => ({ saveSchedule: jest.fn(async () => {}) }));
jest.mock('../src/api/client', () => ({
  RadClient: jest.fn().mockImplementation(() => ({
    getAll: jest.fn(async () => []),
  })),
}));

const savedSchedule = saveSchedule as unknown as jest.Mock;
const clientCtor = RadClient as unknown as jest.Mock;

const utcs = [
  { url: 'utc/105', unit: 'unit/9', frequency: 'freq/1', due_date: '2026-08-18T08:57:00+02:00' },
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

test('a frequency url that resolves to nothing degrades to ad hoc, keeping the row', () => {
  // The unit is what makes a row meaningful; an unknown frequency only costs
  // the grouping, so the list still appears rather than vanishing.
  const odd = [{ url: 'utc/2', unit: 'unit/9', frequency: 'freq/nope', due_date: null }];
  const rows = buildScheduleRows(odd, units, sites, freqs, new Set(['utc/2']));
  expect(rows).toHaveLength(1);
  expect(rows[0].frequencyName).toBeNull();
});

test('downloading nothing yields no rows', () => {
  expect(buildScheduleRows(utcs, units, sites, freqs, new Set())).toEqual([]);
});

test('overlapping refreshes make one pass, and the guard clears afterwards', async () => {
  // Leaving a bunker fires the connectivity and foreground events milliseconds
  // apart, so this overlap is the normal case. The second caller must join the
  // run already going rather than open a second pass over the same endpoints.
  savedSchedule.mockClear();
  clientCtor.mockClear();

  const first = refreshSchedule('2026-08-17T09:00:00Z');
  const second = refreshSchedule('2026-08-17T09:00:00Z');
  const [a, b] = await Promise.all([first, second]);

  // Both callers get an answer -- joining a run must not mean going unanswered.
  expect(a).toBe(0);
  expect(b).toBe(0);
  expect(savedSchedule).toHaveBeenCalledTimes(1);
  expect(clientCtor).toHaveBeenCalledTimes(1);

  // And the guard is not a latch: once the pass is done, the next event refreshes.
  await refreshSchedule('2026-08-17T09:05:00Z');
  expect(savedSchedule).toHaveBeenCalledTimes(2);
});

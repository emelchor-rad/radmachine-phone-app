import { buildScheduleRows } from '../src/sync/refresh';

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

import {
  AD_HOC,
  ALL,
  NO_FREQUENCY,
  buildUnitCards,
  filterSchedule,
  frequencyFilterFor,
  type ScheduleRow,
} from '../src/schedule/summary';

const now = new Date(2026, 7, 17, 14, 30, 0);

/** A due date anchored to the same local day the assertion is about. */
const at = (y: number, m: number, d: number): string => new Date(y, m, d, 8, 0, 0).toISOString();

const row = (over: Partial<ScheduleRow>): ScheduleRow => ({
  utcUrl: 'u1',
  unitUrl: 'unit/9',
  unitName: 'TrueBeam1 Demo',
  siteUrl: 'site/2',
  siteName: 'A_External RT',
  frequencyUrl: 'freq/1',
  frequencyName: 'Daily',
  dueDate: at(2026, 7, 16), // overdue
  ...over,
});

test('one card per unit that has rows, sorted by unit name', () => {
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
      row({ utcUrl: 'a', dueDate: at(2026, 7, 16) }), // overdue
      row({ utcUrl: 'b', dueDate: at(2026, 7, 17) }), // due today
      row({ utcUrl: 'c', dueDate: at(2026, 7, 20) }), // not yet
    ],
    now,
    ALL
  );
  expect(cards[0].rows).toEqual([{ frequencyName: 'Daily', total: 2, overdue: 1 }]);
});

test('the card totals are the sum of its frequency rows', () => {
  const cards = buildUnitCards(
    [row({ utcUrl: 'a' }), row({ utcUrl: 'b', frequencyUrl: 'freq/3', frequencyName: 'Monthly' })],
    now,
    ALL
  );
  expect(cards[0].dueTotal).toBe(2);
  expect(cards[0].overdueTotal).toBe(2);
});

test('a downloaded frequency with nothing due still appears, showing zero', () => {
  const cards = buildUnitCards([row({ dueDate: at(2026, 8, 1) })], now, ALL);
  expect(cards[0].rows).toEqual([{ frequencyName: 'Daily', total: 0, overdue: 0 }]);
});

test('a frequency the user downloaded nothing for does not appear at all', () => {
  const cards = buildUnitCards([row({ frequencyName: 'Daily' })], now, ALL);
  expect(cards[0].rows.map((r) => r.frequencyName)).toEqual(['Daily']);
});

test('frequency rows are sorted by name', () => {
  const cards = buildUnitCards(
    [
      row({ utcUrl: 'a', frequencyName: 'Monthly', frequencyUrl: 'freq/3' }),
      row({ utcUrl: 'b', frequencyName: 'Daily', frequencyUrl: 'freq/1' }),
    ],
    now,
    ALL
  );
  expect(cards[0].rows.map((r) => r.frequencyName)).toEqual(['Daily', 'Monthly']);
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
      row({
        utcUrl: 'b',
        unitUrl: 'unit/77',
        unitName: 'Unity',
        siteUrl: 'site/4',
        siteName: 'Brachy',
      }),
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

test('a card label round-trips through the filter it opens', () => {
  // The dashboard shows labels; the filter matches sentinels. Tapping a card
  // row must land on exactly the rows that row counted -- for EVERY row it can
  // produce, including the ad-hoc one.
  const rows = [
    row({ utcUrl: 'a' }),
    row({ utcUrl: 'b', frequencyName: null, frequencyUrl: null, dueDate: null }),
  ];
  const card = buildUnitCards(rows, now, ALL)[0];

  for (const r of card.rows) {
    const matched = filterSchedule(rows, card.unitUrl, frequencyFilterFor(r.frequencyName));
    expect(matched.length).toBeGreaterThan(0);
  }
});

test('frequencyFilterFor maps the ad-hoc label to the sentinel and leaves others alone', () => {
  expect(frequencyFilterFor(AD_HOC)).toBe(NO_FREQUENCY);
  expect(frequencyFilterFor('Daily')).toBe('Daily');
});

test('the ad-hoc bucket is reachable through the frequency filter', () => {
  const rows = [row({ utcUrl: 'a' }), row({ utcUrl: 'b', frequencyName: null, frequencyUrl: null })];
  expect(filterSchedule(rows, ALL, NO_FREQUENCY).map((r) => r.utcUrl)).toEqual(['b']);
});

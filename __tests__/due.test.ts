import { dueState } from '../src/schedule/due';

// A fixed "now": 2026-08-17 14:30 local.
const now = new Date(2026, 7, 17, 14, 30, 0);

/**
 * A due date, written the way the API sends it, but anchored to the SAME local
 * day the assertion is about.
 *
 * Hard-coding '+02:00' would tie these tests to Europe/Madrid: run on a UTC
 * machine, '2026-08-17T00:00:00+02:00' is the previous evening, and
 * "midnight this morning is due" would fail for a reason that has nothing to
 * do with dueState being wrong.
 */
const at = (y: number, m: number, d: number, h: number, min: number): string =>
  new Date(y, m, d, h, min, 0).toISOString();

test('a date before today is overdue', () => {
  expect(dueState(at(2026, 7, 16, 23, 59), now)).toBe('overdue');
});

test('a date earlier today is due, not overdue', () => {
  expect(dueState(at(2026, 7, 17, 8, 0), now)).toBe('due');
});

test('a date later today is due', () => {
  expect(dueState(at(2026, 7, 17, 23, 0), now)).toBe('due');
});

test('midnight this morning is due, not overdue', () => {
  expect(dueState(at(2026, 7, 17, 0, 0), now)).toBe('due');
});

test('tomorrow is not due yet', () => {
  expect(dueState(at(2026, 7, 18, 8, 57), now)).toBe('ok');
});

test('a real API date string with an offset is understood', () => {
  // What the API actually sends. Asserts only the coarse case that holds in
  // any timezone, so this stays green wherever the suite runs.
  expect(dueState('2020-01-01T08:00:00+02:00', now)).toBe('overdue');
});

test('a collection with no due date is unscheduled, not overdue', () => {
  // Ad-hoc collections have due_date null. Counting them as overdue would
  // put permanent red numbers on the dashboard for work nobody scheduled.
  expect(dueState(null, now)).toBe('unscheduled');
});

test('an unparseable date is unscheduled rather than silently overdue', () => {
  expect(dueState('not a date', now)).toBe('unscheduled');
});

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

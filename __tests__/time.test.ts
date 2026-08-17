import { nowStamp } from '../src/sync/time';

test('month is +1 relative to the JS Date index', () => {
  // JS months are 0-indexed: January is 0. The stamp must show human 1.
  expect(nowStamp(new Date(2026, 0, 15, 9, 5, 3))).toBe('2026-01-15 09:05:03');
});

test('month, day, hour, minute and second are zero-padded', () => {
  expect(nowStamp(new Date(2026, 2, 4, 1, 2, 3))).toBe('2026-03-04 01:02:03');
});

test('midnight renders as 00:00:00', () => {
  expect(nowStamp(new Date(2026, 7, 17, 0, 0, 0))).toBe('2026-08-17 00:00:00');
});

test('a single-digit day is zero-padded', () => {
  expect(nowStamp(new Date(2026, 11, 5, 23, 59, 59))).toBe('2026-12-05 23:59:59');
});

test('double-digit month, day, hour, minute and second need no padding', () => {
  expect(nowStamp(new Date(2026, 9, 25, 14, 45, 30))).toBe('2026-10-25 14:45:30');
});

import { encode, decode } from '../src/db/codec';

function roundTrip(v: number | boolean | null) {
  return decode(encode(v));
}

test('true round-trips', () => {
  expect(roundTrip(true)).toBe(true);
});

test('false round-trips -- a sloppy codec loses this one', () => {
  expect(roundTrip(false)).toBe(false);
  expect(roundTrip(false)).not.toBeNull();
});

test('0 round-trips -- a sloppy codec loses this one too', () => {
  expect(roundTrip(0)).toBe(0);
  expect(roundTrip(0)).not.toBeNull();
});

test('a negative decimal round-trips', () => {
  expect(roundTrip(-0.3)).toBe(-0.3);
});

test('a large number round-trips', () => {
  expect(roundTrip(123456789.5)).toBe(123456789.5);
});

test('null round-trips', () => {
  expect(roundTrip(null)).toBeNull();
});

test('a string round-trips when decoded with type string', () => {
  expect(decode(encode('warm-up complete'), 'string')).toBe('warm-up complete');
});

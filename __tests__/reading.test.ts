import { parseReading, isInvalidReading } from '../src/sync/reading';

test('a plain integer parses', () => {
  expect(parseReading('42')).toBe(42);
});

test('a plain decimal parses', () => {
  expect(parseReading('10.2')).toBe(10.2);
});

test('a comma decimal separator parses (Catalan/Spanish keyboards)', () => {
  expect(parseReading('0,5')).toBe(0.5);
});

test('a negative value parses', () => {
  expect(parseReading('-0.8')).toBe(-0.8);
});

test('a negative value with a comma separator parses', () => {
  expect(parseReading('-0,8')).toBe(-0.8);
});

test('zero parses to 0, not to null', () => {
  expect(parseReading('0')).toBe(0);
  expect(parseReading('0')).not.toBeNull();
});

test('empty text parses to null', () => {
  expect(parseReading('')).toBeNull();
});

test('whitespace-only text parses to null', () => {
  expect(parseReading('   ')).toBeNull();
});

test('empty text is not invalid -- it is merely unfilled', () => {
  expect(isInvalidReading('')).toBe(false);
});

test('whitespace-only text is not invalid', () => {
  expect(isInvalidReading('   ')).toBe(false);
});

test('a double decimal point parses to null and counts as invalid', () => {
  expect(parseReading('1.2.3')).toBeNull();
  expect(isInvalidReading('1.2.3')).toBe(true);
});

test('a double dot with leading digits parses to null and counts as invalid', () => {
  expect(parseReading('0..5')).toBeNull();
  expect(isInvalidReading('0..5')).toBe(true);
});

test('a bare minus sign (the +/- button on an empty field) parses to null and counts as invalid', () => {
  expect(parseReading('-')).toBeNull();
  expect(isInvalidReading('-')).toBe(true);
});

test('plain letters parse to null and count as invalid', () => {
  expect(parseReading('abc')).toBeNull();
  expect(isInvalidReading('abc')).toBe(true);
});

test('a valid reading is never invalid', () => {
  expect(isInvalidReading('10.2')).toBe(false);
  expect(isInvalidReading('0')).toBe(false);
  expect(isInvalidReading('-0.8')).toBe(false);
});

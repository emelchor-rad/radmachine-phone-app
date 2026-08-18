import { parseReading, isInvalidReading, summarizeReadings } from '../src/sync/reading';

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

// --- summarizeReadings -------------------------------------------------------

const defs = [
  { slug: 'dose', name: 'Dose 6MV' },
  { slug: 'shift', name: 'Deviation Inplane' },
  { slug: 'door', name: 'Door interlock' },
  { slug: 'laser', name: 'Laser alignment' },
];

const names = (ts: { name: string }[]) => ts.map((t) => t.name);

test('a filled number counts as filled', () => {
  const s = summarizeReadings([defs[0]], { dose: { value: 10.2 } }, { dose: '10.2' });
  expect(names(s.filled)).toEqual(['Dose 6MV']);
  expect(s.skipped).toEqual([]);
  expect(s.invalid).toEqual([]);
});

test('a reading of 0 counts as filled, not skipped', () => {
  const s = summarizeReadings([defs[0]], { dose: { value: 0 } }, { dose: '0' });
  expect(names(s.filled)).toEqual(['Dose 6MV']);
  expect(s.skipped).toEqual([]);
});

test('a boolean left at false counts as filled -- a recorded "No"', () => {
  const s = summarizeReadings([defs[2]], { door: { value: false } }, {});
  expect(names(s.filled)).toEqual(['Door interlock']);
  expect(s.skipped).toEqual([]);
});

test('a test with no entry at all is skipped and is named', () => {
  const s = summarizeReadings(defs, {}, {});
  expect(names(s.skipped)).toEqual([
    'Dose 6MV',
    'Deviation Inplane',
    'Door interlock',
    'Laser alignment',
  ]);
  expect(s.filled).toEqual([]);
});

test('an explicit null value is skipped (the field was cleared)', () => {
  const s = summarizeReadings([defs[0]], { dose: { value: null } }, { dose: '' });
  expect(names(s.skipped)).toEqual(['Dose 6MV']);
});

test('unparseable text is invalid, NOT skipped -- this is the C2 bug', () => {
  // The stored value is null because '1.2.3' never parsed, so buildPayload
  // would send {skipped: true} while the box still shows '1.2.3'.
  const s = summarizeReadings([defs[0]], { dose: { value: null } }, { dose: '1.2.3' });
  expect(names(s.invalid)).toEqual(['Dose 6MV']);
  expect(s.skipped).toEqual([]);
  expect(s.filled).toEqual([]);
});

test('the bare minus from +/- on an empty field is invalid', () => {
  const s = summarizeReadings([defs[1]], { shift: { value: null } }, { shift: '-' });
  expect(names(s.invalid)).toEqual(['Deviation Inplane']);
});

test('a double dot is invalid', () => {
  const s = summarizeReadings([defs[0]], { dose: { value: null } }, { dose: '0..5' });
  expect(names(s.invalid)).toEqual(['Dose 6MV']);
});

test('invalid wins over a stale stored value', () => {
  // The user had typed 5, then edited it into nonsense: the stored value is
  // whatever updateNumber last wrote, but the screen shows garbage.
  const s = summarizeReadings([defs[0]], { dose: { value: 5 } }, { dose: '5..' });
  expect(names(s.invalid)).toEqual(['Dose 6MV']);
  expect(s.filled).toEqual([]);
});

test('a mixed worksheet splits into all three groups', () => {
  const s = summarizeReadings(
    defs,
    { dose: { value: 10.2 }, shift: { value: null }, door: { value: true } },
    { dose: '10.2', shift: '1.2.3' }
  );
  expect(names(s.filled)).toEqual(['Dose 6MV', 'Door interlock']);
  expect(names(s.skipped)).toEqual(['Laser alignment']);
  expect(names(s.invalid)).toEqual(['Deviation Inplane']);
});

test('text or values for slugs outside the definitions are ignored', () => {
  // Definitions are re-read from the database at finish time; leftover state
  // for a slug that is no longer in the list must not appear in the summary.
  const s = summarizeReadings(
    [defs[0]],
    { dose: { value: 1 }, gone: { value: null } },
    { dose: '1', gone: 'abc' }
  );
  expect(names(s.filled)).toEqual(['Dose 6MV']);
  expect(s.invalid).toEqual([]);
  expect(s.skipped).toEqual([]);
});

test('an empty definition list summarises to nothing at all', () => {
  const s = summarizeReadings([], { dose: { value: 1 } }, { dose: '1' });
  expect(s.filled).toEqual([]);
  expect(s.skipped).toEqual([]);
  expect(s.invalid).toEqual([]);
});

test('summarizeReadings does not mutate its inputs', () => {
  const values = { dose: { value: 1 } };
  const texts = { dose: '1' };
  summarizeReadings(defs, values, texts);
  expect(values).toEqual({ dose: { value: 1 } });
  expect(texts).toEqual({ dose: '1' });
});

test('composite tests are omitted from filled, skipped and invalid', () => {
  const mixed = [
    { slug: 'dose', name: 'Dose 6MV', type: 'simple' as const },
    { slug: 'avg', name: 'Average', type: 'composite' as const },
  ];
  const s = summarizeReadings(mixed, { dose: { value: 1 }, avg: { value: 2 } }, { dose: '1' });
  expect(names(s.filled)).toEqual(['Dose 6MV']);
  expect(s.skipped).toEqual([]);
  expect(s.invalid).toEqual([]);
});

test('a filled string counts as filled; empty string as skipped', () => {
  const rows = [{ slug: 'notes', name: 'Notes', type: 'string' as const }];
  expect(names(summarizeReadings(rows, { notes: { value: 'done' } }, {}).filled)).toEqual([
    'Notes',
  ]);
  expect(names(summarizeReadings(rows, { notes: { value: '' } }, {}).skipped)).toEqual(['Notes']);
});

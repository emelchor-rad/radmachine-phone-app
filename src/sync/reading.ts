/**
 * Parse what the physicist typed into a numeric reading.
 *
 * Returns null when the text is empty OR does not parse. The caller must tell
 * those two apart by looking at the text: non-empty text with a null reading
 * is an INVALID entry, and submitting it as skipped would silently lose a
 * reading the user believes they recorded.
 *
 * Android keyboards in Catalan/Spanish locales emit ',' as the decimal
 * separator, and Number(',5') is NaN -- another silent loss.
 */
export function parseReading(text: string): number | null {
  const raw = text.trim().replace(',', '.');
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Non-empty text that does not parse: the user typed something meaningless. */
export function isInvalidReading(text: string): boolean {
  return text.trim() !== '' && parseReading(text) === null;
}

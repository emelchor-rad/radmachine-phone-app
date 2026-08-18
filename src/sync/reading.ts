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

/** The minimum a test definition has to carry to be reported to the user. */
export type NamedTest = { slug: string; name: string };

/** What is stored per slug: only the value matters for filled-vs-skipped. */
export type ValueLike = { value: number | boolean | null | undefined };

export type ReadingSummary<T extends NamedTest> = {
  /** Will be submitted with a value. */
  filled: T[];
  /** Will be submitted as `{skipped: true}` -- never touched, or cleared. */
  skipped: T[];
  /** Shows text on screen that does not parse; must never be submitted. */
  invalid: T[];
};

/**
 * Split the test definitions into what will actually be submitted.
 *
 * This lives here, not in the worksheet component, because it is the whole
 * safety argument of the pre-submit summary and it has to be testable: an
 * `invalid` test is one whose box visibly contains something the physicist
 * believes they recorded, while the stored value is null -- so `buildPayload`
 * would send `{skipped: true}` and nobody would ever know. Callers must refuse
 * to submit while `invalid` is non-empty, and must name `skipped` out loud.
 *
 * `texts` is the raw typed text per slug (numeric fields only); `values` is
 * what was persisted. Booleans never appear in `texts`, so one recorded as Fail
 * lands in `filled` (false is a reading) while one never touched lands in
 * `skipped`. The Pass/Fail control now shows that difference on screen too, but
 * the summary still names it: seeing a control is not the same as noticing it,
 * and the last chance to catch an unrecorded safety check is the moment before
 * it is submitted.
 */
export function summarizeReadings<T extends NamedTest>(
  defs: readonly T[],
  values: Record<string, ValueLike | undefined>,
  texts: Record<string, string | undefined>
): ReadingSummary<T> {
  const summary: ReadingSummary<T> = { filled: [], skipped: [], invalid: [] };

  for (const def of defs) {
    if (isInvalidReading(texts[def.slug] ?? '')) {
      summary.invalid.push(def);
      continue;
    }
    const v = values[def.slug]?.value;
    if (v === null || v === undefined) summary.skipped.push(def);
    else summary.filled.push(def);
  }

  return summary;
}

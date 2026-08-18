/**
 * SQLite has no boolean; store everything as text.
 *
 * The type is recovered on the `decode` side, by matching the literal
 * strings 'true'/'false' before falling back to Number() -- so encode just
 * needs to stringify.
 */
export function encode(v: number | boolean | string | null): string | null {
  if (v === null) return null;
  return String(v);
}

export function decode(
  raw: string | null,
  type?: 'simple' | 'boolean' | 'string' | 'composite' | 'scomposite'
): number | boolean | string | null {
  if (raw === null) return null;
  if (type === 'string') return raw;
  if (type === 'boolean') {
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return null;
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

/** Max procedure length the phone will attempt to run offline. */
export const MAX_PROCEDURE_CHARS = 4096;

/** Tokens that mean the server environment is required. */
export const BLOCKED_TOKENS = [
  'import ',
  'UTILS',
  'META',
  'scipy',
  'numpy',
  'matplotlib',
  'pylinac',
  'pydicom',
  'open(',
  'write_file',
  'previous_test',
  '__import__',
  'eval(',
  'exec(',
  'os.',
  'sys.',
  'subprocess',
];

export type GateResult = { ok: true } | { ok: false; reason: string };

/**
 * Decide whether a calculation_procedure is safe to run on the phone.
 *
 * The user can tighten this list over time; the gate exists so bunker QA
 * never hangs on a pylinac script the device cannot run anyway.
 */
export function canRunOnDevice(procedure: string | null | undefined): GateResult {
  const code = procedure?.trim() ?? '';
  if (!code) return { ok: false, reason: 'No calculation procedure' };
  if (code.length > MAX_PROCEDURE_CHARS) {
    return { ok: false, reason: 'Procedure too long for phone' };
  }
  const lower = code.toLowerCase();
  for (const token of BLOCKED_TOKENS) {
    if (lower.includes(token.toLowerCase())) {
      return { ok: false, reason: `Uses ${token.trim()} — server only` };
    }
  }
  return { ok: true };
}

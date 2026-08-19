import type { CalcContext } from './composite-context';

/** Escape a slug for use as a Python identifier assignment target. */
function pyIdent(slug: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(slug)) {
    throw new Error(`Slug '${slug}' is not a valid Python identifier`);
  }
  return slug;
}

function pyLiteral(v: number | boolean | string | null): string {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? '1.0' : '0.0';
  if (typeof v === 'string') return JSON.stringify(v);
  if (!Number.isFinite(v)) return 'None';
  return String(v);
}

function pyRefs(refs: CalcContext['REFS']): string {
  const parts = Object.entries(refs).map(([k, v]) => `${JSON.stringify(k)}: ${pyLiteral(v)}`);
  return `{${parts.join(', ')}}`;
}

function pyTols(tols: CalcContext['TOLS']): string {
  const parts = Object.entries(tols).map(([slug, t]) => {
    const body = [
      `'type': ${JSON.stringify(t.type)}`,
      `'act_low': ${pyLiteral(t.act_low)}`,
      `'tol_low': ${pyLiteral(t.tol_low)}`,
      `'tol_high': ${pyLiteral(t.tol_high)}`,
      `'act_high': ${pyLiteral(t.act_high)}`,
    ].join(', ');
    return `${JSON.stringify(slug)}: {${body}}`;
  });
  return `{${parts.join(', ')}}`;
}

/** QATrack allows assigning to `result` instead of the test macro name. */
export function resultCaptureIdent(slug: string, procedure: string): string {
  if (/\bresult\s*=/.test(procedure)) return 'result';
  return pyIdent(slug);
}

/**
 * Wrap a QATrack calculation_procedure with slug bindings and capture the result.
 *
 * Pure — testable without Pyodide.
 */
export function buildPythonScript(
  slug: string,
  procedure: string,
  context: CalcContext
): string {
  const capture = resultCaptureIdent(slug, procedure);
  const bindings = Object.entries(context.values)
    .map(([s, v]) => `${pyIdent(s)} = ${pyLiteral(v)}`)
    .join('\n');

  return `
import math
REFS = ${pyRefs(context.REFS)}
TOLS = ${pyTols(context.TOLS)}
${bindings}
${procedure}
__radmachine_result__ = ${capture}
`.trim();
}

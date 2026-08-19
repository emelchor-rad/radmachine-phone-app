/**
 * Run QATrack calculation_procedure snippets with Skulpt (pure JS Python).
 * Works offline in Expo Go — no WASM, no WebView file:// issues.
 */
import { buildPythonScript } from './python-script';
import type { CalcContext } from './composite-context';

type SkulptGlobal = typeof globalThis & {
  window?: typeof globalThis;
  self?: typeof globalThis;
  Sk?: any;
};

let configured = false;

function ensureWindowPolyfill(): void {
  const g = globalThis as SkulptGlobal;
  if (!g.window) g.window = g;
  if (!g.self) g.self = g;
}

function getSkulpt(): any {
  ensureWindowPolyfill();
  const g = globalThis as SkulptGlobal;
  if (!g.Sk) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('skulpt/dist/skulpt.min.js');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('skulpt/dist/skulpt-stdlib.js');
  }
  if (!g.Sk) throw new Error('Skulpt failed to load');
  return g.Sk;
}

function configureSkulpt(Sk: any): void {
  if (configured) return;
  Sk.configure({
    read: (path: string) => {
      if (!Sk.builtinFiles?.files?.[path]) {
        throw new Error(`Skulpt stdlib missing: ${path}`);
      }
      return Sk.builtinFiles.files[path];
    },
    __future__: Sk.python3,
  });
  configured = true;
}

function skulptValue(raw: any): number | string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  if (typeof raw === 'object' && raw !== null && 'v' in raw) return skulptValue(raw.v);
  if (typeof raw === 'object' && raw !== null && typeof raw.tp$str === 'function') {
    return skulptValue(raw.tp$str().v);
  }
  return String(raw);
}

export function isPythonEngineReady(): boolean {
  try {
    configureSkulpt(getSkulpt());
    return true;
  } catch {
    return false;
  }
}

export function pythonEngineError(): string | null {
  try {
    configureSkulpt(getSkulpt());
    return null;
  } catch (e: any) {
    return String(e?.message ?? e);
  }
}

/** Kept for worksheet subscription API — Skulpt boots synchronously on first use. */
export function subscribePythonEngineStatus(listener: () => void): () => void {
  listener();
  return () => {};
}

export async function runCompositeScript(
  slug: string,
  procedure: string,
  context: CalcContext
): Promise<number | string | null> {
  const Sk = getSkulpt();
  configureSkulpt(Sk);
  const script = buildPythonScript(slug, procedure, context);

  Sk.globals = {};
  Sk.importMainWithBody('<stdin>', false, script, true);
  return skulptValue(Sk.globals.__radmachine_result__);
}

// Legacy names used by worksheet until imports are updated.
export const isPyodideReady = isPythonEngineReady;
export const pyodideBootError = pythonEngineError;
export const pyodideBootProgress = (): string | null => null;
export const subscribePyodideStatus = subscribePythonEngineStatus;

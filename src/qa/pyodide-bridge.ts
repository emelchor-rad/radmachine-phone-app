import { buildPythonScript } from './python-script';
import type { CalcContext } from './composite-context';

type Pending = {
  resolve: (v: number | string | null) => void;
  reject: (e: Error) => void;
};

let inject: ((js: string) => void) | null = null;
let ready = false;
let bootError: string | null = null;
const pending = new Map<string, Pending>();
let nextId = 1;

/** Called by PyodideEngine when the WebView can execute JS. */
export function registerPyodideInjector(fn: (js: string) => void): void {
  inject = fn;
}

export function unregisterPyodideInjector(): void {
  inject = null;
  ready = false;
  bootError = null;
}

/** Called by PyodideEngine when the WebView posts a message. */
export function handlePyodideMessage(raw: string): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.type === 'ready') {
    ready = true;
    bootError = null;
    return;
  }
  if (msg.type === 'boot-error') {
    bootError = msg.message ?? 'Pyodide failed to start';
    ready = false;
    return;
  }

  const p = pending.get(msg.id);
  if (!p) return;
  pending.delete(msg.id);

  if (msg.type === 'result') {
    p.resolve(normalizeResult(msg.result));
  } else {
    p.reject(new Error(msg.message ?? 'Python error'));
  }
}

function normalizeResult(raw: unknown): number | string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  return String(raw);
}

export function isPyodideReady(): boolean {
  return ready && !bootError;
}

export function pyodideBootError(): string | null {
  return bootError;
}

/**
 * Run one calculation_procedure offline. Requires PyodideEngine mounted.
 */
export async function runCompositeScript(
  slug: string,
  procedure: string,
  context: CalcContext
): Promise<number | string | null> {
  if (!inject) throw new Error('Python engine not loaded');
  if (bootError) throw new Error(bootError);
  if (!ready) throw new Error('Python engine still starting — wait a few seconds');

  const script = buildPythonScript(slug, procedure, context);
  const id = String(nextId++);
  const payload = JSON.stringify({ id, script });

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    inject!(`window.__radmachineRun(${JSON.stringify(payload)}); true;`);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('Python calculation timed out'));
      }
    }, 15000);
  });
}

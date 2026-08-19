import { buildPythonScript } from './python-script';
import type { CalcContext } from './composite-context';

type Pending = {
  resolve: (v: number | string | null) => void;
  reject: (e: Error) => void;
};

type StatusListener = () => void;

let inject: ((js: string) => void) | null = null;
let ready = false;
let bootError: string | null = null;
let bootProgress: string | null = null;
let bootTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Map<string, Pending>();
const listeners = new Set<StatusListener>();
let nextId = 1;

const BOOT_TIMEOUT_MS = 120_000;

function notifyStatus(): void {
  for (const listener of listeners) listener();
}

function clearBootTimer(): void {
  if (bootTimer) {
    clearTimeout(bootTimer);
    bootTimer = null;
  }
}

/** Start a watchdog when the hidden WebView begins booting Pyodide. */
export function startPyodideBootWatch(): void {
  clearBootTimer();
  bootTimer = setTimeout(() => {
    if (!ready && !bootError) {
      bootError =
        'Python engine timed out after 2 minutes — close Expo Go fully, run npm run start:clean, and try again';
      notifyStatus();
    }
  }, BOOT_TIMEOUT_MS);
}

/** Called by PyodideEngine when the WebView can execute JS. */
export function registerPyodideInjector(fn: (js: string) => void): void {
  inject = fn;
}

export function unregisterPyodideInjector(): void {
  inject = null;
  ready = false;
  bootError = null;
  bootProgress = null;
  clearBootTimer();
  notifyStatus();
}

export function subscribePyodideStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called by PyodideEngine when the WebView posts a message. */
export function handlePyodideMessage(raw: string): void {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }

  if (msg.type === 'boot-progress') {
    bootProgress = msg.stage ?? null;
    notifyStatus();
    return;
  }
  if (msg.type === 'ready') {
    ready = true;
    bootError = null;
    bootProgress = null;
    clearBootTimer();
    notifyStatus();
    return;
  }
  if (msg.type === 'boot-error') {
    bootError = msg.message ?? 'Pyodide failed to start';
    ready = false;
    bootProgress = null;
    clearBootTimer();
    notifyStatus();
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

export function pyodideBootProgress(): string | null {
  return bootProgress;
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

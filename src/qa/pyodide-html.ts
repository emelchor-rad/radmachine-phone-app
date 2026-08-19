/** Boot logic only — pyodide.js is inlined by buildPyodideRunnerHtml(). */
const RUNNER_BOOT_SCRIPT = `
  let pyodide = null;
  let bootPromise = null;

  function post(obj) {
    if (!window.ReactNativeWebView || !window.ReactNativeWebView.postMessage) {
      throw new Error('ReactNativeWebView bridge not ready');
    }
    window.ReactNativeWebView.postMessage(JSON.stringify(obj));
  }

  function indexUrl() {
    const href = window.location.href.split('#')[0].split('?')[0];
    const i = href.lastIndexOf('/');
    return i >= 0 ? href.slice(0, i + 1) : './';
  }

  async function ensurePyodide() {
    if (pyodide) return pyodide;
    const loadFn = globalThis.loadPyodide;
    if (typeof loadFn !== 'function') {
      throw new Error('loadPyodide is not defined — pyodide.js did not load');
    }
    if (!bootPromise) {
      post({ type: 'boot-progress', stage: 'loading-wasm' });
      bootPromise = loadFn({ indexURL: indexUrl(), fullStdLib: false });
    }
    pyodide = await bootPromise;
    return pyodide;
  }

  async function boot() {
    try {
      post({ type: 'boot-progress', stage: 'starting' });
      await ensurePyodide();
      post({ type: 'ready' });
    } catch (e) {
      post({ type: 'boot-error', message: String(e) });
    }
  }

  window.__radmachineBoot = boot;

  window.__radmachineRun = async function(payloadJson) {
    const { id, script } = JSON.parse(payloadJson);
    try {
      await ensurePyodide();
      await pyodide.runPythonAsync(script);
      const raw = pyodide.globals.get('__radmachine_result__');
      let result = raw && raw.toJs ? raw.toJs() : raw;
      if (typeof result === 'bigint') result = Number(result);
      if (result !== null && typeof result === 'object') {
        result = JSON.stringify(result);
      }
      post({ type: 'result', id, result: result ?? null });
    } catch (e) {
      post({ type: 'error', id, message: String(e) });
    }
  };
`;

/** Prevent inline script termination if pyodide.js ever contains a closing tag. */
function escapeForInlineScript(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script');
}

/**
 * Build WebView HTML with pyodide.js inlined.
 *
 * Boot is triggered from React Native onLoadEnd so the WebView bridge exists
 * and the view has non-zero dimensions before WASM compilation starts.
 */
export function buildPyodideRunnerHtml(pyodideJs: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script>${escapeForInlineScript(pyodideJs)}</script>
<script>${RUNNER_BOOT_SCRIPT}</script>
</body>
</html>`;
}

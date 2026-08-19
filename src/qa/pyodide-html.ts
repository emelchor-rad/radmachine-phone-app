/** Boot logic only — pyodide.js is inlined by buildPyodideRunnerHtml(). */
const RUNNER_BOOT_SCRIPT = `
  let pyodide = null;
  let bootPromise = null;

  function post(obj) {
    window.ReactNativeWebView.postMessage(JSON.stringify(obj));
  }

  async function ensurePyodide() {
    if (pyodide) return pyodide;
    if (typeof loadPyodide !== 'function') {
      throw new Error('loadPyodide is not defined — pyodide.js did not load');
    }
    if (!bootPromise) {
      bootPromise = loadPyodide({ indexURL: './' });
    }
    pyodide = await bootPromise;
    return pyodide;
  }

  async function boot() {
    try {
      await ensurePyodide();
      post({ type: 'ready' });
    } catch (e) {
      post({ type: 'boot-error', message: String(e) });
    }
  }

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

  boot();
`;

/** Prevent inline script termination if pyodide.js ever contains a closing tag. */
function escapeForInlineScript(js: string): string {
  return js.replace(/<\/script/gi, '<\\/script');
}

/**
 * Build WebView HTML with pyodide.js inlined.
 *
 * Android WebView blocks external &lt;script src&gt; from file:// when the page
 * is loaded via source={{ html }}. Inlining the ~15 KB loader fixes
 * "loadPyodide is not defined".
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

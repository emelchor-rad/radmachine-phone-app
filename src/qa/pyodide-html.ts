/** Hidden WebView HTML — loads Pyodide from bundled assets (same baseUrl directory). */
export const PYODIDE_RUNNER_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body>
<script src="pyodide.js"></script>
<script>
  let pyodide = null;
  let bootPromise = null;

  function post(obj) {
    window.ReactNativeWebView.postMessage(JSON.stringify(obj));
  }

  async function ensurePyodide() {
    if (pyodide) return pyodide;
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
</script>
</body>
</html>`;

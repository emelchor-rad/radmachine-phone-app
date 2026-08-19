import { buildPyodideRunnerHtml } from '../src/qa/pyodide-html';

test('buildPyodideRunnerHtml inlines pyodide.js and boot script', () => {
  const html = buildPyodideRunnerHtml('var loadPyodide = () => {};');
  expect(html).toContain('var loadPyodide = () => {}');
  expect(html).toContain('window.__radmachineRun');
  expect(html).not.toContain('<script src="pyodide.js">');
});

test('buildPyodideRunnerHtml escapes closing script tags inside pyodide.js', () => {
  const html = buildPyodideRunnerHtml('var x = "</script>";');
  expect(html).toContain('<\\/script>');
});

#!/usr/bin/env node
/**
 * Download Pyodide runtime files for offline bunker use (bundled in the app).
 * Works on Windows and Unix. Run once after clone: npm run setup:pyodide
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const VERSION = process.env.PYODIDE_VERSION || '0.27.6';
const DIR = path.join(__dirname, '..', 'assets', 'pyodide');
const BASE = `https://cdn.jsdelivr.net/pyodide/v${VERSION}/full`;

const files = [
  'pyodide.js',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetch(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  for (const f of files) {
    process.stdout.write(`Fetching ${f} ...\n`);
    const buf = await fetch(`${BASE}/${f}`);
    fs.writeFileSync(path.join(DIR, f), buf);
  }
  fs.copyFileSync(path.join(DIR, 'pyodide.js'), path.join(DIR, 'pyodide.runtime.bin'));
  fs.copyFileSync(path.join(DIR, 'pyodide.asm.js'), path.join(DIR, 'pyodide.asm.bin'));
  fs.copyFileSync(path.join(DIR, 'pyodide-lock.json'), path.join(DIR, 'pyodide-lock.bin'));
  process.stdout.write(`Pyodide ${VERSION} ready in assets/pyodide/\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

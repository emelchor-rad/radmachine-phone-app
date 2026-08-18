#!/usr/bin/env bash
# Download Pyodide runtime files for offline bunker use (bundled in the app).
# Run once after clone:  npm run setup:pyodide

set -euo pipefail
VERSION="${PYODIDE_VERSION:-0.27.6}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/assets/pyodide"
BASE="https://cdn.jsdelivr.net/pyodide/v${VERSION}/full"

mkdir -p "$DIR"

files=(
  pyodide.js
  pyodide.asm.js
  pyodide.asm.wasm
  python_stdlib.zip
  pyodide-lock.json
)

for f in "${files[@]}"; do
  echo "Fetching $f ..."
  curl -fsSL "$BASE/$f" -o "$DIR/$f"
done

echo "Pyodide $VERSION ready in assets/pyodide/ ($(du -sh "$DIR" | cut -f1))"

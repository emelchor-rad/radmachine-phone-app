# Composite calculation on device — design spec

**Date:** 2026-08-18  
**Branch:** `cursor/composite-support-692e`  
**Status:** Draft — awaiting user review

## Goal

While filling a downloaded test list offline, **composite** and **scomposite** rows should show a **live calculated value** on the phone by running each test's `calculation_procedure` Python snippet — within limits the user will define so we do not attempt pylinac, uploads, UTILS history lookups, etc.

## Non-goals (this phase)

- Submitting composite values in POST (RadMachine still calculates on the server; unchanged)
- Upload tests, matplotlib plots, file attachments
- Full QATrack+ environment (`UTILS`, `META`, previous instances, `write_file`)
- NumPy / SciPy / pylinac unless explicitly added later

## Context from QATrack+

When RadMachine runs a composite procedure it provides:

1. **Current values** of all tests in the list, as Python variables named by **slug** (macro name)
2. **`REFS`** — `{slug: ref_value}`
3. **`TOLS`** — `{slug: {act_low, tol_low, tol_high, act_high, type, ...}}`
4. **`math`** and optionally NumPy, SciPy, etc.

The procedure assigns the result to a variable named like the composite test's slug.  
**scomposite** assigns a string (or JSON-serializable dict in newer QATrack+).

## Design change from v1 rule

Previous rule: *anything the phone computes is indication only, never stored.*

**Still true for POST**, but the worksheet will now show calculated composites with tolerance colouring so the physicist gets immediate feedback. The stored clinical record remains whatever RadMachine computes after submit.

## Architecture

```
download definition
  → flattenTestList stores slug, type, calculation_procedure per test
  → SQLite test row gains calc_procedure TEXT

worksheet value change
  → buildCalcContext(values, criteria) → { slug: number|string|bool|null, REFS, TOLS }
  → recalculateComposites(tests, context) in slug dependency order
  → composite display state (not persisted in draft.values)

finish / POST
  → buildPayload unchanged (fillable tests only)
```

### Modules

| Module | Responsibility |
|--------|----------------|
| `src/api/definitions.ts` | Persist `calculationProcedure` from API test object |
| `src/db/schema.ts` | Column `calc_procedure` on `test` |
| `src/qa/composite-gate.ts` | Pure: `canRunOnDevice(procedure) → {ok, reason}` |
| `src/qa/composite-context.ts` | Pure: build REFS/TOLS/slug vars from TestDef[] + draft values |
| `src/qa/pyodide-runner.ts` | Bridge to WebView: init once, run procedure, return result |
| `src/ui/PyodideEngine.tsx` | Hidden WebView hosting Pyodide (bundled HTML asset) |
| `src/qa/recalculate.ts` | Pure ordering + orchestration (testable with mock runner) |
| `app/worksheet/[sessionId].tsx` | Show computed composite value + tolerance; recalc on change |

## Approach options

### A — Pyodide in hidden WebView (recommended)

- **Pros:** Real Python; matches server procedures for simple math; user asked for Python
- **Cons:** ~8–15 MB WASM; first init ~2–5 s; must bundle assets for offline bunker
- **Expo:** `react-native-webview` works in Expo Go 54; Pyodide loaded from app-bundled `assets/pyodide/` (not CDN) for offline

### B — Skulpt (Python subset in JS)

- **Pros:** Small (~200 KB), no WebView, fast init, offline trivial
- **Cons:** Not full Python; no NumPy; may diverge from server on edge cases

### C — JS expression sandbox only

- **Pros:** Smallest, fastest
- **Cons:** Not Python; user explicitly requested Python

**Recommendation:** **A (Pyodide)**, with **`composite-gate`** rejecting procedures that use forbidden tokens (`import`, `UTILS`, `META`, `scipy`, `numpy`, `matplotlib`, `pylinac`, `open(`, etc.). User can tighten the allow-list over time.

## Gating (user-controlled complexity)

`canRunOnDevice(procedure)` returns false when:

- Contains blocked identifiers (configurable list)
- Procedure length over cap (e.g. 4 KB)
- Nested composite chain depth over cap (e.g. 5)

When gated out, worksheet shows: *"Calculated on submit — procedure too complex for phone"* (current behaviour).

When allowed, run on device and show: *"Calculated on phone (indication)"* with OK/Tolerance/Action if criteria exist.

## Calculation order

Reuse QATrack dependency idea: run composites in list order; if composite B uses composite A, A appears earlier in flattened list (RadMachine list order).  
`recalculateComposites` loops fillable→composite passes until stable (max 3 passes for chains).

## Skipped / missing inputs

- Missing or null fillable value → inject `None` in Python context
- Procedure may error; catch and show *"Waiting for inputs"* without crashing worksheet

## scomposite

Same runner; result type string (or JSON stringified if dict returned). Display as text; no tolerance band unless criteria exist and value parses as number.

## Testing

- Pure tests: `composite-gate`, `composite-context`, `recalculate` with mock runner
- Fixture procedures: TP correction one-liner, average of two slugs, composite-of-composite
- No device test for Pyodide in Jest; manual on Expo Go

## Risks

| Risk | Mitigation |
|------|------------|
| Phone result ≠ server result | Label as indication; never POST composites |
| Pyodide too heavy for Expo Go | Gate keeps most lists on simple procedures; Skulpt fallback later |
| Offline without bundled WASM | Bundle pyodide in `assets/` before bunker testing |
| Procedure uses forbidden APIs | Gate + runtime try/catch |

## Open question

**Must Pyodide work in airplane mode (bunker) on first use, or is it acceptable to require one online session to download the list *and* cache the Python runtime?**

Bundled assets = yes to bunker. CDN = dev only.

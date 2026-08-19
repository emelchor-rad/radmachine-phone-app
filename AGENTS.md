# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

This project is pinned to **Expo SDK 54** on purpose: the target Android phone runs Expo Go
54.0.8, which refuses a newer project outright. Do not upgrade the SDK without checking the
device first.

## Cursor Cloud specific instructions

### Verify before finishing

```bash
npm test
npx tsc --noEmit
```

179 Jest tests run without a device. TypeScript must be clean.

### Install note

The cloud install runs `npm ci` then `npm run setup:pyodide` (downloads Pyodide assets into
`assets/pyodide/`). Do not upgrade Expo SDK in cloud runs — stay on SDK 54.

### RadMachine API secrets (optional)

For integration tests against tenant `emelchor`, set in Cursor secrets:

| Secret | Purpose |
|---|---|
| `RADMACHINE_EMELCHOR_TOKEN` | RadMachine REST API token for sandbox tenant |

Most agent work is offline unit tests; live API calls are only needed when testing sync/submit flows.

### No Expo Go in cloud

Cloud agents cannot scan QR codes or run Expo Go on a phone. Use `npm test` for verification.
Do not start Metro unless debugging bundler issues — it is not required for the test suite.

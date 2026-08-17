import { RadClient } from '../api/client';
import { classifyResponse, type SubmitOutcome } from '../api/submit';
import { applyState, dueRows } from '../db/outbox';
import { loadCredentials } from '../secure/credentials';
import { backoffMs, nextState } from './worker';

export type DrainSummary = { attempted: number; sent: number; failed: number; queued: number };

let inFlight: Promise<DrainSummary> | null = null;

/**
 * Send every due row. Returns how many were processed.
 *
 * Walking out of a bunker fires the connectivity and foreground events within
 * milliseconds of each other, so overlapping calls are the normal case, not an
 * edge case. A caller arriving mid-run joins the run already going instead of
 * starting a second pass over the same rows -- so it reports that run's count,
 * not a count of its own.
 *
 * The user_key guard already makes a double POST harmless at the server, but
 * racing passes can still overwrite a recovered session url with null and
 * double the traffic on a link that is marginal by definition.
 */
export function drainOutbox(): Promise<DrainSummary> {
  if (inFlight) return inFlight;
  inFlight = runDrain().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * A duplicate user_key means an earlier attempt already reached the server;
 * we then GET by user_key to recover the session url instead of losing it.
 *
 * An auth outcome ends the pass. The row itself stays queued (see nextState --
 * a bad token is fixable, a failed row is not), but the remaining rows are not
 * even attempted: the credentials are now known to be bad, so the other POSTs
 * would fail for the same reason, burning requests and backoff bumps on a link
 * that is marginal by definition. They stay due and go out on the next pass,
 * once the token has been replaced.
 */
async function runDrain(): Promise<DrainSummary> {
  const summary: DrainSummary = { attempted: 0, sent: 0, failed: 0, queued: 0 };

  const creds = await loadCredentials();
  if (!creds) return summary;

  const client = new RadClient(creds.baseUrl, creds.token);
  const rows = await dueRows(new Date().toISOString());

  for (const row of rows) {
    const attempts = row.attempts + 1;
    let outcome: SubmitOutcome;
    try {
      const r = await client.post('/qa/testlistinstances/', row.payload);
      outcome = classifyResponse(r.status, r.body);
    } catch (e: any) {
      outcome = { kind: 'retry' as const, message: String(e?.message ?? e) };
    }

    const state = nextState(outcome, attempts);

    if (outcome.kind === 'duplicate') {
      try {
        const found = await client.get<any>('/qa/testlistinstances/', {
          user_key: row.payload.user_key,
        });
        state.sessionUrl = found?.results?.[0]?.url ?? null;
      } catch {
        // Leave it null; the row is still correctly marked sent.
      }
    }

    const nextAttempt =
      state.status === 'queued'
        ? new Date(Date.now() + backoffMs(attempts)).toISOString()
        : null;

    await applyState(row.sessionId, state, attempts, nextAttempt);
    summary.attempted += 1;
    summary[state.status] += 1;

    if (outcome.kind === 'auth') break;
  }

  return summary;
}

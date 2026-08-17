import { RadClient } from '../api/client';
import { classifyResponse, type SubmitOutcome } from '../api/submit';
import { applyState, dueRows } from '../db/outbox';
import { loadCredentials } from '../secure/credentials';
import { backoffMs, nextState } from './worker';

/**
 * Send every due row. Returns how many were processed.
 *
 * A duplicate user_key means an earlier attempt already reached the server;
 * we then GET by user_key to recover the session url instead of losing it.
 */
export async function drainOutbox(): Promise<number> {
  const creds = await loadCredentials();
  if (!creds) return 0;

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
  }

  return rows.length;
}

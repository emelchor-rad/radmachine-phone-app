import type { SubmitPayload } from '../api/types';
import type { OutboxState } from '../sync/worker';
import { getDb } from './schema';

export type OutboxRow = {
  sessionId: string;
  payload: SubmitPayload;
  status: string;
  attempts: number;
  nextAttempt: string | null;
  sessionUrl: string | null;
  error: string | null;
};

export async function enqueue(sessionId: string, payload: SubmitPayload): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO outbox (session_id, payload, status, attempts) VALUES (?, ?, 'queued', 0)`,
    [sessionId, JSON.stringify(payload)]
  );
}

export async function dueRows(nowIso: string): Promise<OutboxRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM outbox WHERE status = 'queued' AND (next_attempt IS NULL OR next_attempt <= ?)`,
    [nowIso]
  );
  return rows.map(toRow);
}

export async function allRows(): Promise<OutboxRow[]> {
  const db = await getDb();
  return (await db.getAllAsync<any>(`SELECT * FROM outbox`)).map(toRow);
}

/**
 * Put a stopped row back in the queue.
 *
 * `failed` is otherwise terminal, and the readings behind it are unreachable:
 * dueRows selects only 'queued'. Resets attempts so the row goes out on the
 * next pass instead of waiting out a backoff earned by a problem the user has
 * since fixed (typically a replaced token).
 */
export async function requeue(sessionId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox SET status = 'queued', attempts = 0, next_attempt = NULL, error = NULL
     WHERE session_id = ?`,
    [sessionId]
  );
}

export async function applyState(
  sessionId: string,
  state: OutboxState,
  attempts: number,
  nextAttemptIso: string | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE outbox SET status = ?, session_url = ?, error = ?, attempts = ?, next_attempt = ?
     WHERE session_id = ?`,
    [state.status, state.sessionUrl, state.error, attempts, nextAttemptIso, sessionId]
  );
}

function toRow(r: any): OutboxRow {
  return {
    sessionId: r.session_id,
    payload: JSON.parse(r.payload),
    status: r.status,
    attempts: r.attempts,
    nextAttempt: r.next_attempt,
    sessionUrl: r.session_url,
    error: r.error,
  };
}

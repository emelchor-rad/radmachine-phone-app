import type { Draft, DraftValue } from '../api/types';
import { getDb } from './schema';
import { encode, decode } from './codec';

export async function createSession(
  id: string,
  utcUrl: string,
  userKey: string,
  workStarted: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO session (id, utc_url, user_key, status, work_started) VALUES (?, ?, ?, 'draft', ?)`,
    [id, utcUrl, userKey, workStarted]
  );
}

export async function setValue(
  sessionId: string,
  slug: string,
  v: DraftValue
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO value (session_id, slug, value, comment) VALUES (?, ?, ?, ?)`,
    [sessionId, slug, encode(v.value), v.comment ?? null]
  );
}

export async function loadDraft(sessionId: string): Promise<Draft> {
  const db = await getDb();
  const s = await db.getFirstAsync<any>(`SELECT * FROM session WHERE id = ?`, [sessionId]);
  if (!s) throw new Error(`No session ${sessionId}`);
  const rows = await db.getAllAsync<any>(`SELECT * FROM value WHERE session_id = ?`, [sessionId]);

  const values: Record<string, DraftValue> = {};
  for (const r of rows) {
    values[r.slug] = { value: decode(r.value), comment: r.comment ?? undefined };
  }

  return {
    userKey: s.user_key,
    utcUrl: s.utc_url,
    workStarted: s.work_started,
    workCompleted: s.work_completed ?? '',
    values,
  };
}

export async function markCompleted(sessionId: string, workCompleted: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE session SET status = 'queued', work_completed = ? WHERE id = ?`,
    [workCompleted, sessionId]
  );
}

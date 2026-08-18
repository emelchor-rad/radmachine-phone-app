import type { Draft, DraftValue } from '../api/types';
import { getDb } from './schema';
import { encode, decode } from './codec';
import { getTests } from './collections';

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

/** One unfinished session, as the catalogue lists it. */
export type DraftSummary = {
  id: string;
  utcUrl: string;
  /** From the downloaded collection; null if that definition is no longer stored. */
  utcName: string | null;
  unitName: string | null;
  workStarted: string;
  /**
   * Outbox status for this session, when it somehow already has a payload
   * waiting -- normally null. See the note in listDrafts.
   */
  outboxStatus: string | null;
};

/**
 * Every session still sitting at status 'draft', newest first.
 *
 * This is the READING half of the "a killed app loses nothing" guarantee.
 * createSession + setValue already persist every keystroke, but until something
 * listed the drafts back, a session abandoned by the Android back gesture (or
 * killed by the OS) was stranded: its readings were in SQLite with no screen
 * able to name it.
 *
 * Two deliberate choices:
 *
 * - LEFT JOIN, not an inner join. If the collection row is gone -- deleted, or
 *   the app reinstalled over a surviving database -- an inner join would drop
 *   the draft from the list and strand it all over again, which is the exact bug
 *   this function exists to close. Better a row with a null name that the
 *   worksheet can then explain than no row at all.
 *
 * - No exclusion for rows that are also in the outbox, but their outbox status is
 *   reported. finish() enqueues before it marks the session queued, so a failure
 *   between the two leaves a session that reads 'draft' and has a payload
 *   waiting. Hiding those would strand them; listing them without saying so
 *   would be worse, because re-finishing one POSTs the same user_key, which the
 *   server answers as a duplicate and the drain records as 'sent' -- so any
 *   reading edited on the second pass is dropped without a word. The screen can
 *   at least warn with this.
 *
 * work_started is 'YYYY-MM-DD HH:mm:ss', so ordering it as text is ordering it
 * chronologically. id breaks ties, only so the order is stable across calls.
 */
export async function listDrafts(): Promise<DraftSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT s.id, s.utc_url, s.work_started, c.utc_name, c.unit_name,
            o.status AS outbox_status
       FROM session s
       LEFT JOIN collection c ON c.utc_url = s.utc_url
       LEFT JOIN outbox o ON o.session_id = s.id
      WHERE s.status = 'draft'
      ORDER BY s.work_started DESC, s.id`
  );
  return rows.map((r) => ({
    id: r.id,
    utcUrl: r.utc_url,
    utcName: r.utc_name ?? null,
    unitName: r.unit_name ?? null,
    workStarted: r.work_started,
    outboxStatus: r.outbox_status ?? null,
  }));
}

/**
 * Which downloaded lists have a session that has not reached the server yet,
 * keyed by collection url.
 *
 * Shown beside a list, never subtracted from a due count: the count reflects
 * what the server knows, and a phone-side adjustment would make it correspond
 * to nothing auditable.
 */
export async function listUnsentByUtc(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT s.utc_url, o.status
       FROM outbox o
       JOIN session s ON s.id = o.session_id
      WHERE o.status != 'sent'`
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.utc_url] = r.status;
  return out;
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
  const types = Object.fromEntries((await getTests(s.utc_url)).map((t) => [t.slug, t.type]));

  const values: Record<string, DraftValue> = {};
  for (const r of rows) {
    values[r.slug] = {
      value: decode(r.value, types[r.slug]),
      comment: r.comment ?? undefined,
    };
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

import type { ScheduleRow } from '../schedule/summary';
import { getDb } from './schema';

/**
 * Replace the whole schedule table.
 *
 * Rewrite rather than merge: scheduling is a snapshot of one moment, and a
 * half-updated table would mix two. Every row carries the same refreshed_at,
 * which is what the dashboard's staleness line reports.
 */
export async function saveSchedule(rows: ScheduleRow[], refreshedAt: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM schedule`);
    for (const r of rows) {
      await db.runAsync(
        `INSERT INTO schedule (utc_url, unit_url, unit_name, site_url, site_name,
                               frequency_url, frequency_name, due_date, refreshed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.utcUrl, r.unitUrl, r.unitName, r.siteUrl, r.siteName,
          r.frequencyUrl, r.frequencyName, r.dueDate, refreshedAt,
        ]
      );
    }
  });
}

/**
 * Write ONE schedule row, leaving every other row alone.
 *
 * Deliberately not a mode of saveSchedule, because the two answer different
 * questions and the difference is the whole point. A refresh is a whole-table
 * SNAPSHOT: every row was read in the same pass, so replacing the table is what
 * keeps them one moment. A download is one row learned EARLY -- the schedule
 * data for the list the user just pulled down, known before the next refresh
 * happens -- and it must not disturb rows it knows nothing about. Folding them
 * into one function would either make a refresh leave stale rows behind or make
 * a download wipe the table down to a single list.
 *
 * `refreshedAt` is when the data behind this row was READ from the server, not
 * when it was written, so the dashboard's staleness line stays true.
 *
 * utc_url is the primary key, so downloading the same list twice replaces its
 * row rather than duplicating it, and a later refresh overwrites it in turn.
 */
export async function upsertScheduleRow(r: ScheduleRow, refreshedAt: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO schedule (utc_url, unit_url, unit_name, site_url, site_name,
                                      frequency_url, frequency_name, due_date, refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.utcUrl, r.unitUrl, r.unitName, r.siteUrl, r.siteName,
      r.frequencyUrl, r.frequencyName, r.dueDate, refreshedAt,
    ]
  );
}

export async function listSchedule(): Promise<ScheduleRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(`SELECT * FROM schedule`);
  return rows.map((r) => ({
    utcUrl: r.utc_url,
    unitUrl: r.unit_url,
    unitName: r.unit_name,
    siteUrl: r.site_url,
    siteName: r.site_name,
    frequencyUrl: r.frequency_url,
    frequencyName: r.frequency_name,
    dueDate: r.due_date,
  }));
}

/**
 * When the schedule was last refreshed, or null if it never has been.
 *
 * The OLDEST row, not an arbitrary one. Rows no longer necessarily share a
 * refreshed_at now that upsertScheduleRow writes one row at a time: a `LIMIT 1`
 * with no ORDER BY would report whichever row SQLite scanned first, and taking
 * the newest would let a single just-downloaded list make a week-old dashboard
 * read "synced just now". The oldest row is the honest answer to "how stale can
 * anything on this screen be?".
 *
 * MIN over the stamps is chronological because every writer stores an ISO-8601
 * UTC string, where lexicographic and chronological order coincide.
 */
export async function lastRefreshedAt(): Promise<string | null> {
  const db = await getDb();
  // MIN over an empty table yields one row holding NULL, which falls through to
  // null -- the same "never synced" the dashboard already renders.
  const r = await db.getFirstAsync<any>(
    `SELECT MIN(refreshed_at) AS refreshed_at FROM schedule`
  );
  return r?.refreshed_at ?? null;
}

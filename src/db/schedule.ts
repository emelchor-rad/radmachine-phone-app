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

/** When the schedule was last refreshed, or null if it never has been. */
export async function lastRefreshedAt(): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<any>(`SELECT refreshed_at FROM schedule LIMIT 1`);
  return r?.refreshed_at ?? null;
}

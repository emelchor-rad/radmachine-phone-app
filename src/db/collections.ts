import type { TestDef } from '../api/types';
import { getDb } from './schema';

export type Collection = {
  utcUrl: string;
  utcName: string;
  unitName: string;
  listUrl: string;
  downloadedAt: string;
};

export async function saveCollection(c: Collection, tests: TestDef[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT OR REPLACE INTO collection (utc_url, utc_name, unit_name, list_url, downloaded_at)
       VALUES (?, ?, ?, ?, ?)`,
      [c.utcUrl, c.utcName, c.unitName, c.listUrl, c.downloadedAt]
    );
    await db.runAsync(`DELETE FROM test WHERE utc_url = ?`, [c.utcUrl]);
    for (const t of tests) {
      await db.runAsync(
        `INSERT INTO test (utc_url, slug, name, type, ord, sublist) VALUES (?, ?, ?, ?, ?, ?)`,
        [c.utcUrl, t.slug, t.name, t.type, t.order, t.sublist]
      );
    }
  });
}

export async function listCollections(): Promise<Collection[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(`SELECT * FROM collection ORDER BY utc_name`);
  return rows.map((r) => ({
    utcUrl: r.utc_url,
    utcName: r.utc_name,
    unitName: r.unit_name,
    listUrl: r.list_url,
    downloadedAt: r.downloaded_at,
  }));
}

export async function getTests(utcUrl: string): Promise<TestDef[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT * FROM test WHERE utc_url = ? ORDER BY ord`,
    [utcUrl]
  );
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    type: r.type,
    order: r.ord,
    sublist: r.sublist,
  }));
}

import type { TestCriteria, TestDef } from '../api/types';
import { getDb } from './schema';

export type Collection = {
  utcUrl: string;
  utcName: string;
  unitName: string;
  listUrl: string;
  downloadedAt: string;
};

function joinMc(choices: string[] | undefined): string | null {
  if (!choices?.length) return null;
  return choices.join(',');
}

function splitMc(raw: string | null | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function criteriaToRow(c?: TestCriteria): (string | number | null)[] {
  if (!c) return [null, null, null, null, null, null, null, null, null];
  return [
    c.refValue,
    c.refType,
    c.tolType,
    c.actLow,
    c.tolLow,
    c.tolHigh,
    c.actHigh,
    joinMc(c.mcPassChoices),
    joinMc(c.mcTolChoices),
  ];
}

function rowToCriteria(r: any): TestCriteria | undefined {
  if (r.tol_type === 'multchoice') {
    const mcPassChoices = splitMc(r.tol_mc_pass);
    const mcTolChoices = splitMc(r.tol_mc_tol);
    if (!mcPassChoices?.length && !mcTolChoices?.length) return undefined;
    return {
      refValue: r.ref_value ?? null,
      refType: r.ref_type === 'boolean' ? 'boolean' : 'numerical',
      tolType: 'multchoice',
      actLow: null,
      tolLow: null,
      tolHigh: null,
      actHigh: null,
      mcPassChoices,
      mcTolChoices,
    };
  }

  if (r.ref_value === null || r.ref_value === undefined) return undefined;

  const tolType =
    r.tol_type === 'percent'
      ? 'percent'
      : r.tol_type === 'absolute'
        ? 'absolute'
        : null;

  return {
    refValue: r.ref_value,
    refType: r.ref_type === 'boolean' ? 'boolean' : 'numerical',
    tolType,
    actLow: r.tol_act_low ?? null,
    tolLow: r.tol_tol_low ?? null,
    tolHigh: r.tol_tol_high ?? null,
    actHigh: r.tol_act_high ?? null,
  };
}

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
      const [refValue, refType, tolType, actLow, tolLow, tolHigh, actHigh, mcPass, mcTol] =
        criteriaToRow(t.criteria);
      await db.runAsync(
        `INSERT INTO test (utc_url, slug, name, type, ord, sublist,
                           ref_value, ref_type, tol_type,
                           tol_act_low, tol_tol_low, tol_tol_high, tol_act_high,
                           tol_mc_pass, tol_mc_tol)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          c.utcUrl,
          t.slug,
          t.name,
          t.type,
          t.order,
          t.sublist,
          refValue,
          refType,
          tolType,
          actLow,
          tolLow,
          tolHigh,
          actHigh,
          mcPass,
          mcTol,
        ]
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
  return rows.map((r) => {
    const criteria = rowToCriteria(r);
    return {
      slug: r.slug,
      name: r.name,
      type: r.type,
      order: r.ord,
      sublist: r.sublist,
      ...(criteria ? { criteria } : {}),
    };
  });
}

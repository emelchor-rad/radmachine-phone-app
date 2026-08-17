import { RadClient } from '../api/client';
import { listCollections } from '../db/collections';
import { saveSchedule } from '../db/schedule';
import { loadCredentials } from '../secure/credentials';
import type { ScheduleRow } from '../schedule/summary';

type Named = { url: string; name: string; site?: string | null };

/**
 * Turn one API pass into schedule rows for the collections we hold.
 *
 * Pure, so the resolution rules are testable. A collection whose unit cannot
 * be resolved is dropped rather than guessed at -- a card attributing a list
 * to the wrong machine is worse than a missing row. An unresolvable frequency
 * only costs the grouping, so the row survives as ad hoc.
 */
export function buildScheduleRows(
  utcs: any[],
  units: Named[],
  sites: Named[],
  frequencies: Named[],
  downloaded: Set<string>
): ScheduleRow[] {
  const unitBy = new Map(units.map((u) => [u.url, u]));
  const siteBy = new Map(sites.map((s) => [s.url, s]));
  const freqBy = new Map(frequencies.map((f) => [f.url, f]));

  const out: ScheduleRow[] = [];
  for (const utc of utcs) {
    if (!downloaded.has(utc.url)) continue;
    const unit = unitBy.get(utc.unit);
    if (!unit) continue;
    const site = unit.site ? siteBy.get(unit.site) : undefined;
    const freq = utc.frequency ? freqBy.get(utc.frequency) : undefined;
    out.push({
      utcUrl: utc.url,
      unitUrl: unit.url,
      unitName: unit.name,
      siteUrl: site?.url ?? null,
      siteName: site?.name ?? null,
      frequencyUrl: freq?.url ?? null,
      frequencyName: freq?.name ?? null,
      dueDate: utc.due_date ?? null,
    });
  }
  return out;
}

/**
 * Refresh the schedule for every downloaded collection, in one pass.
 *
 * Keeping scheduling apart from definitions means refreshing dates costs a few
 * paginated requests rather than a full re-download of every test in every
 * list. limit=200 matters: unittestcollections pages at 10 by default.
 *
 * Returns how many rows were stored, or null if there was nothing to do.
 */
export async function refreshSchedule(nowIso: string): Promise<number | null> {
  const creds = await loadCredentials();
  if (!creds) return null;

  const collections = await listCollections();
  if (collections.length === 0) return null;
  const downloaded = new Set(collections.map((c) => c.utcUrl));

  const client = new RadClient(creds.baseUrl, creds.token);
  const [utcs, units, sites, frequencies] = await Promise.all([
    client.getAll<any>('/qa/unittestcollections/', { limit: '200' }),
    client.getAll<Named>('/units/units/', { limit: '200' }),
    client.getAll<Named>('/units/sites/', { limit: '200' }),
    client.getAll<Named>('/qa/frequencies/', { limit: '200' }),
  ]);

  const rows = buildScheduleRows(utcs, units, sites, frequencies, downloaded);
  await saveSchedule(rows, nowIso);
  return rows.length;
}

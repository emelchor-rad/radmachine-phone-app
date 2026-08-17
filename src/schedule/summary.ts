import { dueState } from './due';

/** One downloaded collection's scheduling metadata, as stored locally. */
export type ScheduleRow = {
  utcUrl: string;
  unitUrl: string;
  unitName: string;
  siteUrl: string | null;
  siteName: string | null;
  frequencyUrl: string | null;
  frequencyName: string | null; // null = ad hoc
  dueDate: string | null;
};

export type FrequencyRow = { frequencyName: string; total: number; overdue: number };

export type UnitCard = {
  unitUrl: string;
  unitName: string;
  siteName: string | null;
  dueTotal: number;
  overdueTotal: number;
  rows: FrequencyRow[];
};

/** Sentinel for "no filter applied". */
export const ALL = '__all__';
/** Sentinel for the ad-hoc bucket -- collections with no frequency. */
export const NO_FREQUENCY = '__none__';

/** How the no-frequency bucket is labelled to the user. */
export const AD_HOC = 'Ad hoc';

const label = (r: ScheduleRow) => r.frequencyName ?? AD_HOC;

/**
 * Turn a frequency row's *display label* into the value `filterSchedule` wants.
 *
 * buildUnitCards emits labels for people to read; filterSchedule matches on
 * sentinels. Without this translation, tapping the ad-hoc row on the dashboard
 * shows a count and then opens an empty list -- it does not fail, it just
 * quietly does the wrong thing. Keeping the mapping here means the label can
 * change in one place without silently breaking the filter.
 */
export function frequencyFilterFor(label: string): string {
  return label === AD_HOC ? NO_FREQUENCY : label;
}

/**
 * Group downloaded collections into one card per unit.
 *
 * Only frequencies the user actually downloaded something for get a row:
 * RadMachine can show "Annually 0" because it knows every schedule, but this
 * app knows only what was downloaded, so a permanent zero would be
 * misinformation rather than information.
 */
export function buildUnitCards(rows: ScheduleRow[], now: Date, siteUrl: string): UnitCard[] {
  const kept = siteUrl === ALL ? rows : rows.filter((r) => r.siteUrl === siteUrl);

  const byUnit = new Map<string, ScheduleRow[]>();
  for (const r of kept) {
    const list = byUnit.get(r.unitUrl);
    if (list) list.push(r);
    else byUnit.set(r.unitUrl, [r]);
  }

  const cards: UnitCard[] = [];
  for (const [unitUrl, unitRows] of byUnit) {
    const byFreq = new Map<string, ScheduleRow[]>();
    for (const r of unitRows) {
      const k = label(r);
      const list = byFreq.get(k);
      if (list) list.push(r);
      else byFreq.set(k, [r]);
    }

    const freqRows: FrequencyRow[] = [];
    for (const [frequencyName, group] of byFreq) {
      let total = 0;
      let overdue = 0;
      for (const r of group) {
        const s = dueState(r.dueDate, now);
        if (s === 'overdue') {
          overdue += 1;
          total += 1;
        } else if (s === 'due') {
          total += 1;
        }
      }
      freqRows.push({ frequencyName, total, overdue });
    }
    freqRows.sort((a, b) => a.frequencyName.localeCompare(b.frequencyName));

    cards.push({
      unitUrl,
      unitName: unitRows[0].unitName,
      siteName: unitRows[0].siteName,
      dueTotal: freqRows.reduce((n, r) => n + r.total, 0),
      overdueTotal: freqRows.reduce((n, r) => n + r.overdue, 0),
      rows: freqRows,
    });
  }

  cards.sort((a, b) => a.unitName.localeCompare(b.unitName));
  return cards;
}

/** The library's filters. Both accept ALL; frequency also accepts NO_FREQUENCY. */
export function filterSchedule(
  rows: ScheduleRow[],
  unitUrl: string,
  frequencyName: string
): ScheduleRow[] {
  return rows.filter((r) => {
    if (unitUrl !== ALL && r.unitUrl !== unitUrl) return false;
    if (frequencyName === ALL) return true;
    if (frequencyName === NO_FREQUENCY) return r.frequencyName === null;
    return r.frequencyName === frequencyName;
  });
}

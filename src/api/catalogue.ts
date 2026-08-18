/**
 * Pure data shaping for the catalogue screen.
 *
 * Everything here is a function of its arguments: no React, no network, no
 * database. It lives apart from app/index.tsx because the two things it decides
 * are the two things that are easy to get silently wrong -- which collections
 * are safe to download, and what the filter sentinels mean -- and both deserve
 * tests rather than a hand check on a phone.
 */

import type { ScheduleRow } from '../schedule/summary';

/**
 * Filter sentinels.
 *
 * Real filter values are API urls, so neither of these can collide with one.
 * NO_FREQ is not cosmetic: a large share of the tenant's collections have no
 * frequency at all, and without an explicit bucket for them they are
 * unreachable from the frequency dropdown.
 */
export const ALL = '__all__';
export const NO_FREQ = '__none__';

/** The fields of a UnitTestCollection this screen reads. */
export type RawCollection = {
  url: string;
  name: string;
  unit: string | null;
  frequency: string | null;
  /** Url of the django ContentType naming what object_id points at. */
  content_type: string | null;
  object_id: number;
  /**
   * When this collection is next due, as the UTC payload reports it.
   *
   * Nothing on the browse screen shows it. It is carried through so that
   * downloading a list can write its own schedule row from the payload already
   * in hand -- see scheduleRowFor below. Optional because a serializer that
   * omits it must degrade to "no due date", not to a broken row.
   */
  due_date?: string | null;
};

/**
 * A /units/units/, /units/sites/ or /qa/frequencies/ row, reduced to what is used.
 *
 * `site` only ever appears on a unit, and is only read when a download writes
 * its own schedule row.
 */
export type RawNamed = { url: string; name: string; site?: string | null };

/** A /contenttypes/contenttypes/ row. */
export type RawContentType = { url: string; app_label?: string; model?: string };

/** Structurally the Dropdown's Option, without src/api importing from src/ui. */
export type FilterOption = { value: string; label: string };

/** A collection with its unit and frequency already resolved to text. */
export type CatalogueRow = RawCollection & { unitLabel: string; freqLabel: string };

/** How many collections were withheld, and why. */
export type Hidden = {
  /** Content type resolved to a test list CYCLE. */
  cycles: number;
  /** Content type could not be resolved at all. */
  unresolved: number;
};

export type CatalogueView = {
  /** Every collection safe to download: content type resolved to a test list. */
  rows: CatalogueRow[];
  /** `rows` narrowed by the current unit and frequency selection. */
  visible: CatalogueRow[];
  unitOptions: FilterOption[];
  freqOptions: FilterOption[];
  hidden: Hidden;
  /** A sentence for the user, or '' when nothing was withheld. */
  hiddenNotice: string;
};

export type CatalogueInput = {
  collections: RawCollection[];
  units: RawNamed[];
  frequencies: RawNamed[];
  contentTypes: RawContentType[];
  unitFilter: string;
  freqFilter: string;
  /**
   * Free text typed by the user, matched against the collection name.
   *
   * A THIRD filter, intersected with the two dropdowns -- never a replacement
   * for them. A search that ignored the selected unit would quietly show a list
   * belonging to another machine under a unit-filtered heading, which is the
   * same wrong-list-in-a-bunker failure the content type check exists to
   * prevent, arrived at through the keyboard.
   *
   * Optional, and absent means "no search": a screen that has not rendered the
   * box yet must behave exactly as it did before.
   */
  search?: string;
};

function byUrl(rows: RawNamed[]): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [r.url, r.name]));
}

export const TEST_LIST = 'qa.testlist';
export const TEST_LIST_CYCLE = 'qa.testlistcycle';

/**
 * url -> 'app_label.model', e.g. '.../contenttypes/2/' -> 'qa.testlist'.
 *
 * The app label is carried deliberately rather than matching on the model name
 * alone: a model named `testlist` in some other installed app would otherwise
 * map to a downloadable row and be fetched from /qa/testlists/, which is the
 * same wrong-list outcome by another route.
 *
 * A row missing either field maps to nothing, so its collections fall through to
 * `unresolved` instead of being guessed at.
 */
export function contentTypeIds(types: RawContentType[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of types) {
    if (t && t.url && t.app_label && t.model) out[t.url] = `${t.app_label}.${t.model}`;
  }
  return out;
}

/**
 * Split collections into the downloadable ones and a tally of the rest.
 *
 * A UnitTestCollection points at its target through a GENERIC foreign key:
 * object_id plus content_type. The content type is either qa.testlist or
 * qa.testlistcycle, and the screen builds the definition url as
 * /qa/testlists/<object_id>/. For a cycle that object_id is a CYCLE primary
 * key, and that url will very often resolve to a real but completely unrelated
 * test list -- which downloads fine, under the cycle's name. The physicist then
 * fills in the wrong worksheet in a bunker and finds out hours later, when the
 * POST is rejected, if at all.
 *
 * Resolve by MODEL NAME, never by the content type's integer pk: the pk is
 * assigned per tenant (it happens to be 2 and 22 on the measured instance) and
 * hardcoding it would be wrong on the next one.
 *
 * An unresolvable content type counts as NOT downloadable. Assuming a plain test
 * list when we cannot tell is precisely the guess that causes the bug.
 */
export function splitByContentType(
  cols: RawCollection[],
  ids: Record<string, string>
): { lists: RawCollection[]; hidden: Hidden } {
  const lists: RawCollection[] = [];
  const hidden: Hidden = { cycles: 0, unresolved: 0 };
  for (const c of cols) {
    const id = c.content_type ? ids[c.content_type] : undefined;
    if (id === TEST_LIST) lists.push(c);
    else if (id === TEST_LIST_CYCLE) hidden.cycles++;
    else hidden.unresolved++;
  }
  return { lists, hidden };
}

/**
 * Where a collection's test list definition lives.
 *
 * Only ever call this with a row that came out of buildCatalogue. object_id is
 * one half of a generic foreign key, so it is only a TEST LIST pk when the
 * content type said so; for a cycle it is a cycle pk and this url resolves to an
 * unrelated list that downloads perfectly happily.
 */
export function definitionUrl(row: CatalogueRow, baseUrl: string): string {
  return `${baseUrl}/qa/testlists/${row.object_id}/`;
}

/** The line the user reads when something was withheld. '' when nothing was. */
export function hiddenNotice(h: Hidden): string {
  const parts: string[] = [];
  if (h.cycles) {
    parts.push(
      `${h.cycles} ${h.cycles === 1 ? 'cycle' : 'cycles'} hidden — cycles are not supported yet`
    );
  }
  if (h.unresolved) {
    parts.push(
      `${h.unresolved} ${h.unresolved === 1 ? 'collection' : 'collections'} hidden — ` +
        'content type unknown, so the test list cannot be identified safely'
    );
  }
  return parts.length ? `${parts.join('. ')}.` : '';
}

export function unitLabelFor(url: string | null, names: Record<string, string>): string {
  return (url && names[url]) || (url ? 'Unknown unit' : 'No unit');
}

export function freqLabelFor(url: string | null, names: Record<string, string>): string {
  return url ? names[url] || 'Unknown frequency' : 'ad hoc';
}

/**
 * Does this row's name match what the user typed?
 *
 * Case-insensitive substring, on the name ALONE -- the one string the row
 * displays as its identity. Matching the unit or frequency label too would make
 * typing a machine name silently widen the unit dropdown's selection, which is
 * the opposite of what the dropdown was just set to.
 *
 * Trimmed, because a phone keyboard appends a space after a word completion and
 * an untrimmed query would empty the list on a search the user considers
 * finished. Empty or absent matches everything: the box starts empty, and a
 * screen with no search box at all must behave as it did before.
 */
export function matchesSearch(row: CatalogueRow, search: string | undefined): boolean {
  const q = (search ?? '').trim().toLowerCase();
  if (!q) return true;
  return row.name.toLowerCase().includes(q);
}

/**
 * The schedule row a just-downloaded collection deserves, from the browse
 * payload alone.
 *
 * The Downloaded tab renders the SCHEDULE table, not the collection table, so a
 * list downloaded right now has nothing to show there until refreshSchedule()
 * next runs -- and that only happens on a connectivity or app-foreground event.
 * Browse has already fetched every field a schedule row needs, so the download
 * writes the row itself and the list appears at once, offline, with no extra
 * request.
 *
 * Deliberately mirrors buildScheduleRows in src/sync/refresh.ts field for field,
 * INCLUDING its refusals: an unresolvable unit returns null rather than a row
 * attributing a list to the wrong machine, and an unresolvable frequency costs
 * only the grouping. A test pins the two functions together, because the point
 * of the parity is that the next refresh rewrites this row with the same values
 * instead of visibly changing it under the user.
 */
export function scheduleRowFor(
  row: RawCollection,
  units: RawNamed[],
  sites: RawNamed[],
  frequencies: RawNamed[]
): ScheduleRow | null {
  const unit = units.find((u) => u.url === row.unit);
  if (!unit) return null;
  const site = unit.site ? sites.find((s) => s.url === unit.site) : undefined;
  const freq = row.frequency ? frequencies.find((f) => f.url === row.frequency) : undefined;
  return {
    utcUrl: row.url,
    unitUrl: unit.url,
    unitName: unit.name,
    siteUrl: site?.url ?? null,
    siteName: site?.name ?? null,
    frequencyUrl: freq?.url ?? null,
    frequencyName: freq?.name ?? null,
    dueDate: row.due_date ?? null,
  };
}

export function buildCatalogue(input: CatalogueInput): CatalogueView {
  const unitNames = byUrl(input.units);
  const freqNames = byUrl(input.frequencies);
  const { lists, hidden } = splitByContentType(
    input.collections,
    contentTypeIds(input.contentTypes)
  );

  const rows: CatalogueRow[] = lists.map((c) => ({
    ...c,
    unitLabel: unitLabelFor(c.unit, unitNames),
    freqLabel: freqLabelFor(c.frequency, freqNames),
  }));

  // Both dropdowns are built from `rows`, not from every collection fetched:
  // offering a unit whose only collection was hidden would show "0 of N" and
  // read as breakage. Units with nothing scheduled on them are left out for the
  // same reason -- the instance has plenty, and they are pure noise.
  //
  // A collection with a NULL unit gets no option of its own and is reachable
  // only through "All units"; that is the pre-existing behaviour, kept.
  const unitUrls = [...new Set(rows.map((r) => r.unit).filter(Boolean) as string[])];
  const unitOptions: FilterOption[] = [
    { value: ALL, label: `All units (${unitUrls.length})` },
    ...unitUrls
      .map((url) => ({ value: url, label: unitLabelFor(url, unitNames) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  const freqUrls = [...new Set(rows.map((r) => r.frequency).filter(Boolean) as string[])];
  const adHoc = rows.filter((r) => !r.frequency).length;
  const freqOptions: FilterOption[] = [
    { value: ALL, label: 'All frequencies' },
    { value: NO_FREQ, label: `No frequency (ad hoc) (${adHoc})` },
    ...freqUrls
      .map((url) => ({ value: url, label: freqLabelFor(url, freqNames) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  // Search narrows `visible` only. `rows` and both option lists stay built from
  // everything downloadable, so units do not vanish from the dropdown as the
  // user types and the "N of M" line keeps meaning "shown of available".
  const visible = rows.filter((r) => {
    if (!matchesSearch(r, input.search)) return false;
    if (input.unitFilter !== ALL && r.unit !== input.unitFilter) return false;
    if (input.freqFilter === ALL) return true;
    if (input.freqFilter === NO_FREQ) return !r.frequency;
    return r.frequency === input.freqFilter;
  });

  return {
    rows,
    visible,
    unitOptions,
    freqOptions,
    hidden,
    hiddenNotice: hiddenNotice(hidden),
  };
}

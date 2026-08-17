/**
 * Pure data shaping for the catalogue screen.
 *
 * Everything here is a function of its arguments: no React, no network, no
 * database. It lives apart from app/index.tsx because the two things it decides
 * are the two things that are easy to get silently wrong -- which collections
 * are safe to download, and what the filter sentinels mean -- and both deserve
 * tests rather than a hand check on a phone.
 */

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
};

/** A /units/units/ or /qa/frequencies/ row, reduced to what is used. */
export type RawNamed = { url: string; name: string };

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
};

function byUrl(rows: RawNamed[]): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [r.url, r.name]));
}

/**
 * url -> django model name, e.g. '.../contenttypes/2/' -> 'testlist'.
 *
 * Rows missing either field are left out, so they fall through to `unresolved`
 * rather than being guessed at.
 */
export function contentModels(types: RawContentType[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of types) {
    if (t && t.url && t.model) out[t.url] = t.model;
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
  models: Record<string, string>
): { lists: RawCollection[]; hidden: Hidden } {
  const lists: RawCollection[] = [];
  const hidden: Hidden = { cycles: 0, unresolved: 0 };
  for (const c of cols) {
    const model = c.content_type ? models[c.content_type] : undefined;
    if (model === 'testlist') lists.push(c);
    else if (model === 'testlistcycle') hidden.cycles++;
    else hidden.unresolved++;
  }
  return { lists, hidden };
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
      `${h.unresolved} hidden — content type unknown, so the test list cannot be identified safely`
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

export function buildCatalogue(input: CatalogueInput): CatalogueView {
  const unitNames = byUrl(input.units);
  const freqNames = byUrl(input.frequencies);
  const { lists, hidden } = splitByContentType(
    input.collections,
    contentModels(input.contentTypes)
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

  const visible = rows.filter((r) => {
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

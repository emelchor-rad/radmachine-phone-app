import type { RadClient } from './client';
import type { TestCriteria, TestDef } from './types';

type RawRef = { type?: string; value?: number | null };
type RawTol = {
  type?: string;
  act_low?: number | null;
  tol_low?: number | null;
  tol_high?: number | null;
  act_high?: number | null;
  mc_pass_choices?: string | null;
  mc_tol_choices?: string | null;
};

type RawUti = {
  test: string;
  reference: string | RawRef | null;
  tolerance: string | RawTol | null;
};

/** RadMachine registers the list endpoint as unittestinfos (see radmachine-api-examples). */
const UTI_LIST_PATHS = ['/qa/unittestinfos/', '/qa/unittestinfo/'];

/** Trailing numeric id from a RadMachine unit or test url. */
function idFromUrl(url: string): string | null {
  const m = url.match(/\/(\d+)\/?$/);
  return m ? m[1] : null;
}

/** API url from a hyperlinked field or an embedded resource object. */
function resourceUrl(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (raw && typeof raw === 'object') {
    const url = (raw as Record<string, unknown>).url;
    if (typeof url === 'string' && url.trim()) return url.trim();
  }
  return null;
}

function isEmbeddedRef(raw: unknown): raw is RawRef {
  return !!raw && typeof raw === 'object' && 'value' in (raw as RawRef);
}

function isEmbeddedTol(raw: unknown): raw is RawTol {
  return !!raw && typeof raw === 'object' && 'type' in (raw as RawTol);
}

function normalizeUti(raw: Record<string, unknown>): RawUti | null {
  const test = resourceUrl(raw.test);
  if (!test) return null;
  return {
    test,
    reference: (raw.reference ?? null) as RawUti['reference'],
    tolerance: (raw.tolerance ?? null) as RawUti['tolerance'],
  };
}

function resolveRef(
  raw: string | RawRef | null,
  refs: Map<string, RawRef>
): RawRef | undefined {
  if (!raw) return undefined;
  if (isEmbeddedRef(raw)) return raw;
  return refs.get(raw);
}

function resolveTol(
  raw: string | RawTol | null,
  tols: Map<string, RawTol>
): RawTol | undefined {
  if (!raw) return undefined;
  if (isEmbeddedTol(raw)) return raw;
  return tols.get(raw);
}

/** Compare API urls that may differ only by trailing slash or scheme. */
export function normalizeApiUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.origin}${u.pathname}`.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
}

/** Split QATrack's comma-separated multchoice lists. */
export function parseMcChoices(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Turn one UTI's linked reference and tolerance into storable criteria.
 *
 * Pure so the mapping rules are testable without a device.
 */
export function criteriaFromUti(
  uti: RawUti,
  refs: Map<string, RawRef>,
  tols: Map<string, RawTol>
): TestCriteria | null {
  const tol = resolveTol(uti.tolerance, tols);
  const ref = resolveRef(uti.reference, refs);

  if (tol?.type === 'multchoice') {
    const mcPassChoices = parseMcChoices(tol.mc_pass_choices);
    const mcTolChoices = parseMcChoices(tol.mc_tol_choices);
    if (mcPassChoices.length === 0 && mcTolChoices.length === 0) return null;
    return {
      refValue: ref?.value ?? null,
      refType: ref?.type === 'boolean' ? 'boolean' : 'numerical',
      tolType: 'multchoice',
      actLow: null,
      tolLow: null,
      tolHigh: null,
      actHigh: null,
      mcPassChoices,
      mcTolChoices,
    };
  }

  if (!uti.reference || !ref || ref.value === null || ref.value === undefined) return null;

  const out: TestCriteria = {
    refValue: ref.value,
    refType: ref.type === 'boolean' ? 'boolean' : 'numerical',
    tolType: null,
    actLow: null,
    tolLow: null,
    tolHigh: null,
    actHigh: null,
  };

  if (tol?.type === 'absolute' || tol?.type === 'percent') {
    out.tolType = tol.type;
    out.actLow = tol.act_low ?? null;
    out.tolLow = tol.tol_low ?? null;
    out.tolHigh = tol.tol_high ?? null;
    out.actHigh = tol.act_high ?? null;
  }

  return out;
}

type UtiLookup = {
  byExactUrl: Map<string, RawUti>;
  byNormUrl: Map<string, RawUti>;
  byTestId: Map<string, RawUti>;
  bySlug: Map<string, RawUti>;
};

function findUti(lookup: UtiLookup, testUrl: string, slug: string): RawUti | undefined {
  return (
    lookup.byExactUrl.get(testUrl) ??
    lookup.byNormUrl.get(normalizeApiUrl(testUrl)) ??
    (() => {
      const id = idFromUrl(testUrl);
      return id ? lookup.byTestId.get(id) : undefined;
    })() ??
    lookup.bySlug.get(slug)
  );
}

async function fetchUnitUtis(client: RadClient, unitUrl: string): Promise<RawUti[]> {
  const unitId = idFromUrl(unitUrl);
  const paramSets: Record<string, string>[] = [];
  if (unitId) paramSets.push({ unit: unitId, limit: '500' });
  paramSets.push({ unit: unitUrl, limit: '500' });

  for (const path of UTI_LIST_PATHS) {
    for (const params of paramSets) {
      try {
        const rows = await client.getAll<Record<string, unknown>>(path, params);
        const utis = rows.map(normalizeUti).filter((u): u is RawUti => u !== null);
        if (utis.length > 0) return utis;
      } catch {
        // Try the next path/filter combination.
      }
    }
  }
  return [];
}

async function buildUtiLookup(
  client: RadClient,
  utis: RawUti[],
  tests: TestDef[]
): Promise<UtiLookup> {
  const byExactUrl = new Map<string, RawUti>();
  const byNormUrl = new Map<string, RawUti>();
  const byTestId = new Map<string, RawUti>();
  const bySlug = new Map<string, RawUti>();

  const uniqueTestUrls = new Set(utis.map((u) => u.test));
  for (const t of tests) {
    if (t.testUrl) uniqueTestUrls.add(t.testUrl);
  }

  const slugByNorm = new Map<string, string>();
  for (const t of tests) {
    if (t.slug && t.testUrl) slugByNorm.set(normalizeApiUrl(t.testUrl), t.slug);
  }

  await Promise.all(
    [...uniqueTestUrls].map(async (url) => {
      if (slugByNorm.has(normalizeApiUrl(url))) return;
      try {
        const raw = await client.get<{ slug?: string }>(url);
        if (raw.slug) slugByNorm.set(normalizeApiUrl(url), raw.slug);
      } catch {
        // Slug lookup is a fallback only.
      }
    })
  );

  for (const u of utis) {
    byExactUrl.set(u.test, u);
    byNormUrl.set(normalizeApiUrl(u.test), u);
    const testId = idFromUrl(u.test);
    if (testId) byTestId.set(testId, u);
    const slug = slugByNorm.get(normalizeApiUrl(u.test));
    if (slug) bySlug.set(slug, u);
  }

  return { byExactUrl, byNormUrl, byTestId, bySlug };
}

async function loadRefTolMaps(
  client: RadClient,
  utis: RawUti[]
): Promise<{ refs: Map<string, RawRef>; tols: Map<string, RawTol> }> {
  const refs = new Map<string, RawRef>();
  const tols = new Map<string, RawTol>();
  const refUrls = new Set<string>();
  const tolUrls = new Set<string>();

  for (const u of utis) {
    if (typeof u.reference === 'string') refUrls.add(u.reference);
    if (typeof u.tolerance === 'string') tolUrls.add(u.tolerance);
  }

  await Promise.all([
    ...[...refUrls].map(async (url) => {
      try {
        refs.set(url, await client.get<RawRef>(url));
      } catch {
        // One broken link must not drop criteria for every other test.
      }
    }),
    ...[...tolUrls].map(async (url) => {
      try {
        tols.set(url, await client.get<RawTol>(url));
      } catch {
        // Same rationale as references.
      }
    }),
  ]);

  return { refs, tols };
}

/**
 * Attach unit-specific reference and tolerance to each downloaded test.
 *
 * Criteria live on UnitTestInfo, not on the test list definition, so they are
 * fetched after flattening and keyed by the test's API url (with slug fallback).
 */
export async function attachCriteria(
  client: RadClient,
  unitUrl: string,
  tests: TestDef[]
): Promise<TestDef[]> {
  const withUrl = tests.filter((t): t is TestDef & { testUrl: string } => !!t.testUrl);
  if (withUrl.length === 0) return tests;

  const utis = await fetchUnitUtis(client, unitUrl);
  if (utis.length === 0) {
    return tests.map((t) => {
      if (!t.testUrl) return t;
      const { testUrl: _drop, ...rest } = t;
      return rest;
    });
  }

  const lookup = await buildUtiLookup(client, utis, tests);
  const { refs, tols } = await loadRefTolMaps(client, utis);

  return tests.map((t) => {
    if (!t.testUrl) return t;
    const uti = findUti(lookup, t.testUrl, t.slug);
    if (!uti) {
      const { testUrl: _drop, ...rest } = t;
      return rest;
    }
    const criteria = criteriaFromUti(uti, refs, tols) ?? undefined;
    const { testUrl: _drop, ...rest } = t;
    return criteria ? { ...rest, criteria } : rest;
  });
}

/** How many tests ended up with stored criteria — useful for download feedback. */
export function countWithCriteria(tests: TestDef[]): number {
  return tests.filter((t) => t.criteria).length;
}

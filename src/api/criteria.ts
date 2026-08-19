import type { RadClient } from './client';
import type { TestCriteria, TestDef } from './types';

type RawUti = {
  test: string;
  reference: string | null;
  tolerance: string | null;
};

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

/** Trailing numeric id from a RadMachine unit or test url. */
function idFromUrl(url: string): string | null {
  const m = url.match(/\/(\d+)\/?$/);
  return m ? m[1] : null;
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
  const tol = uti.tolerance ? tols.get(uti.tolerance) : undefined;
  const ref = uti.reference ? refs.get(uti.reference) : undefined;

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
  if (unitId) {
    const byId = await client.getAll<RawUti>('/qa/unittestinfo/', {
      unit: unitId,
      limit: '500',
    });
    if (byId.length > 0) return byId;
  }
  return client.getAll<RawUti>('/qa/unittestinfo/', {
    unit: unitUrl,
    limit: '500',
  });
}

async function buildUtiLookup(client: RadClient, utis: RawUti[]): Promise<UtiLookup> {
  const byExactUrl = new Map<string, RawUti>();
  const byNormUrl = new Map<string, RawUti>();
  const byTestId = new Map<string, RawUti>();
  const bySlug = new Map<string, RawUti>();

  const uniqueTestUrls = [...new Set(utis.map((u) => u.test))];
  const slugByNorm = new Map<string, string>();
  await Promise.all(
    uniqueTestUrls.map(async (url) => {
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

  const lookup = await buildUtiLookup(client, utis);

  const matched = withUrl
    .map((t) => findUti(lookup, t.testUrl, t.slug))
    .filter((u): u is RawUti => !!u);

  const refUrls = new Set<string>();
  const tolUrls = new Set<string>();
  for (const u of matched) {
    if (u.reference) refUrls.add(u.reference);
    if (u.tolerance) tolUrls.add(u.tolerance);
  }

  const refs = new Map<string, RawRef>();
  const tols = new Map<string, RawTol>();
  await Promise.all([
    ...[...refUrls].map(async (url) => {
      refs.set(url, await client.get<RawRef>(url));
    }),
    ...[...tolUrls].map(async (url) => {
      tols.set(url, await client.get<RawTol>(url));
    }),
  ]);

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

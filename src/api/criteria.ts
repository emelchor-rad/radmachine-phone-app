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

/**
 * Attach unit-specific reference and tolerance to each downloaded test.
 *
 * Criteria live on UnitTestInfo, not on the test list definition, so they are
 * fetched after flattening and keyed by the test's API url.
 */
export async function attachCriteria(
  client: RadClient,
  unitUrl: string,
  tests: TestDef[]
): Promise<TestDef[]> {
  const withUrl = tests.filter((t): t is TestDef & { testUrl: string } => !!t.testUrl);
  if (withUrl.length === 0) return tests;

  const testUrls = new Set(withUrl.map((t) => t.testUrl));
  const utis = (await client.getAll<RawUti>('/qa/unittestinfo/', {
    unit: unitUrl,
    limit: '200',
  })).filter((u) => testUrls.has(u.test));

  const refUrls = new Set<string>();
  const tolUrls = new Set<string>();
  for (const u of utis) {
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

  const byTest = new Map(utis.map((u) => [u.test, u]));

  return tests.map((t) => {
    if (!t.testUrl) return t;
    const uti = byTest.get(t.testUrl);
    if (!uti) {
      const { testUrl: _drop, ...rest } = t;
      return rest;
    }
    const criteria = criteriaFromUti(uti, refs, tols) ?? undefined;
    const { testUrl: _drop, ...rest } = t;
    return criteria ? { ...rest, criteria } : rest;
  });
}

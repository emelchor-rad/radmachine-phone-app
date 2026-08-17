import { useCallback, useMemo, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { RadClient } from '../src/api/client';
import { flattenTestList } from '../src/api/definitions';
import {
  ALL,
  buildCatalogue,
  definitionUrl,
  type CatalogueRow,
  type RawCollection,
  type RawContentType,
  type RawNamed,
} from '../src/api/catalogue';
import { listCollections, saveCollection, type Collection } from '../src/db/collections';
import { createSession, listDrafts, type DraftSummary } from '../src/db/sessions';
import { loadCredentials } from '../src/secure/credentials';
import { nowStamp } from '../src/sync/time';
import { Dropdown } from '../src/ui/Dropdown';

/** Everything one browse pass fetched, kept together. */
type Browsed = {
  collections: RawCollection[];
  units: RawNamed[];
  frequencies: RawNamed[];
  contentTypes: RawContentType[];
  /**
   * The instance these rows came from. object_id values and content type urls are
   * per-tenant, so rows browsed against one instance say nothing about another;
   * download() refuses rather than resolve them against new credentials.
   */
  baseUrl: string;
};

const EMPTY: Browsed = {
  collections: [],
  units: [],
  frequencies: [],
  contentTypes: [],
  baseUrl: '',
};

/**
 * How a draft names its worksheet.
 *
 * Both fields come from a LEFT JOIN, so both are null together when the
 * collection is no longer downloaded. One sentence about that is clearer than two
 * independent fallbacks reading "Unknown unit — list no longer downloaded", and
 * it says what to do: re-download and the worksheet fills in again, since the
 * readings are keyed on the session, not the definition.
 */
function draftTitle(d: DraftSummary): string {
  if (d.utcName === null && d.unitName === null) {
    return 'List no longer downloaded — download it again to see this worksheet';
  }
  return `${d.unitName ?? 'Unknown unit'} — ${d.utcName ?? 'Unknown list'}`;
}

export default function Catalogue() {
  const [local, setLocal] = useState<Collection[]>([]);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  // One object, not four states: the four arrays are only ever meaningful
  // together, and four setStates would let a render land between them.
  const [browsed, setBrowsed] = useState<Browsed>(EMPTY);
  const [unitFilter, setUnitFilter] = useState(ALL);
  const [freqFilter, setFreqFilter] = useState(ALL);
  const [msg, setMsg] = useState('');

  useFocusEffect(
    useCallback(() => {
      // Both are caught: a rejected query with no handler is an unhandled
      // rejection and an empty section, which reads exactly like "no drafts" --
      // the same silence this screen exists to remove.
      listCollections()
        .then(setLocal)
        .catch((e: any) => setMsg(`Could not read downloaded lists: ${e?.message ?? e}`));
      // Refreshed on focus, not just on mount, so a draft appears the instant
      // the user backs out of a worksheet -- which is the exact gesture that
      // used to strand it.
      listDrafts()
        .then(setDrafts)
        .catch((e: any) =>
          setMsg(`Could not read sessions in progress: ${e?.message ?? e}`)
        );
    }, [])
  );

  const browse = async () => {
    const creds = await loadCredentials();
    if (!creds) return router.push('/connect');
    setMsg('Loading...');
    // Browsing is the one screen action that needs the network, and being
    // offline is the normal state here -- a bare throw would surface as an
    // unhandled rejection instead of a message the physicist can read.
    try {
      const c = new RadClient(creds.baseUrl, creds.token);
      // getAll, not get: the API pages at 10 and the tenant has 336
      // collections across 32 units.
      //
      // limit=200 is a hint, not a requirement: the endpoints use DRF
      // limit/offset pagination, so it turns 34 round-trips into 2 on a phone.
      // If the server ignores or clamps it, getAll still follows `next`.
      const page = { limit: '200' };
      const [collections, units, frequencies, contentTypes] = await Promise.all([
        c.getAll<RawCollection>('/qa/unittestcollections/', page),
        c.getAll<RawNamed>('/units/units/', page),
        c.getAll<RawNamed>('/qa/frequencies/', page),
        // Needed to tell a test list from a test list cycle. Without it every
        // collection is unresolved, and buildCatalogue then shows none -- which
        // is the intended failure: refusing beats downloading the wrong list.
        c.getAll<RawContentType>('/contenttypes/contenttypes/', page),
      ]);
      setBrowsed({ collections, units, frequencies, contentTypes, baseUrl: creds.baseUrl });
      // A filter kept from a previous browse may name a unit that is no longer
      // in the list, which would read as "0 of 336" and look like breakage.
      setUnitFilter(ALL);
      setFreqFilter(ALL);
      setMsg('');
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const view = useMemo(
    () => buildCatalogue({ ...browsed, unitFilter, freqFilter }),
    [browsed, unitFilter, freqFilter]
  );

  const download = async (utc: CatalogueRow) => {
    const creds = await loadCredentials();
    if (!creds) return router.push('/connect');
    // The credentials can have changed since these rows were fetched -- connect
    // saves and routes straight back here, and this screen's focus effect does
    // not re-browse. Resolving a previous tenant's object_id against a new host
    // is the same wrong-list download by another route, so refuse it.
    if (creds.baseUrl !== browsed.baseUrl) {
      setBrowsed(EMPTY);
      setMsg('These results came from a different instance. Press Browse again.');
      return;
    }
    setMsg(`Downloading ${utc.name}...`);
    const c = new RadClient(creds.baseUrl, creds.token);
    try {
      // Safe only because this row came out of buildCatalogue, which keeps a
      // collection only when its content type resolved to qa.testlist.
      const listUrl = definitionUrl(utc, creds.baseUrl);
      const tests = await flattenTestList(listUrl, (u) => c.get<any>(u));
      await saveCollection(
        {
          utcUrl: utc.url,
          utcName: utc.name,
          // Already resolved during browse -- no extra round trip on a phone.
          unitName: utc.unitLabel,
          listUrl,
          downloadedAt: nowStamp(),
        },
        tests
      );
      setLocal(await listCollections());
      setMsg(`Saved ${tests.length} tests.`);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const startSession = async (col: Collection) => {
    const id = Crypto.randomUUID();
    try {
      await createSession(id, col.utcUrl, Crypto.randomUUID(), nowStamp());
    } catch (e: any) {
      // Without this a failed INSERT is an unhandled rejection and the tap looks
      // like it did nothing at all.
      setMsg(`Could not start a session: ${e?.message ?? e}`);
      return;
    }
    router.push(`/worksheet/${id}`);
  };

  /**
   * Drafts grouped by the list they belong to.
   *
   * "Start session" always mints a new session, so tapping it on a list that
   * already has an unfinished draft opens a BLANK sheet and splits the readings
   * across two sessions -- and backing out of a worksheet, the gesture this whole
   * section exists for, is exactly what leaves that draft behind. The offline row
   * offers Resume when one exists so the split has to be chosen, not stumbled
   * into.
   */
  const draftsByUtc = useMemo(() => {
    const m: Record<string, DraftSummary[]> = {};
    for (const d of drafts) (m[d.utcUrl] ??= []).push(d);
    return m;
  }, [drafts]);

  return (
    <View style={{ padding: 12, flex: 1 }}>
      {/* One row, so the lists below keep the screen on a small phone. */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flex: 1 }}>
          <Button title="Connection" onPress={() => router.push('/connect')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Queue" onPress={() => router.push('/queue')} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Browse" onPress={browse} />
        </View>
      </View>
      {msg ? <Text style={{ paddingVertical: 4 }}>{msg}</Text> : null}

      {/* Hidden entirely when there are none, so the normal screen is unchanged.
          The cap is a FRACTION of the screen, not a fixed 170dp: this block has
          flexBasis auto while the two sections below have flexBasis 0, so every
          dp it takes comes straight off them and a fixed cap would squeeze the
          download list to nothing on a 640dp phone. flexShrink on the list lets
          it yield inside the cap and scroll rather than clip. */}
      {drafts.length ? (
        <View style={{ marginTop: 8, maxHeight: '30%' }}>
          <Text style={{ fontWeight: 'bold' }}>Sessions in progress ({drafts.length})</Text>
          <FlatList
            style={{ flexShrink: 1 }}
            data={drafts}
            keyExtractor={(d) => d.id}
            renderItem={({ item }) => (
              <View style={{ paddingVertical: 6 }}>
                <Text>{draftTitle(item)}</Text>
                <Text style={{ color: '#666', fontSize: 12 }}>
                  Started {item.workStarted}
                </Text>
                {/* An outbox row on a session still marked draft means finishing
                    it half-failed. Re-finishing would POST the same user_key,
                    which comes back a duplicate and is recorded as sent, so any
                    edit made now would vanish. Say so. */}
                {item.outboxStatus ? (
                  <Text style={{ color: '#b00020', fontSize: 12 }}>
                    Already {item.outboxStatus} in the queue — check the Queue
                    screen before editing; changes may not be sent.
                  </Text>
                ) : null}
                <Button
                  title="Resume"
                  onPress={() => router.push(`/worksheet/${item.id}`)}
                />
              </View>
            )}
          />
        </View>
      ) : null}

      <View style={{ flex: 1, marginTop: 8 }}>
        <Text style={{ fontWeight: 'bold' }}>Available offline ({local.length})</Text>
        <FlatList
          style={{ flex: 1 }}
          data={local}
          keyExtractor={(i) => i.utcUrl}
          ListEmptyComponent={<Text style={{ color: '#666' }}>Nothing downloaded yet.</Text>}
          renderItem={({ item }) => {
            const open = draftsByUtc[item.utcUrl] ?? [];
            return (
              <View style={{ paddingVertical: 6 }}>
                <Text>{item.unitName} — {item.utcName}</Text>
                {open.length ? (
                  <>
                    <Text style={{ color: '#666', fontSize: 12 }}>
                      {open.length} unfinished session
                      {open.length === 1 ? '' : 's'} — starting a new one leaves
                      {open.length === 1 ? ' it' : ' them'} untouched.
                    </Text>
                    <Button
                      title="Resume latest"
                      onPress={() => router.push(`/worksheet/${open[0].id}`)}
                    />
                  </>
                ) : null}
                <Button title="Start session" onPress={() => startSession(item)} />
              </View>
            );
          }}
        />
      </View>

      <View style={{ flex: 2, marginTop: 8 }}>
        <Text style={{ fontWeight: 'bold', marginBottom: 6 }}>On the instance</Text>
        {/* Side by side, not stacked: two stacked Dropdowns plus this section's
            title, count and notice are ~200dp of unshrinkable chrome, which on a
            640dp phone left the list below it nothing. The selected label
            truncates instead (Dropdown already sets numberOfLines), and the modal
            shows it in full. */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ flex: 1 }}>
            <Dropdown
              label="Unit"
              options={view.unitOptions}
              value={unitFilter}
              onSelect={setUnitFilter}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Dropdown
              label="Frequency"
              options={view.freqOptions}
              value={freqFilter}
              onSelect={setFreqFilter}
            />
          </View>
        </View>
        {/* One line for both, and never hide a collection without saying so. */}
        <Text style={{ color: '#666', fontSize: 12 }}>
          {view.visible.length} of {view.rows.length}
          {view.hiddenNotice ? ` · ${view.hiddenNotice}` : ''}
        </Text>
        <FlatList
          style={{ flex: 1, marginTop: 4 }}
          data={view.visible}
          keyExtractor={(i) => i.url}
          ListEmptyComponent={
            <Text style={{ color: '#666' }}>
              {view.rows.length ? 'No list matches these filters.' : 'Press Browse to load.'}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={{ paddingVertical: 6 }}>
              <Text style={{ color: '#666', fontSize: 12 }}>
                {item.unitLabel} — {item.freqLabel}
              </Text>
              <Text>{item.name}</Text>
              <Button title="Download" onPress={() => download(item)} />
            </View>
          )}
        />
      </View>
    </View>
  );
}

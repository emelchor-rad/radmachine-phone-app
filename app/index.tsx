import { useCallback, useMemo, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { RadClient } from '../src/api/client';
import { flattenTestList } from '../src/api/definitions';
import {
  ALL,
  buildCatalogue,
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
};

const EMPTY: Browsed = { collections: [], units: [], frequencies: [], contentTypes: [] };

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
      listCollections().then(setLocal);
      // Refreshed on focus, not just on mount, so a draft appears the instant
      // the user backs out of a worksheet -- which is the exact gesture that
      // used to strand it.
      listDrafts().then(setDrafts);
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
      setBrowsed({ collections, units, frequencies, contentTypes });
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
    setMsg(`Downloading ${utc.name}...`);
    const c = new RadClient(creds.baseUrl, creds.token);
    try {
      // Safe because every row rendered came out of buildCatalogue, which only
      // keeps collections whose content type resolved to model 'testlist'. For a
      // cycle this object_id would be a cycle pk and this url would silently
      // fetch an unrelated list.
      const listUrl = `${creds.baseUrl}/qa/testlists/${utc.object_id}/`;
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
    await createSession(id, col.utcUrl, Crypto.randomUUID(), nowStamp());
    router.push(`/worksheet/${id}`);
  };

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
          No flex: the list sizes to its content up to maxHeight, so one draft
          does not steal a third of the screen from the two lists below. */}
      {drafts.length ? (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontWeight: 'bold' }}>Sessions in progress ({drafts.length})</Text>
          <FlatList
            style={{ maxHeight: 170 }}
            data={drafts}
            keyExtractor={(d) => d.id}
            renderItem={({ item }) => (
              <View style={{ paddingVertical: 6 }}>
                <Text>
                  {item.unitName ?? 'Unknown unit'} —{' '}
                  {item.utcName ?? 'list no longer downloaded'}
                </Text>
                <Text style={{ color: '#666', fontSize: 12 }}>
                  Started {item.workStarted}
                </Text>
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
          renderItem={({ item }) => (
            <View style={{ paddingVertical: 6 }}>
              <Text>{item.unitName} — {item.utcName}</Text>
              <Button title="Start session" onPress={() => startSession(item)} />
            </View>
          )}
        />
      </View>

      <View style={{ flex: 2, marginTop: 8 }}>
        <Text style={{ fontWeight: 'bold', marginBottom: 6 }}>On the instance</Text>
        <Dropdown
          label="Unit"
          options={view.unitOptions}
          value={unitFilter}
          onSelect={setUnitFilter}
        />
        <Dropdown
          label="Frequency"
          options={view.freqOptions}
          value={freqFilter}
          onSelect={setFreqFilter}
        />
        <Text style={{ color: '#666' }}>
          {view.visible.length} of {view.rows.length}
        </Text>
        {/* Never hide a collection without saying so. */}
        {view.hiddenNotice ? (
          <Text style={{ color: '#666', fontSize: 12 }}>{view.hiddenNotice}</Text>
        ) : null}
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

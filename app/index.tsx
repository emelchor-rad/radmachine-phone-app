import { useCallback, useMemo, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { RadClient } from '../src/api/client';
import { flattenTestList } from '../src/api/definitions';
import { listCollections, saveCollection, type Collection } from '../src/db/collections';
import { createSession } from '../src/db/sessions';
import { loadCredentials } from '../src/secure/credentials';
import { nowStamp } from '../src/sync/time';
import { Dropdown, type Option } from '../src/ui/Dropdown';

/** Filter sentinels. Real values are API urls, so these cannot collide. */
const ALL = '__all__';
/** 136 of 336 collections have no frequency; without this they are unreachable. */
const NO_FREQ = '__none__';

export default function Catalogue() {
  const [local, setLocal] = useState<Collection[]>([]);
  const [remote, setRemote] = useState<any[]>([]);
  const [unitNames, setUnitNames] = useState<Record<string, string>>({});
  const [freqNames, setFreqNames] = useState<Record<string, string>>({});
  const [unitFilter, setUnitFilter] = useState(ALL);
  const [freqFilter, setFreqFilter] = useState(ALL);
  const [msg, setMsg] = useState('');

  useFocusEffect(
    useCallback(() => {
      listCollections().then(setLocal);
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
      const [cols, units, freqs] = await Promise.all([
        c.getAll<any>('/qa/unittestcollections/', page),
        c.getAll<any>('/units/units/', page),
        c.getAll<any>('/qa/frequencies/', page),
      ]);
      setUnitNames(Object.fromEntries(units.map((u: any) => [u.url, u.name])));
      setFreqNames(Object.fromEntries(freqs.map((f: any) => [f.url, f.name])));
      setRemote(cols);
      // A filter kept from a previous browse may name a unit that is no longer
      // in the list, which would read as "0 of 336" and look like breakage.
      setUnitFilter(ALL);
      setFreqFilter(ALL);
      setMsg('');
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const unitLabel = (url: string | null) =>
    (url && unitNames[url]) || (url ? 'Unknown unit' : 'No unit');

  const unitOptions: Option[] = useMemo(() => {
    // Only units that actually carry collections -- the instance has units
    // with nothing scheduled on them, and offering those is just noise.
    const seen = new Set<string>(remote.map((c) => c.unit).filter(Boolean));
    const opts = [...seen]
      .map((url) => ({ value: url, label: unitLabel(url) }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: ALL, label: `All units (${seen.size})` }, ...opts];
  }, [remote, unitNames]);

  const freqOptions: Option[] = useMemo(() => {
    const seen = new Set<string>(remote.map((c) => c.frequency).filter(Boolean));
    const opts = [...seen]
      .map((url) => ({ value: url, label: freqNames[url] || 'Unknown frequency' }))
      .sort((a, b) => a.label.localeCompare(b.label));
    const adHoc = remote.filter((c) => !c.frequency).length;
    return [
      { value: ALL, label: 'All frequencies' },
      { value: NO_FREQ, label: `No frequency (ad hoc) (${adHoc})` },
      ...opts,
    ];
  }, [remote, freqNames]);

  const filtered = useMemo(
    () =>
      remote.filter((c) => {
        if (unitFilter !== ALL && c.unit !== unitFilter) return false;
        if (freqFilter === ALL) return true;
        if (freqFilter === NO_FREQ) return !c.frequency;
        return c.frequency === freqFilter;
      }),
    [remote, unitFilter, freqFilter]
  );

  const download = async (utc: any) => {
    const creds = await loadCredentials();
    if (!creds) return router.push('/connect');
    setMsg(`Downloading ${utc.name}...`);
    const c = new RadClient(creds.baseUrl, creds.token);
    try {
      const listUrl = `${creds.baseUrl}/qa/testlists/${utc.object_id}/`;
      const tests = await flattenTestList(listUrl, (u) => c.get<any>(u));
      const unit = await c.get<any>(utc.unit);
      await saveCollection(
        {
          utcUrl: utc.url,
          utcName: utc.name,
          unitName: unit.name,
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
      {/* One row, so the two lists below keep the screen on a small phone. */}
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
          options={unitOptions}
          value={unitFilter}
          onSelect={setUnitFilter}
        />
        <Dropdown
          label="Frequency"
          options={freqOptions}
          value={freqFilter}
          onSelect={setFreqFilter}
        />
        <Text style={{ color: '#666', marginBottom: 4 }}>
          {filtered.length} of {remote.length}
        </Text>
        <FlatList
          style={{ flex: 1 }}
          data={filtered}
          keyExtractor={(i) => i.url}
          ListEmptyComponent={
            <Text style={{ color: '#666' }}>
              {remote.length ? 'No list matches these filters.' : 'Press Browse to load.'}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={{ paddingVertical: 6 }}>
              <Text style={{ color: '#666', fontSize: 12 }}>
                {unitLabel(item.unit)}
                {item.frequency ? ` — ${freqNames[item.frequency] || 'Unknown frequency'}` : ' — ad hoc'}
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

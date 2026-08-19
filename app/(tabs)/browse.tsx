import { useCallback, useMemo, useState } from 'react';
import { Button, FlatList, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { attachCriteria } from '../../src/api/criteria';
import { attachCalculationProcedures } from '../../src/api/procedures';
import { RadClient } from '../../src/api/client';
import { flattenTestList } from '../../src/api/definitions';
import {
  ALL,
  buildCatalogue,
  definitionUrl,
  resolveUnitUrl,
  scheduleRowFor,
  type CatalogueRow,
  type RawCollection,
  type RawContentType,
  type RawNamed,
} from '../../src/api/catalogue';
import { listCollections, saveCollection } from '../../src/db/collections';
import { upsertScheduleRow } from '../../src/db/schedule';
import { loadCredentials } from '../../src/secure/credentials';
import { nowStamp } from '../../src/sync/time';
import { Dropdown } from '../../src/ui/Dropdown';

const MUTED = '#666';
const DONE = '#1b6b2f';

/** Everything one browse pass fetched, kept together. */
type Browsed = {
  collections: RawCollection[];
  units: RawNamed[];
  sites: RawNamed[];
  frequencies: RawNamed[];
  contentTypes: RawContentType[];
  baseUrl: string;
  fetchedAt: string;
};

const EMPTY: Browsed = {
  collections: [],
  units: [],
  sites: [],
  frequencies: [],
  contentTypes: [],
  baseUrl: '',
  fetchedAt: '',
};

/**
 * Browse finds a list on the instance, downloads it, and hands off to Downloaded.
 *
 * Filtering only — no search box, no draft list, no session controls. Those live
 * on Downloaded. After a successful download the tab switches so the physicist
 * lands on the list they just saved.
 */
export default function Catalogue() {
  const [downloaded, setDownloaded] = useState<ReadonlySet<string>>(new Set());
  const [browsed, setBrowsed] = useState<Browsed>(EMPTY);
  const [unitFilter, setUnitFilter] = useState(ALL);
  const [freqFilter, setFreqFilter] = useState(ALL);
  const [msg, setMsg] = useState('');

  const loadDownloaded = useCallback(async () => {
    try {
      const cols = await listCollections();
      setDownloaded(new Set(cols.map((c) => c.utcUrl)));
    } catch (e: any) {
      setMsg(`Could not read which lists are already downloaded: ${e?.message ?? e}`);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDownloaded();
    }, [loadDownloaded])
  );

  const browse = async () => {
    const creds = await loadCredentials();
    if (!creds) return router.push('/connect');
    setMsg('Loading...');
    try {
      const c = new RadClient(creds.baseUrl, creds.token);
      const page = { limit: '200' };
      const [collections, units, sites, frequencies, contentTypes] = await Promise.all([
        c.getAll<RawCollection>('/qa/unittestcollections/', page),
        c.getAll<RawNamed>('/units/units/', page),
        c.getAll<RawNamed>('/units/sites/', page),
        c.getAll<RawNamed>('/qa/frequencies/', page),
        c.getAll<RawContentType>('/contenttypes/contenttypes/', page),
      ]);
      setBrowsed({
        collections,
        units,
        sites,
        frequencies,
        contentTypes,
        baseUrl: creds.baseUrl,
        fetchedAt: new Date().toISOString(),
      });
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
    if (creds.baseUrl !== browsed.baseUrl) {
      setBrowsed(EMPTY);
      setMsg('These results came from a different instance. Press Browse again.');
      return;
    }
    setMsg(`Downloading ${utc.name}...`);
    const c = new RadClient(creds.baseUrl, creds.token);
    try {
      const listUrl = definitionUrl(utc, creds.baseUrl);
      let tests = await flattenTestList(listUrl, (u) => c.get<any>(u));
      tests = await attachCalculationProcedures(c, tests);
      const unitUrl = resolveUnitUrl(utc.unit, browsed.units);
      if (unitUrl) {
        try {
          tests = await attachCriteria(c, unitUrl, tests);
        } catch {
          // Criteria are optional — tolerance hints only. A mismatched unit url
          // or missing unittestinfo must not block downloading the list itself.
        }
      }
      await saveCollection(
        {
          utcUrl: utc.url,
          utcName: utc.name,
          unitName: utc.unitLabel,
          listUrl,
          downloadedAt: nowStamp(),
        },
        tests
      );
      const raw = browsed.collections.find((r) => r.url === utc.url);
      const scheduleRow = raw
        ? scheduleRowFor(raw, browsed.units, browsed.sites, browsed.frequencies)
        : null;
      if (scheduleRow) await upsertScheduleRow(scheduleRow, browsed.fetchedAt);
      await loadDownloaded();
      setMsg('');
      router.push('/downloaded');
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <View style={{ padding: 12, flex: 1 }}>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <Button title="Browse" onPress={browse} />
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
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

      <Text style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
        {view.visible.length} of {view.rows.length}
        {view.hiddenNotice ? ` · ${view.hiddenNotice}` : ''}
      </Text>

      {msg ? <Text style={{ paddingVertical: 4 }}>{msg}</Text> : null}

      <FlatList
        style={{ flex: 1, marginTop: 4 }}
        data={view.visible}
        keyExtractor={(i) => i.url}
        extraData={downloaded}
        ListEmptyComponent={
          <Text style={{ color: MUTED }}>
            {view.rows.length
              ? 'No list matches these filters.'
              : 'Press Browse to load.'}
          </Text>
        }
        renderItem={({ item }) => {
          const already = downloaded.has(item.url);
          return (
            <View
              style={{
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: '#eee',
                gap: 6,
              }}
            >
              <Text style={{ fontWeight: 'bold' }}>{item.name}</Text>
              <Text style={{ color: MUTED, fontSize: 12 }}>
                {item.unitLabel} · {item.freqLabel}
              </Text>
              {already ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={{ color: DONE, fontWeight: 'bold' }}>✓ Downloaded</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Download ${item.name} again`}
                    onPress={() => download(item)}
                    hitSlop={6}
                  >
                    <Text
                      style={{ color: MUTED, fontSize: 13, textDecorationLine: 'underline' }}
                    >
                      Download again
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <Button title="Download" onPress={() => download(item)} />
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

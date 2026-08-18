import { useCallback, useMemo, useState } from 'react';
import { Button, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { RadClient } from '../../src/api/client';
import { flattenTestList } from '../../src/api/definitions';
import {
  ALL,
  buildCatalogue,
  definitionUrl,
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
  /**
   * Sites, only so that a download can name the site its unit belongs to when it
   * writes its own schedule row. Nothing on this screen displays them.
   */
  sites: RawNamed[];
  frequencies: RawNamed[];
  contentTypes: RawContentType[];
  /**
   * The instance these rows came from. object_id values and content type urls are
   * per-tenant, so rows browsed against one instance say nothing about another;
   * download() refuses rather than resolve them against new credentials.
   */
  baseUrl: string;
  /**
   * When this pass was read from the server, ISO. It becomes the schedule row's
   * refreshed_at, so the dashboard's staleness line reports when the due dates
   * were actually fetched rather than when the file happened to be written.
   */
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
 * Browse does ONE thing: find a list on the instance and download it.
 *
 * Resuming a draft and starting a session on a downloaded list both live on the
 * Downloaded tab. They used to be stacked above the catalogue here, which meant
 * three lists competing for one screen and each getting a third of it -- the
 * height failure this screen has produced twice. What is left is one FlatList
 * with flex: 1 and the smallest chrome that still explains itself.
 */
export default function Catalogue() {
  /**
   * The utc urls already downloaded.
   *
   * Read from the `collection` table, which is SQLite on the device, so the mark
   * survives a restart, a reinstall of the JS bundle, and being offline -- which
   * is exactly what "stay that way in future" has to mean here. Nothing about it
   * comes from this session's browse pass.
   */
  const [downloaded, setDownloaded] = useState<ReadonlySet<string>>(new Set());
  // One object, not four states: the four arrays are only ever meaningful
  // together, and four setStates would let a render land between them.
  const [browsed, setBrowsed] = useState<Browsed>(EMPTY);
  const [unitFilter, setUnitFilter] = useState(ALL);
  const [freqFilter, setFreqFilter] = useState(ALL);
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');

  /**
   * Which lists are already downloaded.
   *
   * Caught, not left to reject: an unhandled rejection here would leave every
   * row unmarked, which reads as "nothing has ever been downloaded" -- the exact
   * false statement this mark exists to prevent.
   */
  const loadDownloaded = useCallback(async () => {
    try {
      const cols = await listCollections();
      setDownloaded(new Set(cols.map((c) => c.utcUrl)));
    } catch (e: any) {
      setMsg(`Could not read which lists are already downloaded: ${e?.message ?? e}`);
    }
  }, []);

  // On focus, not just on mount: a list can be downloaded from here, and the
  // set must also be right when the user comes back from another tab.
  useFocusEffect(
    useCallback(() => {
      loadDownloaded();
    }, [loadDownloaded])
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
      const [collections, units, sites, frequencies, contentTypes] = await Promise.all([
        c.getAll<RawCollection>('/qa/unittestcollections/', page),
        c.getAll<RawNamed>('/units/units/', page),
        // Sites are never displayed here. They are fetched so that downloading
        // a list can name the site its unit belongs to when it writes its own
        // schedule row, without a second round trip at download time.
        c.getAll<RawNamed>('/units/sites/', page),
        c.getAll<RawNamed>('/qa/frequencies/', page),
        // Needed to tell a test list from a test list cycle. Without it every
        // collection is unresolved, and buildCatalogue then shows none -- which
        // is the intended failure: refusing beats downloading the wrong list.
        c.getAll<RawContentType>('/contenttypes/contenttypes/', page),
      ]);
      setBrowsed({
        collections,
        units,
        sites,
        frequencies,
        contentTypes,
        baseUrl: creds.baseUrl,
        // Stamped when the pass was READ, so a schedule row written at download
        // time reports when its due date was actually fetched.
        fetchedAt: new Date().toISOString(),
      });
      // A filter kept from a previous browse may name a unit that is no longer
      // in the list, which would read as "0 of 336" and look like breakage.
      //
      // The search box is deliberately NOT cleared with them: a dropdown's
      // selection can name something that no longer exists, while the typed
      // query is right there on screen explaining why the list is short.
      setUnitFilter(ALL);
      setFreqFilter(ALL);
      setMsg('');
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  const view = useMemo(
    () => buildCatalogue({ ...browsed, unitFilter, freqFilter, search }),
    [browsed, unitFilter, freqFilter, search]
  );

  const download = async (utc: CatalogueRow) => {
    const creds = await loadCredentials();
    if (!creds) return router.push('/connect');
    // The credentials can have changed since these rows were fetched: connect
    // saves and navigates away, and coming back to this tab does not re-browse,
    // so stale results can outlive the tenant they came from. Resolving a
    // previous tenant's object_id against a new host is the same wrong-list
    // download by another route, so refuse it.
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
      // Write this list's schedule row now, rather than waiting for the next
      // refresh. Downloaded renders from the schedule table, so without this a
      // finished download shows nothing there until a connectivity or
      // foreground event happens to fire -- which reads as the download having
      // failed. Everything the row needs was already fetched by browse(), so
      // this costs no extra request.
      const raw = browsed.collections.find((r) => r.url === utc.url);
      const scheduleRow = raw
        ? scheduleRowFor(raw, browsed.units, browsed.sites, browsed.frequencies)
        : null;
      // A null row means the unit did not resolve, and scheduleRowFor refuses
      // rather than guess. The list is still downloaded and usable; it simply
      // waits for the next full refresh to gain a schedule row.
      if (scheduleRow) await upsertScheduleRow(scheduleRow, browsed.fetchedAt);
      // Re-read rather than add utc.url to the set: the row is marked because
      // the table says so, and only because of that. Awaited BEFORE the success
      // message, since loadDownloaded writes msg on failure and would otherwise
      // overwrite it.
      await loadDownloaded();
      setMsg(`Saved ${tests.length} tests.`);
    } catch (e: any) {
      setMsg(e.message);
    }
  };

  return (
    <View style={{ padding: 12, flex: 1 }}>
      {/* One line: search, its clear control, and Browse. Everything above the
          list is chrome the list does not get, and this screen's ancestor has
          twice computed to near-zero list height. Connection and Queue live in
          the gear in the header, reachable from every tab. */}
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search lists"
          placeholderTextColor="#999"
          // The phone's own capitalisation and correction would rewrite a query
          // aimed at names like "TB1 Daily Output" into something that matches
          // nothing, with no sign of what happened.
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search lists"
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#888',
            borderRadius: 4,
            paddingVertical: 8,
            paddingHorizontal: 10,
          }}
        />
        {/* An explicit control, not clearButtonMode: that prop is iOS only and
            this app runs on Android, where it would leave no way out of a query
            but the backspace key. Shown only when there is something to clear,
            so it never occupies the row for nothing. */}
        {search ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setSearch('')}
            hitSlop={8}
            style={{ paddingHorizontal: 6, paddingVertical: 6 }}
          >
            <Text style={{ fontSize: 16, color: MUTED }}>✕</Text>
          </Pressable>
        ) : null}
        <Button title="Browse" onPress={browse} />
      </View>

      {/* Side by side, not stacked: two stacked Dropdowns are ~130dp of
          unshrinkable chrome, which on a 640dp phone left the list below
          nothing. The selected label truncates instead (Dropdown already sets
          numberOfLines), and the modal shows it in full. */}
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

      {/* One line for the count and the withheld notice, and never hide a
          collection without saying so. The count is "shown of downloadable", so
          search and the dropdowns move the first number only. */}
      <Text style={{ color: MUTED, fontSize: 12 }}>
        {view.visible.length} of {view.rows.length}
        {view.hiddenNotice ? ` · ${view.hiddenNotice}` : ''}
      </Text>

      {msg ? <Text style={{ paddingVertical: 4 }}>{msg}</Text> : null}

      <FlatList
        style={{ flex: 1, marginTop: 4 }}
        data={view.visible}
        keyExtractor={(i) => i.url}
        // Not decorative. The rows are drawn from `view.visible`, which does not
        // change when a download finishes -- only `downloaded` does, and
        // VirtualizedList's cells skip a re-render on unchanged data. Without
        // this the row a user just downloaded keeps its Download button until
        // something else happens to rebuild the list, which reads as the
        // download having failed. A new Set per load, so the identity check
        // fires.
        extraData={downloaded}
        // Dismiss the keyboard on the first drag: the box takes half the screen
        // on a phone, and the results it filtered are what the user is reaching
        // for.
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={{ color: MUTED }}>
            {view.rows.length
              ? search
                ? `No list matches "${search.trim()}"${
                    unitFilter !== ALL || freqFilter !== ALL ? ' with these filters' : ''
                  }.`
                : 'No list matches these filters.'
              : 'Press Browse to load.'}
          </Text>
        }
        renderItem={({ item }) => {
          const already = downloaded.has(item.url);
          return (
            <View
              style={{
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: '#eee',
              }}
            >
              <Text style={{ color: MUTED, fontSize: 12 }}>
                {item.unitLabel} — {item.freqLabel}
              </Text>
              <Text>{item.name}</Text>
              {already ? (
                // A state, not a disabled button: a greyed-out "Download" reads
                // as something the app is refusing to do, when in fact the work
                // is already done and the list is usable offline right now.
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <Text style={{ color: DONE, fontWeight: 'bold' }}>✓ Downloaded</Text>
                  {/* Kept, because a definition genuinely changes on the server
                      -- a test added to the list is otherwise invisible on the
                      phone forever. Plain underlined text rather than a Button,
                      so nothing on a finished row competes with the Download
                      buttons on the rows that still need one. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Download ${item.name} again`}
                    onPress={() => download(item)}
                    hitSlop={6}
                  >
                    <Text
                      style={{ color: MUTED, fontSize: 12, textDecorationLine: 'underline' }}
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

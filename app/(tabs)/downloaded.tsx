import { useCallback, useMemo, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { Dropdown, type Option } from '../../src/ui/Dropdown';
import { listSchedule } from '../../src/db/schedule';
import { listCollections } from '../../src/db/collections';
import {
  createSession,
  listDrafts,
  listUnsentByUtc,
  type DraftSummary,
} from '../../src/db/sessions';
import { dueState, type DueState } from '../../src/schedule/due';
import {
  AD_HOC,
  ALL,
  NO_FREQUENCY,
  filterSchedule,
  frequencyFilterFor,
  type ScheduleRow,
} from '../../src/schedule/summary';
import { nowStamp } from '../../src/sync/time';

const DANGER = '#b00020';
const WARN = '#8a6d00';
const MUTED = '#666';

/** Everything one load pass read, kept together so a render never lands between them. */
type Library = {
  rows: ScheduleRow[];
  /** utcUrl -> the collection's name, for rows whose definition is still stored. */
  names: Record<string, string>;
  /** utcUrl -> its newest unfinished session. */
  drafts: Record<string, DraftSummary>;
  /** utcUrl -> outbox status of a session that has not reached the server. */
  unsent: Record<string, string>;
  /** Downloaded collections the schedule does not know about yet. */
  missing: number;
};

const EMPTY: Library = { rows: [], names: {}, drafts: {}, unsent: {}, missing: 0 };

function dueLine(dueDate: string | null, state: DueState): string {
  // Never an empty date: an ad-hoc list has no due date at all, and a blank
  // where a date belongs reads as a bug rather than as "there is none".
  if (state === 'unscheduled') return 'No due date';
  const day = (dueDate ?? '').slice(0, 10);
  if (state === 'overdue') return `Overdue — was due ${day}`;
  if (state === 'due') return `Due today (${day})`;
  return `Due ${day}`;
}

function dueColour(state: DueState): string {
  if (state === 'overdue') return DANGER;
  if (state === 'due') return WARN;
  return MUTED;
}

export default function Downloaded() {
  const [lib, setLib] = useState<Library>(EMPTY);
  const [msg, setMsg] = useState('');

  // The dashboard opens this screen pre-filtered. Both are absent when the tab
  // is opened from the tab bar instead, so both default to "no filter".
  const params = useLocalSearchParams<{ unitUrl?: string; frequencyName?: string }>();
  const paramUnit = params.unitUrl;
  const paramFreq = params.frequencyName;

  const [unitFilter, setUnitFilter] = useState(ALL);
  const [freqFilter, setFreqFilter] = useState(ALL);
  // Off by default: opening this tab directly means "what do I carry?".
  // Turned on when arriving from a dashboard card, which asks "what do I owe?".
  const [dueOnly, setDueOnly] = useState(false);

  /**
   * Seed the filters from the route, on every focus.
   *
   * On focus and not just on param change, because the dashboard can send the
   * SAME unit and frequency twice -- tap a row, clear the filter here, go back,
   * tap the same row -- and an effect keyed on the values would not fire the
   * second time, showing an unfiltered list for a bucket the user just tapped.
   *
   * That only stays honest because every filter change below writes the route
   * back with setParams, so the params never contradict what is on screen and
   * re-focusing cannot resurrect a filter the user cleared.
   *
   * frequencyFilterFor is what makes the ad-hoc bucket work at all: the
   * dashboard sends the LABEL 'Ad hoc', while filterSchedule matches the
   * sentinel. It is idempotent on the sentinels, so params written back by this
   * screen survive the round trip unchanged.
   */
  useFocusEffect(
    useCallback(() => {
      if (paramUnit) setUnitFilter(paramUnit);
      if (paramFreq) setFreqFilter(frequencyFilterFor(paramFreq));
      // Arriving from a dashboard card is a request to see what is owed, and
      // that card counted only due and overdue. Listing everything downloaded
      // would answer a different question: tap a bucket showing 4 and get 5
      // rows. Opening the tab directly is the general case, so it shows all.
      if (paramUnit || paramFreq) setDueOnly(true);
    }, [paramUnit, paramFreq])
  );

  useFocusEffect(
    useCallback(() => {
      (async () => {
        // Reloaded on focus, not just on mount: a session finished on the
        // worksheet or drained on the queue screen changes what belongs beside
        // these rows, and a stale marker here is a physicist repeating work.
        try {
          setMsg('');
          const [rows, collections, drafts, unsent] = await Promise.all([
            listSchedule(),
            listCollections(),
            listDrafts(),
            listUnsentByUtc(),
          ]);
          const names: Record<string, string> = {};
          for (const c of collections) names[c.utcUrl] = c.utcName;
          // listDrafts is newest first, so the first one seen per list is the
          // one to resume.
          const byUtc: Record<string, DraftSummary> = {};
          for (const d of drafts) byUtc[d.utcUrl] ??= d;
          const scheduled = new Set(rows.map((r) => r.utcUrl));
          setLib({
            rows,
            names,
            drafts: byUtc,
            unsent,
            missing: collections.filter((c) => !scheduled.has(c.utcUrl)).length,
          });
        } catch (e: any) {
          // A failed read that rendered an empty list would be indistinguishable
          // from having downloaded nothing, and the second is acted on very
          // differently from the first.
          setLib(EMPTY);
          setMsg(`Could not read the downloaded lists: ${e?.message ?? e}`);
        }
      })();
    }, [])
  );

  const unitOptions: Option[] = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of lib.rows) seen.set(r.unitUrl, r.unitName);
    return [
      { value: ALL, label: 'All units' },
      ...[...seen]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [lib.rows]);

  const freqOptions: Option[] = useMemo(() => {
    const seen = new Set<string>();
    let anyAdHoc = false;
    for (const r of lib.rows) {
      if (r.frequencyName === null) anyAdHoc = true;
      else seen.add(r.frequencyName);
    }
    const out: Option[] = [{ value: ALL, label: 'All frequencies' }];
    for (const f of [...seen].sort((a, b) => a.localeCompare(b))) {
      out.push({ value: f, label: f });
    }
    // Only when something is actually ad hoc, and labelled with the same
    // constant the dashboard uses, so both ends of the trip agree.
    if (anyAdHoc) out.push({ value: NO_FREQUENCY, label: AD_HOC });
    return out;
  }, [lib.rows]);

  const visible = useMemo(() => {
    const matched = filterSchedule(lib.rows, unitFilter, freqFilter);
    const kept = dueOnly
      ? matched.filter((r) => {
          const s = dueState(r.dueDate, new Date());
          return s === 'due' || s === 'overdue';
        })
      : matched;
    // listSchedule has no ORDER BY, so order the list here rather than let
    // SQLite decide it differently between two loads.
    return [...kept].sort(
      (a, b) =>
        a.unitName.localeCompare(b.unitName) ||
        (lib.names[a.utcUrl] ?? a.utcUrl).localeCompare(lib.names[b.utcUrl] ?? b.utcUrl)
    );
  }, [lib.rows, lib.names, unitFilter, freqFilter, dueOnly]);

  const filtered = unitFilter !== ALL || freqFilter !== ALL;

  // Every change is mirrored into the route, so the focus seeding above can
  // never contradict the dropdowns.
  const chooseUnit = (v: string) => {
    setUnitFilter(v);
    router.setParams({ unitUrl: v });
  };
  const chooseFreq = (v: string) => {
    setFreqFilter(v);
    router.setParams({ frequencyName: v });
  };
  const showAll = () => {
    setUnitFilter(ALL);
    setFreqFilter(ALL);
    setDueOnly(false);
    router.setParams({ unitUrl: ALL, frequencyName: ALL });
  };

  const startSession = async (utcUrl: string) => {
    const id = Crypto.randomUUID();
    try {
      await createSession(id, utcUrl, Crypto.randomUUID(), nowStamp());
    } catch (e: any) {
      // Without this a failed INSERT is an unhandled rejection and the tap looks
      // like it did nothing at all.
      setMsg(`Could not start a session: ${e?.message ?? e}`);
      return;
    }
    router.push(`/worksheet/${id}`);
  };

  const now = new Date();

  return (
    <View style={{ padding: 12, flex: 1 }}>
      {/* Side by side, and the only chrome above the list: this screen's
          ancestor has twice produced a list computing to near-zero height, so
          everything above the FlatList stays on as few lines as possible. */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ flex: 1 }}>
          <Dropdown
            label="Unit"
            options={unitOptions}
            value={unitFilter}
            onSelect={chooseUnit}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Dropdown
            label="Frequency"
            options={freqOptions}
            value={freqFilter}
            onSelect={chooseFreq}
          />
        </View>
      </View>

      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        {/* Says a working filter apart from a broken screen. */}
        <Text style={{ color: MUTED, fontSize: 12, flexShrink: 1 }}>
          {visible.length} of {lib.rows.length} downloaded
          {dueOnly ? ' · due or overdue only' : ''}
          {lib.missing > 0
            ? ` · ${lib.missing} more not in the schedule yet — they appear after the next sync`
            : ''}
        </Text>
        <Button
          title={dueOnly ? 'Show not due' : 'Due only'}
          onPress={() => setDueOnly((v) => !v)}
        />
        {/* A filter arrived from the dashboard is otherwise indistinguishable
            from an empty library, and the user must be able to undo it without
            leaving the tab. */}
        {filtered ? <Button title="Show all" onPress={showAll} /> : null}
      </View>

      {msg ? <Text style={{ color: DANGER, paddingVertical: 4 }}>{msg}</Text> : null}

      <FlatList
        style={{ flex: 1, marginTop: 4 }}
        data={visible}
        keyExtractor={(r) => r.utcUrl}
        ListEmptyComponent={
          <Text style={{ color: MUTED }}>
            {msg
              ? 'Nothing to show — the list above could not be read.'
              : lib.rows.length
                ? 'No downloaded list matches these filters.'
                : // Downloaded but never synced is NOT an empty library: saying
                  // "nothing downloaded" there sends the user to Browse to
                  // download again, which is not what is missing.
                  lib.missing > 0
                  ? `${lib.missing} list${lib.missing === 1 ? '' : 's'} downloaded, but none has schedule information yet — go online once and it appears here.`
                  : 'Nothing downloaded yet. Use Browse to download a list.'}
          </Text>
        }
        renderItem={({ item }) => {
          const state = dueState(item.dueDate, now);
          const draft = lib.drafts[item.utcUrl];
          const unsent = lib.unsent[item.utcUrl];
          return (
            <View
              style={{
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: '#eee',
              }}
            >
              {/* The url only as a last resort: a schedule row can outlive the
                  definition it names. */}
              <Text style={{ fontWeight: 'bold' }}>
                {lib.names[item.utcUrl] ?? item.utcUrl}
              </Text>
              <Text style={{ color: MUTED, fontSize: 12 }}>
                {item.unitName} — {item.frequencyName ?? AD_HOC}
              </Text>
              <Text
                style={{
                  color: dueColour(state),
                  fontSize: 12,
                  fontWeight: state === 'overdue' ? 'bold' : 'normal',
                }}
              >
                {dueLine(item.dueDate, state)}
              </Text>
              {draft ? (
                <Text style={{ color: WARN, fontSize: 12 }}>
                  Unfinished session started {draft.workStarted}
                </Text>
              ) : null}
              {/* Beside the row, never subtracted from the count above: the
                  count is what the server believes is owed. */}
              {unsent ? (
                <Text style={{ color: WARN, fontSize: 12 }}>
                  {unsent === 'failed'
                    ? 'Done, but sending failed — open the Queue'
                    : 'Done, waiting to send'}
                </Text>
              ) : null}
              {/* Resume, not a second session: two sessions on one list split
                  the readings, and only one of them gets submitted. */}
              {draft ? (
                <Button
                  title="Resume session"
                  onPress={() => router.push(`/worksheet/${draft.id}`)}
                />
              ) : (
                <Button title="Start session" onPress={() => startSession(item.utcUrl)} />
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

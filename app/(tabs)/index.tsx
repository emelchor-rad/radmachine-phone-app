import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Dropdown, type Option } from '../../src/ui/Dropdown';
import { lastRefreshedAt, listSchedule } from '../../src/db/schedule';
import { allRows } from '../../src/db/outbox';
import { ALL, buildUnitCards, type ScheduleRow } from '../../src/schedule/summary';
import { refreshSchedule } from '../../src/sync/refresh';
import { BUILD_LABEL } from '../../src/build-info';

const DANGER = '#b00020';
const WARN = '#8a6d00';

/** "synced 3 days ago" -- the dashboard never hides how old its numbers are. */
function staleness(iso: string | null, now: Date): string {
  if (!iso) return 'never synced';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'never synced';
  const mins = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (mins < 1) return 'synced just now';
  if (mins < 60) return `synced ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `synced ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `synced ${days} day${days === 1 ? '' : 's'} ago`;
}

export default function Dashboard() {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [refreshed, setRefreshed] = useState<string | null>(null);
  const [unsent, setUnsent] = useState(0);
  const [site, setSite] = useState<string>(ALL);
  const [msg, setMsg] = useState('');

  /** One read of everything this screen shows, all of it local. */
  const load = useCallback(async () => {
    try {
      setMsg('');
      setRows(await listSchedule());
      setRefreshed(await lastRefreshedAt());
      const out = await allRows();
      setUnsent(out.filter((r) => r.status !== 'sent').length);
    } catch (e: any) {
      setMsg(`Could not read the dashboard: ${e?.message ?? e}`);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /**
   * Pull down to fetch new due dates.
   *
   * The automatic refresh rides on connectivity and foreground events, which is
   * right for walking out of a bunker but leaves no way to ask for fresh
   * numbers while simply standing there with signal.
   */
  const [refreshing, setRefreshing] = useState(false);
  const pullToRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshSchedule(new Date().toISOString());
    } catch (e: any) {
      setMsg(`Could not refresh the schedule: ${e?.message ?? e}`);
    }
    await load();
    setRefreshing(false);
  };

  const now = new Date();
  const cards = useMemo(() => buildUnitCards(rows, now, site), [rows, site]);

  const siteOptions: Option[] = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.siteUrl) seen.set(r.siteUrl, r.siteName ?? r.siteUrl);
    return [
      { value: ALL, label: 'All sites' },
      ...[...seen]
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [rows]);

  const open = (unitUrl: string, frequencyName: string) =>
    router.push({ pathname: '/downloaded', params: { unitUrl, frequencyName } });

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} />}
    >
      {siteOptions.length > 1 ? (
        <Dropdown label="Site" options={siteOptions} value={site} onSelect={setSite} />
      ) : null}

      {/* One staleness line for the screen, not one per card: every card comes
          from the same refresh, so repeating it would only add noise. */}
      {rows.length > 0 ? (
        <Text style={{ color: '#888', fontSize: 12 }}>{staleness(refreshed, now)}</Text>
      ) : null}

      {msg ? <Text style={{ color: DANGER }}>{msg}</Text> : null}

      {unsent > 0 ? (
        <Pressable onPress={() => router.push('/queue')}>
          <Text style={{ color: WARN }}>
            {unsent} session{unsent === 1 ? '' : 's'} waiting to send — tap to open the queue
          </Text>
        </Pressable>
      ) : null}

      {rows.length === 0 ? (
        <Text>Nothing downloaded yet. Use Browse to download a list, then it appears here.</Text>
      ) : null}

      {rows.length > 0 && cards.length === 0 ? (
        <Text>No downloaded list belongs to this site.</Text>
      ) : null}

      {cards.map((c) => (
        <View
          key={c.unitUrl}
          style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, gap: 4 }}
        >
          <Text style={{ fontSize: 18, fontWeight: 'bold' }}>{c.unitName}</Text>
          <Text style={{ color: c.overdueTotal > 0 ? DANGER : '#555' }}>
            {c.dueTotal} due or overdue
          </Text>
          {/* Tiles that wrap, the way RadMachine's own unit card reads: the
              frequency, then the count big enough to take in at arm's length.
              flexBasis 96 with flexGrow 1 rather than a fixed column count --
              three fit across a 360dp phone, and a unit with five frequencies
              spills onto a second line instead of squeezing all five flat. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {c.rows.map((r) => (
              <Pressable
                key={r.frequencyName}
                onPress={() => open(c.unitUrl, r.frequencyName)}
                style={{
                  flexGrow: 1,
                  flexBasis: 96,
                  borderWidth: 1,
                  borderColor: '#ddd',
                  borderRadius: 6,
                  paddingVertical: 10,
                  paddingHorizontal: 6,
                  alignItems: 'center',
                }}
              >
                {/* Two lines, not one: "Semi-annually" ellipsised to
                    "Semi-annua..." in a 96dp tile would hide which control the
                    number belongs to. */}
                <Text
                  numberOfLines={2}
                  style={{ fontSize: 12, color: '#555', textAlign: 'center' }}
                >
                  {r.frequencyName}
                </Text>
                {/* The big number is the TOTAL due or overdue. The overdue count
                    keeps its own line below because the two call for different
                    action -- three days late is not the same as due this
                    morning -- and it is absent, not zero, when nothing is late. */}
                <Text
                  style={{
                    fontSize: 28,
                    fontWeight: 'bold',
                    color: r.overdue > 0 ? DANGER : '#333',
                  }}
                >
                  {r.total}
                </Text>
                {r.overdue > 0 ? (
                  <Text style={{ fontSize: 11, color: DANGER, textAlign: 'center' }}>
                    {r.overdue} overdue
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Text style={{ color: '#bbb', fontSize: 11, textAlign: 'center', marginTop: 24 }}>
        Build {BUILD_LABEL}
      </Text>
    </ScrollView>
  );
}

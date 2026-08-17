import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Dropdown, type Option } from '../../src/ui/Dropdown';
import { lastRefreshedAt, listSchedule } from '../../src/db/schedule';
import { allRows } from '../../src/db/outbox';
import { ALL, buildUnitCards, type ScheduleRow } from '../../src/schedule/summary';

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

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          setMsg('');
          setRows(await listSchedule());
          setRefreshed(await lastRefreshedAt());
          const out = await allRows();
          setUnsent(out.filter((r) => r.status !== 'sent').length);
        } catch (e: any) {
          setMsg(`Could not read the dashboard: ${e?.message ?? e}`);
        }
      })();
    }, [])
  );

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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {siteOptions.length > 1 ? (
        <Dropdown label="Site" options={siteOptions} value={site} onSelect={setSite} />
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
          <Text style={{ color: '#888', fontSize: 12 }}>{staleness(refreshed, now)}</Text>

          {c.rows.map((r) => (
            <Pressable
              key={r.frequencyName}
              onPress={() => open(c.unitUrl, r.frequencyName)}
              style={{
                paddingVertical: 8,
                flexDirection: 'row',
                justifyContent: 'space-between',
                borderTopWidth: 1,
                borderTopColor: '#eee',
              }}
            >
              <Text>{r.frequencyName}</Text>
              <Text style={{ color: r.overdue > 0 ? DANGER : '#333' }}>
                {r.total}
                {r.overdue > 0 ? ` (${r.overdue} overdue)` : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

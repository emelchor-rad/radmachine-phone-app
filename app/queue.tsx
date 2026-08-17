import { useCallback, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { allRows, requeue, type OutboxRow } from '../src/db/outbox';
import { drainOutbox, type DrainSummary } from '../src/sync/drain';

/**
 * A user-facing sentence for a drain pass.
 *
 * `attempted` alone cannot say whether a pass helped or not -- "Processed 3"
 * reads the same whether all three landed or all three died. Reporting each
 * outcome, and saying "nothing to send" instead of "0 sent" when nothing was
 * due, is the whole point of this task.
 */
function summarize(s: DrainSummary): string {
  if (s.attempted === 0) return 'Nothing to send.';
  const parts: string[] = [];
  if (s.sent) parts.push(`${s.sent} sent`);
  if (s.failed) parts.push(`${s.failed} failed`);
  if (s.queued) parts.push(`${s.queued} still queued`);
  return `${parts.join(', ')}.`;
}

export default function Queue() {
  const [rows, setRows] = useState<OutboxRow[]>([]);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => setRows(await allRows()), []);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const send = async () => {
    setMsg('Sending...');
    // drainOutbox rejects if the credentials store or the database throws.
    // Being offline is not an error here -- each row records its own outcome --
    // but a bare throw would surface as an unhandled rejection instead of a
    // message the physicist can read.
    try {
      const summary = await drainOutbox();
      setMsg(summarize(summary));
    } catch (e: any) {
      setMsg(e.message);
    }
    await refresh();
  };

  const retry = async (sessionId: string) => {
    try {
      await requeue(sessionId);
      const summary = await drainOutbox();
      setMsg(summarize(summary));
    } catch (e: any) {
      setMsg(e.message);
    }
    await refresh();
  };

  return (
    <View style={{ padding: 16, gap: 12, flex: 1 }}>
      <Button title="Send now" onPress={send} />
      <Text>{msg}</Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.sessionId}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8, gap: 4 }}>
            <Text>{item.status.toUpperCase()} — attempts {item.attempts}</Text>
            {item.sessionUrl ? <Text>{item.sessionUrl}</Text> : null}
            {item.error ? <Text style={{ color: 'red' }}>{item.error}</Text> : null}
            {item.status !== 'sent' ? (
              <Button title="Retry" onPress={() => retry(item.sessionId)} />
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

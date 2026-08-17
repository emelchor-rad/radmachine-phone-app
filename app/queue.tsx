import { useCallback, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { allRows, type OutboxRow } from '../src/db/outbox';
import { drainOutbox } from '../src/sync/drain';

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
      const n = await drainOutbox();
      setMsg(`Processed ${n} session(s).`);
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
          <View style={{ paddingVertical: 8 }}>
            <Text>{item.status.toUpperCase()} — attempts {item.attempts}</Text>
            {item.sessionUrl ? <Text>{item.sessionUrl}</Text> : null}
            {item.error ? <Text style={{ color: 'red' }}>{item.error}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}

import { useCallback, useState } from 'react';
import { Button, FlatList, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { RadClient } from '../src/api/client';
import { flattenTestList } from '../src/api/definitions';
import { listCollections, saveCollection, type Collection } from '../src/db/collections';
import { createSession } from '../src/db/sessions';
import { loadCredentials } from '../src/secure/credentials';
import { nowStamp } from '../src/sync/time';

export default function Catalogue() {
  const [local, setLocal] = useState<Collection[]>([]);
  const [remote, setRemote] = useState<any[]>([]);
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
      const r = await c.get<any>('/qa/unittestcollections/');
      setRemote(r.results ?? []);
      setMsg('');
    } catch (e: any) {
      setMsg(e.message);
    }
  };

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
    <View style={{ padding: 16, gap: 12, flex: 1 }}>
      <Button title="Connection settings" onPress={() => router.push('/connect')} />
      <Button title="Send queue" onPress={() => router.push('/queue')} />
      <Button title="Browse instance" onPress={browse} />
      <Text>{msg}</Text>

      <Text style={{ fontWeight: 'bold' }}>Available offline</Text>
      <FlatList
        data={local}
        keyExtractor={(i) => i.utcUrl}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8 }}>
            <Text>{item.unitName} — {item.utcName}</Text>
            <Button title="Start session" onPress={() => startSession(item)} />
          </View>
        )}
      />

      <Text style={{ fontWeight: 'bold' }}>On the instance</Text>
      <FlatList
        data={remote}
        keyExtractor={(i) => i.url}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 8 }}>
            <Text>{item.name}</Text>
            <Button title="Download" onPress={() => download(item)} />
          </View>
        )}
      />
    </View>
  );
}

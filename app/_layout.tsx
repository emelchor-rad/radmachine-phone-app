import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Stack } from 'expo-router';
import { drainOutbox } from '../src/sync/drain';

export default function Layout() {
  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) {
        drainOutbox().catch(() => {});
      }
    });
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') drainOutbox().catch(() => {});
    });
    return () => {
      unsubNet();
      sub.remove();
    };
  }, []);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Collections' }} />
      <Stack.Screen name="connect" options={{ title: 'Connection' }} />
      <Stack.Screen name="queue" options={{ title: 'Send queue' }} />
      <Stack.Screen name="worksheet/[sessionId]" options={{ title: 'Worksheet' }} />
    </Stack>
  );
}

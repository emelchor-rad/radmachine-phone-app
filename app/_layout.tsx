import { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Stack } from 'expo-router';
import { ErrorBoundary } from '../src/ui/ErrorBoundary';
import { drainOutbox } from '../src/sync/drain';
import { refreshSchedule } from '../src/sync/refresh';

/**
 * Leaving the bunker should both send the work and refresh what is due, in the
 * same moment and without being asked. Failures are swallowed on purpose:
 * these run in the background and the screens report their own state.
 */
function syncAll() {
  drainOutbox().catch(() => {});
  refreshSchedule(new Date().toISOString()).catch(() => {});
}

export default function Layout() {
  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((s) => {
      if (s.isConnected && s.isInternetReachable !== false) syncAll();
    });
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') syncAll();
    });
    return () => {
      unsubNet();
      sub.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="connect" options={{ title: 'Connection' }} />
        <Stack.Screen name="queue" options={{ title: 'Send queue' }} />
        <Stack.Screen name="worksheet/[sessionId]" options={{ title: 'Worksheet' }} />
      </Stack>
    </ErrorBoundary>
  );
}

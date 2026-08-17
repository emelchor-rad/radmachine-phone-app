import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Collections' }} />
      <Stack.Screen name="connect" options={{ title: 'Connection' }} />
      <Stack.Screen name="queue" options={{ title: 'Send queue' }} />
      <Stack.Screen name="worksheet/[sessionId]" options={{ title: 'Worksheet' }} />
    </Stack>
  );
}

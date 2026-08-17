import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="downloaded" options={{ title: 'Downloaded' }} />
      <Tabs.Screen name="browse" options={{ title: 'Browse' }} />
    </Tabs>
  );
}

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      {/* Filled when focused, outline otherwise -- the tab bar's own colour
          already marks the selection, but on a small phone the silhouette is
          what reads first. */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloaded"
        options={{
          title: 'Downloaded',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'arrow-down-circle' : 'arrow-down-circle-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

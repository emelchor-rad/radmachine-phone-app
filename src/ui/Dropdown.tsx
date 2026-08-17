import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';

/**
 * A dropdown built from core React Native components only.
 *
 * Deliberately NOT @react-native-picker/picker: a native module that is not
 * bundled into Expo Go crashes on the device, and the phone is the only place
 * this app is ever tested.
 */

export type Option = { value: string; label: string };

export function Dropdown({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: Option[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? 'select'}`}
        onPress={() => setOpen(true)}
        style={{
          borderWidth: 1,
          borderColor: '#888',
          borderRadius: 4,
          paddingVertical: 10,
          paddingHorizontal: 12,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text numberOfLines={1} style={{ flexShrink: 1 }}>
          {current?.label ?? 'Select...'}
        </Text>
        <Text style={{ marginLeft: 8 }}>▼</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/* Tapping the backdrop closes, so the phone's back button is not the
            only way out. */}
        <Pressable
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: '#0008',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 6,
              maxHeight: '70%',
              overflow: 'hidden',
            }}
          >
            <Text style={{ fontWeight: 'bold', padding: 12 }}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              renderItem={({ item }) => {
                const selected = item.value === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      onSelect(item.value);
                      setOpen(false);
                    }}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      backgroundColor: selected ? '#e6f0ff' : 'white',
                    }}
                  >
                    <Text style={{ fontWeight: selected ? 'bold' : 'normal' }}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

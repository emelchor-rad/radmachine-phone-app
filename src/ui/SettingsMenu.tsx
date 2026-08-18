import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

/**
 * The gear in the header, and the little menu it opens.
 *
 * Connection and Queue used to be two buttons on Browse. They are not browsing:
 * they are app-level destinations that a physicist reaches for from wherever she
 * happens to be -- typically from the Dashboard, after it says a session is
 * waiting to send. Living in the navigator's header, the gear is on every tab
 * instead of only the one that had room for the buttons.
 *
 * Built from core React Native only, like Dropdown, and for the same reason: a
 * native module that Expo Go does not bundle crashes on the device, and the
 * phone is the only place this app is ever tested.
 */

type Item = {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  route: string;
};

const ITEMS: Item[] = [
  { label: 'Connection', icon: 'link-outline', route: '/connect' },
  { label: 'Queue', icon: 'cloud-upload-outline', route: '/queue' },
];

/**
 * How far down the sheet sits, in dp.
 *
 * A transparent Modal covers the whole window, status bar included, so the sheet
 * has to be pushed past the header by hand to look like it dropped out of the
 * gear. Android's status bar is 24 and the navigator's header 56; the extra 4
 * keeps the sheet clear of the header's bottom edge. It is cosmetic only -- the
 * menu works wherever it lands, and the backdrop still closes it.
 */
const HEADER_DROP = 84;

export function SettingsMenu() {
  const [open, setOpen] = useState(false);

  const go = (route: string) => {
    // Close first: leaving the modal mounted over the screen being pushed to
    // makes the destination arrive behind a grey backdrop.
    setOpen(false);
    router.push(route);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        onPress={() => setOpen(true)}
        // A gear glyph is ~24dp; the padding is what makes the target big
        // enough to hit with a thumb at the very edge of the screen.
        style={{ paddingHorizontal: 12, paddingVertical: 8 }}
      >
        <Ionicons name="settings-outline" size={24} color="#333" />
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
            alignItems: 'flex-end',
            paddingTop: HEADER_DROP,
            paddingHorizontal: 8,
          }}
        >
          <View
            style={{
              backgroundColor: 'white',
              borderRadius: 6,
              minWidth: 180,
              overflow: 'hidden',
              paddingVertical: 4,
            }}
          >
            {ITEMS.map((item) => (
              <Pressable
                key={item.route}
                accessibilityRole="button"
                onPress={() => go(item.route)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                }}
              >
                <Ionicons name={item.icon} size={18} color="#333" />
                <Text style={{ fontSize: 16 }}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

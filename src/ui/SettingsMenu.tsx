import { useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { clearAllDownloaded } from '../db/clear-downloaded';

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
  route?: string;
  destructive?: boolean;
  onPress?: () => void;
};

const ITEMS: Item[] = [
  { label: 'Connection', icon: 'link-outline', route: '/connect' },
  { label: 'Queue', icon: 'cloud-upload-outline', route: '/queue' },
  {
    label: 'Clear downloaded',
    icon: 'trash-outline',
    destructive: true,
    onPress: () => {
      Alert.alert(
        'Clear downloaded lists?',
        'Removes every downloaded list, test, worksheet draft, schedule row, and queued payload. Your connection settings stay saved.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear everything',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  await clearAllDownloaded();
                  Alert.alert(
                    'Downloaded data cleared',
                    'Use Browse to download lists again. Open Connection once if the instance name bar does not appear.'
                  );
                  router.replace('/');
                } catch (e: any) {
                  Alert.alert('Could not clear', e?.message ?? String(e));
                }
              })();
            },
          },
        ]
      );
    },
  },
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

export function SettingsMenu({ light = false }: { light?: boolean }) {
  const [open, setOpen] = useState(false);

  const go = (route: string) => {
    // Close first: leaving the modal mounted over the screen being pushed to
    // makes the destination arrive behind a grey backdrop.
    setOpen(false);
    router.push(route);
  };

  const activate = (item: Item) => {
    setOpen(false);
    if (item.onPress) item.onPress();
    else if (item.route) go(item.route);
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
        <Ionicons name="settings-outline" size={24} color={light ? '#fff' : '#333'} />
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
                key={item.label}
                accessibilityRole="button"
                onPress={() => activate(item)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                }}
              >
                <Ionicons name={item.icon} size={18} color={item.destructive ? '#b00020' : '#333'} />
                <Text style={{ fontSize: 16, color: item.destructive ? '#b00020' : '#333' }}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

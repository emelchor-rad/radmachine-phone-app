import { Text, View, type ViewStyle } from 'react-native';
import { RADMACHINE_BLUE } from '../secure/credentials';

/** RadMachine-style top/bottom chrome bar (blue background, white text). */
export function InstanceBar({
  label,
  style,
  centered = false,
}: {
  label: string;
  style?: ViewStyle;
  centered?: boolean;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: RADMACHINE_BLUE,
          paddingVertical: 12,
          paddingHorizontal: 16,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: 'white',
          fontWeight: 'bold',
          fontSize: 16,
          textAlign: centered ? 'center' : 'left',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

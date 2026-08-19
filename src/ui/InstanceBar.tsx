import { Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RADMACHINE_BLUE, RAD_DANGER } from './theme';

type BarVariant = 'blue' | 'danger';

/** RadMachine-style chrome bar (blue instance header or red warning footer). */
export function InstanceBar({
  label,
  style,
  centered = false,
  variant = 'blue',
  safeTop = false,
  safeBottom = false,
}: {
  label: string;
  style?: ViewStyle;
  centered?: boolean;
  variant?: BarVariant;
  /** Extend into the status-bar inset (worksheet top bar). */
  safeTop?: boolean;
  /** Respect home-indicator inset (worksheet warning footer). */
  safeBottom?: boolean;
}) {
  const backgroundColor = variant === 'danger' ? RAD_DANGER : RADMACHINE_BLUE;

  const body = (
    <View
      style={[
        {
          backgroundColor,
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

  if (safeTop) {
    return (
      <SafeAreaView edges={['top']} style={{ backgroundColor }}>
        {body}
      </SafeAreaView>
    );
  }
  if (safeBottom) {
    return (
      <SafeAreaView edges={['bottom']} style={{ backgroundColor }}>
        {body}
      </SafeAreaView>
    );
  }
  return body;
}

import { Pressable, Text, View } from 'react-native';

/**
 * The two-option Pass / Fail control for a boolean test, as RadMachine shows it.
 *
 * A <Switch> has two visual states for three logical ones. A boolean test that
 * was never touched (value null, submitted as {skipped: true}) and one
 * deliberately recorded as Fail (value false) are both "switch off" -- pixel
 * identical. On a walkaround list that is mostly booleans, a column of off
 * switches reads as "I recorded these as failing" when in fact nothing was
 * recorded at all. RadMachine's own record tells the two apart, so the server is
 * never misled; only the phone was.
 *
 * So: two buttons and a genuine third state. Nothing is highlighted until the
 * physicist taps, and the unrecorded state says so in words next to the buttons
 * rather than being inferred from the absence of a highlight. Tapping the option
 * that is already chosen clears it back to unrecorded -- without that, undoing a
 * mistaken tap would mean abandoning the session.
 *
 * Core React Native only, like Dropdown and SettingsMenu, and for the same
 * reason: a native module Expo Go does not bundle crashes on the device, and the
 * phone is the only place this app is ever tested.
 */

const PASS = '#1b7f3b';
const FAIL = '#b00020';
const IDLE_BORDER = '#9a9a9a';
const IDLE_TEXT = '#444';
const MUTED = '#666';

/**
 * Height of each button, in dp.
 *
 * Android's own minimum is 48. This is used at a linac console with gloves on,
 * where the thumb's contact patch is bigger and less precise than a bare finger,
 * so the target is deliberately over that minimum.
 */
const TARGET = 52;

function Choice({
  text,
  glyph,
  tint,
  selected,
  onPress,
  accessibilityLabel,
}: {
  text: string;
  glyph: string;
  tint: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={
        selected ? 'Tap again to clear this reading' : undefined
      }
      onPress={onPress}
      style={{
        minHeight: TARGET,
        minWidth: 104,
        paddingHorizontal: 16,
        borderRadius: 6,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? tint : IDLE_BORDER,
        // Filled when chosen, plain outline when not. The fill is what makes a
        // recorded Fail impossible to mistake for a test nobody touched.
        backgroundColor: selected ? tint : 'white',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {/* The glyph carries the same distinction as the colour, so Pass and Fail
          stay apart for a red-green colourblind eye. */}
      <Text
        style={{
          fontSize: 16,
          color: selected ? 'white' : IDLE_TEXT,
          fontWeight: selected ? 'bold' : 'normal',
        }}
      >
        {glyph}
      </Text>
      <Text
        style={{
          fontSize: 16,
          color: selected ? 'white' : IDLE_TEXT,
          fontWeight: selected ? 'bold' : 'normal',
        }}
      >
        {text}
      </Text>
    </Pressable>
  );
}

export function PassFail({
  value,
  onChange,
  label,
}: {
  /** true = Pass, false = Fail, null = nothing recorded yet. */
  value: boolean | null;
  /** Emits null when the chosen option is tapped again, clearing the reading. */
  onChange: (value: boolean | null) => void;
  /** Test name, used to make the two buttons distinguishable to a screen reader. */
  label?: string;
}) {
  const prefix = label ? `${label}: ` : '';
  // Tapping what is already chosen clears it. Any other tap records.
  const choose = (option: boolean) => onChange(value === option ? null : option);

  return (
    <View
      accessibilityRole="radiogroup"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
      }}
    >
      <Choice
        text="Pass"
        glyph="✓"
        tint={PASS}
        selected={value === true}
        onPress={() => choose(true)}
        accessibilityLabel={`${prefix}Pass`}
      />
      <Choice
        text="Fail"
        glyph="✕"
        tint={FAIL}
        selected={value === false}
        onPress={() => choose(false)}
        accessibilityLabel={`${prefix}Fail`}
      />
      {value === null ? (
        // Said in words, so the state reads as a state and not as a control
        // that failed to draw. This is also exactly what the pre-submit summary
        // will list under "Skipped".
        <Text style={{ color: MUTED, fontSize: 13, fontStyle: 'italic' }}>
          not recorded
        </Text>
      ) : null}
    </View>
  );
}

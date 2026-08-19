import { TextInput, type TextInputProps } from 'react-native';

const READONLY_BG = '#e8e8e8';

/** Gray, non-editable field — used for calculated composites on the worksheet. */
export function ReadOnlyField({
  value,
  placeholder,
  borderColor = '#888',
  accessibilityLabel,
}: {
  value: string;
  placeholder?: string;
  borderColor?: string;
  accessibilityLabel?: string;
}) {
  return (
    <TextInput
      editable={false}
      value={value}
      placeholder={placeholder}
      accessibilityLabel={accessibilityLabel}
      style={{
        borderWidth: 2,
        borderColor,
        backgroundColor: READONLY_BG,
        padding: 10,
        color: '#333',
        fontSize: 16,
      }}
    />
  );
}

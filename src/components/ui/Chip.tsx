import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { AppText } from './AppText';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: string;
  disabled?: boolean;
};

export function Chip({ label, selected = false, onPress, disabled = false }: ChipProps) {
  const { theme } = useTheme();
  const content = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.text : theme.colors.surface,
          borderColor: selected ? theme.colors.text : theme.colors.border,
          borderRadius: theme.radii.pill,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <AppText
        variant="caption"
        color={selected ? theme.colors.textInverse : theme.colors.textMuted}
        weight="600"
        align="center"
      >
        {label}
      </AppText>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});

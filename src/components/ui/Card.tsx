import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';

type CardProps = ViewProps & {
  padded?: boolean;
  elevated?: boolean;
  tone?: 'default' | 'brand' | 'danger' | 'success' | 'warning';
  style?: ViewStyle;
};

export function Card({
  padded = true,
  elevated = false,
  tone = 'default',
  style,
  children,
  ...rest
}: CardProps) {
  const { theme } = useTheme();
  const tones = {
    default: theme.colors.surface,
    brand: theme.colors.infoSoft,
    danger: theme.colors.dangerSoft,
    success: theme.colors.successSoft,
    warning: theme.colors.warningSoft,
  } as const;

  return (
    <View
      {...rest}
      style={[
        styles.card,
        {
          backgroundColor: tones[tone],
          borderColor: theme.colors.border,
          borderRadius: theme.radii.lg,
          padding: padded ? theme.spacing.lg : 0,
        },
        elevated ? theme.shadow.card : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});

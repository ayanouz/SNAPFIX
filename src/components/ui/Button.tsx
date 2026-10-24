import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { AppText } from './AppText';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  size?: 'sm' | 'md' | 'lg';
  accessibilityHint?: string;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = true,
  size = 'md',
  accessibilityHint,
  style,
}: ButtonProps) {
  const { theme } = useTheme();
  const { isRTL } = useI18n();
  const isDisabled = disabled || loading;

  const background: Record<ButtonVariant, string> = {
    primary: theme.colors.brand,
    secondary: theme.colors.surface,
    ghost: 'transparent',
    danger: theme.colors.danger,
    subtle: theme.colors.surfaceAlt,
  };
  const foreground: Record<ButtonVariant, string> = {
    primary: theme.colors.onBrand,
    secondary: theme.colors.text,
    ghost: theme.colors.brand,
    danger: '#FFFFFF',
    subtle: theme.colors.text,
  };
  const border: Record<ButtonVariant, string | undefined> = {
    primary: undefined,
    secondary: theme.colors.border,
    ghost: undefined,
    danger: undefined,
    subtle: undefined,
  };
  const heights = { sm: 40, md: 50, lg: 56 } as const;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: heights[size],
          paddingHorizontal: size === 'sm' ? theme.spacing.md : theme.spacing.lg,
          backgroundColor: background[variant],
          borderColor: border[variant],
          borderWidth: border[variant] ? 1 : 0,
          borderRadius: theme.radii.md,
          opacity: isDisabled ? 0.55 : pressed ? 0.86 : 1,
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground[variant]} />
      ) : (
        <View style={[styles.content, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {icon ? (
            <Ionicons name={icon} size={size === 'sm' ? 17 : 19} color={foreground[variant]} />
          ) : null}
          <AppText variant="label" color={foreground[variant]} align="center" style={styles.label}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontSize: 15,
  },
});

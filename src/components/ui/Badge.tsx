import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { AppText } from './AppText';

export type BadgeTone =
  'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'critical' | 'info';

type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  icon?: string;
};

export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  const { theme } = useTheme();
  const tones: Record<BadgeTone, { background: string; color: string }> = {
    neutral: { background: theme.colors.surfaceAlt, color: theme.colors.textMuted },
    brand: { background: theme.colors.infoSoft, color: theme.colors.info },
    success: { background: theme.colors.successSoft, color: theme.colors.success },
    warning: { background: theme.colors.warningSoft, color: theme.colors.warning },
    danger: { background: theme.colors.dangerSoft, color: theme.colors.danger },
    critical: { background: theme.colors.criticalSoft, color: theme.colors.critical },
    info: { background: theme.colors.infoSoft, color: theme.colors.info },
  };
  const palette = tones[tone];

  return (
    <View style={[styles.badge, { backgroundColor: palette.background }]}>
      <AppText variant="caption" color={palette.color} weight="700" align="center">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
});

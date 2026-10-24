import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { AppText } from './AppText';

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { theme } = useTheme();
  const { isRTL } = useI18n();
  return (
    <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <AppText variant="subtitle" style={styles.flex}>
        {title}
      </AppText>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          hitSlop={8}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.6 : 1 }]}
        >
          <AppText variant="label" color={theme.colors.brand}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ProgressBar({ value, tone }: { value: number; tone?: string }) {
  const { theme } = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View
      style={[styles.track, { backgroundColor: theme.colors.surfaceAlt }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <View
        style={[
          styles.fill,
          { width: `${clamped * 100}%`, backgroundColor: tone ?? theme.colors.brand },
        ]}
      />
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
  icon = 'document-text-outline',
  onPress,
  right,
  tone = 'default',
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  right?: React.ReactNode;
  tone?: 'default' | 'danger';
}) {
  const { theme } = useTheme();
  const { isRTL } = useI18n();
  const color = tone === 'danger' ? theme.colors.danger : theme.colors.text;

  const content = (
    <View
      style={[
        styles.listRow,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.md,
          flexDirection: isRTL ? 'row-reverse' : 'row',
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: theme.colors.surfaceAlt }]}>
        <Ionicons
          name={icon}
          size={20}
          color={tone === 'danger' ? theme.colors.danger : theme.colors.brand}
        />
      </View>
      <View style={[styles.flex, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
        <AppText variant="label" color={color} numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color={theme.colors.textMuted} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
        {meta ? (
          <AppText variant="caption" color={theme.colors.textMuted}>
            {meta}
          </AppText>
        ) : null}
      </View>
      {right ??
        (onPress ? (
          <Ionicons
            name={isRTL ? 'chevron-back' : 'chevron-forward'}
            size={18}
            color={theme.colors.textMuted}
          />
        ) : null)}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  flex: { flex: 1, gap: 2 },
  action: { paddingVertical: 4 },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  listRow: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 12,
    alignItems: 'center',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

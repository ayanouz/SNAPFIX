import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { errorTranslationKey, normalizeError } from '@/domain/errors';
import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';

export function LoadingView({ message }: { message?: string }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.colors.brand} />
      <AppText variant="body" color={theme.colors.textMuted} align="center">
        {message ?? t('common.loading')}
      </AppText>
    </View>
  );
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.center}>
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border },
        ]}
      >
        <Ionicons name={icon} size={28} color={theme.colors.textMuted} />
      </View>
      <AppText variant="subtitle" align="center">
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" color={theme.colors.textMuted} align="center">
          {body}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} fullWidth={false} />
      ) : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const normalized = normalizeError(error);
  const detailKey = errorTranslationKey(normalized);
  return (
    <Card tone="danger" style={styles.errorCard}>
      <View style={styles.errorRow}>
        <Ionicons name="alert-circle-outline" size={22} color={theme.colors.danger} />
        <View style={styles.flex}>
          <AppText variant="subtitle" color={theme.colors.danger}>
            {t('errors.title')}
          </AppText>
          <AppText variant="body" color={theme.colors.text}>
            {t(detailKey)}
          </AppText>
          {normalized.code === 'unknown' ? (
            <AppText variant="caption" color={theme.colors.textMuted}>
              {normalized.message}
            </AppText>
          ) : null}
        </View>
      </View>
      {onRetry ? (
        <Button label={t('common.retry')} onPress={onRetry} variant="secondary" icon="refresh" />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 32,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    gap: 14,
  },
  errorRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  flex: { flex: 1, gap: 4 },
});

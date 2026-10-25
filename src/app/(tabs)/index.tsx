import { useEffect, useMemo, useRef } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  AppText,
  Badge,
  Button,
  Card,
  DemoBanner,
  EmptyState,
  ErrorState,
  LoadingView,
  ProgressBar,
  Screen,
  SectionHeader,
} from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { useDiagnosisHistory, useMaintenance, useProfile, useUsage } from '@/hooks/queries';
import { formatRelativeDate, isDateWithinDays, truncate } from '@/utils/format';
import { trackEvent } from '@/services/analytics';

export default function HomeScreen() {
  const { theme } = useTheme();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const { session } = useAuth();
  const profile = useProfile();
  const usage = useUsage();
  const history = useDiagnosisHistory({});
  const maintenance = useMaintenance();
  const trackedReturn = useRef(false);

  useEffect(() => {
    if (trackedReturn.current || !session?.user.id) return;
    trackedReturn.current = true;
    void trackEvent(session.user.id, 'return_visit');
  }, [session?.user.id]);

  const recent = useMemo(
    () => (history.data?.pages ?? []).flatMap((page) => page.items).slice(0, 3),
    [history.data],
  );

  const dueTasks = useMemo(
    () =>
      (maintenance.data ?? []).filter(
        (task) => task.isActive && isDateWithinDays(task.nextDueDate, 30),
      ),
    [maintenance.data],
  );

  const greetingName = profile.data?.displayName || session?.user.displayName || '';
  const usageRemaining = usage.data ? Math.max(0, usage.data.limit - usage.data.used) : null;

  return (
    <Screen>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={styles.headerText}>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {t('home.greeting')}
            {greetingName ? `, ${greetingName}` : ''}
          </AppText>
          <AppText variant="title">{t('home.subtitle')}</AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tabs.profile')}
          onPress={() => router.push('/(tabs)/profile')}
          style={[styles.avatar, { backgroundColor: theme.colors.brand }]}
        >
          <AppText variant="subtitle" color={theme.colors.onBrand} align="center">
            {(greetingName || 'S').slice(0, 1).toUpperCase()}
          </AppText>
        </Pressable>
      </View>

      <DemoBanner />

      <Card tone="brand" style={styles.hero}>
        <View style={[styles.heroRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.heroIcon, { backgroundColor: theme.colors.infoSoft }]}>
            <Ionicons name="camera-outline" size={26} color={theme.colors.info} />
          </View>
          <View style={styles.flex}>
            <AppText variant="title" color={theme.colors.text}>
              {t('home.new_diagnosis')}
            </AppText>
            <AppText variant="body" color={theme.colors.textMuted}>
              {t('home.new_diagnosis_body')}
            </AppText>
          </View>
        </View>
        <Button
          label={t('home.new_diagnosis')}
          icon="add-circle-outline"
          onPress={() => router.push('/diagnose')}
        />
      </Card>

      <Card style={styles.usageCard}>
        <View style={[styles.rowBetween, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <AppText variant="subtitle">{t('home.usage')}</AppText>
          <Badge
            label={usage.data?.plan === 'premium' ? t('home.usage_premium') : t('home.usage_free')}
            tone={usage.data?.plan === 'premium' ? 'brand' : 'neutral'}
          />
        </View>
        {usage.isLoading ? (
          <AppText variant="caption" color={theme.colors.textMuted}>
            {t('common.loading')}
          </AppText>
        ) : usage.isError ? (
          <AppText variant="caption" color={theme.colors.danger}>
            {t('errors.network')}
          </AppText>
        ) : usage.data ? (
          <>
            <ProgressBar
              value={usage.data.limit === 0 ? 0 : usage.data.used / usage.data.limit}
              tone={usageRemaining === 0 ? theme.colors.danger : theme.colors.brand}
            />
            <View style={[styles.rowBetween, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <AppText variant="caption" color={theme.colors.textMuted}>
                {t('home.usage_remaining', {
                  remaining: usageRemaining ?? 0,
                  limit: usage.data.limit,
                })}
              </AppText>
              {usage.data.plan === 'free' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/settings/subscription')}
                >
                  <AppText variant="label" color={theme.colors.brand}>
                    {t('profile.upgrade')}
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}
      </Card>

      {dueTasks.length > 0 ? (
        <Card tone="warning" style={styles.dueCard}>
          <View style={[styles.rowBetween, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Ionicons name="calendar-outline" size={20} color={theme.colors.warning} />
              <AppText variant="subtitle" color={theme.colors.warning}>
                {t('home.maintenance_due')}
              </AppText>
            </View>
            <Badge label={String(dueTasks.length)} tone="warning" />
          </View>
          <AppText variant="body">{dueTasks[0]?.itemDescription}</AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {dueTasks[0]?.taskDescription}
          </AppText>
          <Button
            label={t('home.see_maintenance')}
            variant="secondary"
            size="sm"
            onPress={() => router.push('/(tabs)/maintenance')}
          />
        </Card>
      ) : null}

      <View style={styles.section}>
        <SectionHeader
          title={t('home.recent')}
          actionLabel={t('home.view_all')}
          onAction={() => router.push('/(tabs)/history')}
        />
        {history.isLoading ? (
          <LoadingView message={t('common.loading')} />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => void history.refetch()} />
        ) : recent.length === 0 ? (
          <EmptyState
            icon="camera-outline"
            title={t('home.empty_title')}
            body={t('home.empty_body')}
            actionLabel={t('home.new_diagnosis')}
            onAction={() => router.push('/diagnose')}
          />
        ) : (
          <View style={styles.list}>
            {recent.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/diagnosis/[id]', params: { id: item.id } })
                }
                style={({ pressed }) => [
                  styles.recentRow,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radii.md,
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                {item.thumbnailUri ? (
                  <Image source={{ uri: item.thumbnailUri }} style={styles.thumb} />
                ) : (
                  <View
                    style={[
                      styles.thumb,
                      styles.thumbFallback,
                      { backgroundColor: theme.colors.surfaceAlt },
                    ]}
                  >
                    <Ionicons name="image-outline" size={20} color={theme.colors.textMuted} />
                  </View>
                )}
                <View style={[styles.flex, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  <AppText variant="label" numberOfLines={1}>
                    {item.identifiedType || truncate(item.description, 60)}
                  </AppText>
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    {formatRelativeDate(item.createdAt, language)}
                  </AppText>
                  <Badge
                    label={t(`history.status_${item.status}`)}
                    tone={
                      item.status === 'completed'
                        ? 'success'
                        : item.status === 'failed'
                          ? 'danger'
                          : 'warning'
                    }
                  />
                </View>
                <Ionicons
                  name={isRTL ? 'chevron-back' : 'chevron-forward'}
                  size={18}
                  color={theme.colors.textMuted}
                />
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <Card style={styles.safety}>
        <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="warning-outline" size={20} color={theme.colors.danger} />
          <AppText variant="subtitle" color={theme.colors.danger}>
            {t('home.safety_title')}
          </AppText>
        </View>
        <AppText variant="body" color={theme.colors.textMuted}>
          {t('home.safety_body')}
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headerText: { flex: 1, gap: 2 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { gap: 14 },
  heroRow: { gap: 12, alignItems: 'flex-start' },
  heroIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: 3 },
  usageCard: { gap: 10 },
  rowBetween: { justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  dueCard: { gap: 8 },
  inline: { alignItems: 'center', gap: 8 },
  section: { gap: 10 },
  list: { gap: 8 },
  recentRow: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 12,
    alignItems: 'center',
  },
  thumb: { width: 54, height: 54, borderRadius: 10 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  safety: { gap: 8 },
});

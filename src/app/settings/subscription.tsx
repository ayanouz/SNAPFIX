import { useEffect } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingView,
  Screen,
  ScreenHeader,
} from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useUsage } from '@/hooks/queries';
import { useAuth } from '@/providers/AuthProvider';
import { usePreferencesStore } from '@/stores/preferences';
import { formatCurrency } from '@/utils/format';
import { PLAN_LIMITS } from '@/domain/usage';
import { trackEvent } from '@/services/analytics';

export default function SubscriptionScreen() {
  const { theme } = useTheme();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const usage = useUsage();
  const { session } = useAuth();
  const currency = usePreferencesStore((state) => state.currency);
  const isPremium = usage.data?.plan === 'premium';

  useEffect(() => {
    void trackEvent(session?.user.id ?? null, 'subscription_screen_viewed');
  }, [session?.user.id]);

  const showBillingUnavailable = () => {
    Alert.alert(
      t('subscription.billing_unavailable_title'),
      t('subscription.billing_unavailable_body'),
      [
        { text: t('common.close'), style: 'cancel' },
        {
          text: t('subscription.contact_support'),
          onPress: () => router.push('/settings/support'),
        },
      ],
    );
  };

  if (usage.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t('subscription.title')} back />
        <LoadingView />
      </Screen>
    );
  }

  if (usage.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('subscription.title')} back />
        <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />
      </Screen>
    );
  }

  const features = [
    t('subscription.feature_1'),
    t('subscription.feature_2'),
    t('subscription.feature_3'),
    t('subscription.feature_4'),
    t('subscription.feature_5'),
  ];

  return (
    <Screen>
      <ScreenHeader title={t('subscription.title')} subtitle={t('subscription.subtitle')} back />

      <Card tone="brand" style={styles.hero}>
        <View style={[styles.rowBetween, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={styles.flex}>
            <AppText variant="display" color={theme.colors.text}>
              {t('subscription.premium_title')}
            </AppText>
            <AppText variant="body" color={theme.colors.textMuted}>
              {t('subscription.premium_note')}
            </AppText>
          </View>
          <Ionicons name="sparkles" size={32} color={theme.colors.brand} />
        </View>
        <View style={styles.features}>
          {features.map((feature) => (
            <View
              key={feature}
              style={[styles.featureRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            >
              <Ionicons name="checkmark-circle" size={19} color={theme.colors.success} />
              <AppText variant="body" style={styles.flex}>
                {feature}
              </AppText>
            </View>
          ))}
        </View>
      </Card>

      <Card style={styles.planCard}>
        <View style={[styles.rowBetween, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={styles.flex}>
            <AppText variant="subtitle">
              {isPremium ? t('subscription.premium_title') : t('subscription.free_title')}
            </AppText>
            <AppText variant="body" color={theme.colors.textMuted}>
              {isPremium
                ? t('subscription.entitlement_active')
                : t('subscription.entitlement_inactive')}
            </AppText>
          </View>
          <Badge
            label={isPremium ? t('subscription.current_plan') : t('subscription.free_title')}
            tone={isPremium ? 'brand' : 'neutral'}
          />
        </View>
        <AppText variant="caption" color={theme.colors.textMuted}>
          {t('subscription.usage_this_month', {
            used: usage.data?.used ?? 0,
            limit: usage.data?.limit ?? PLAN_LIMITS.free.diagnosesPerMonth,
          })}
        </AppText>
        {!isPremium ? (
          <View style={[styles.priceRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <AppText variant="title">{formatCurrency(0, currency, language)}</AppText>
            <AppText variant="caption" color={theme.colors.textMuted}>
              {t('subscription.free_title')}
            </AppText>
          </View>
        ) : null}
      </Card>

      <Card tone="warning" style={styles.billingCard}>
        <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="card-outline" size={22} color={theme.colors.warning} />
          <AppText variant="subtitle" color={theme.colors.warning} style={styles.flex}>
            {t('subscription.billing_unavailable_title')}
          </AppText>
        </View>
        <AppText variant="body" color={theme.colors.text}>
          {t('subscription.billing_unavailable_body')}
        </AppText>
      </Card>

      <View style={styles.actions}>
        <Button
          label={isPremium ? t('profile.manage_subscription') : t('subscription.upgrade_cta')}
          icon="sparkles-outline"
          onPress={showBillingUnavailable}
          disabled={isPremium}
        />
        <Button
          label={t('subscription.restore')}
          variant="secondary"
          icon="refresh-outline"
          onPress={() =>
            Alert.alert(t('subscription.restore'), t('subscription.restore_unavailable'))
          }
        />
        <Button
          label={t('subscription.contact_support')}
          variant="ghost"
          icon="chatbubble-ellipses-outline"
          onPress={() => router.push('/settings/support')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 16 },
  rowBetween: { justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  flex: { flex: 1, gap: 4 },
  features: { gap: 9 },
  featureRow: { alignItems: 'flex-start', gap: 8 },
  planCard: { gap: 10 },
  priceRow: { alignItems: 'baseline', gap: 8 },
  billingCard: { gap: 10 },
  inline: { alignItems: 'center', gap: 8 },
  actions: { gap: 8 },
});

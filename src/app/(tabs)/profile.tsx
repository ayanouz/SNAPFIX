import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  DemoBanner,
  LoadingView,
  Screen,
  ScreenHeader,
} from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth, useRepository } from '@/providers/AuthProvider';
import { useDeleteAllData, useProfile, useUsage } from '@/hooks/queries';
import { shareExport } from '@/services/share';
import {
  CURRENCIES,
  LANGUAGES,
  THEME_PREFERENCES,
  usePreferencesStore,
  type Currency,
  type Language,
  type ThemePreference,
} from '@/stores/preferences';
import { appConfig } from '@/constants/config';

export default function ProfileScreen() {
  const { theme, preference, setTheme } = useTheme();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const { session, signOut, deleteAccount } = useAuth();
  const repository = useRepository();
  const profile = useProfile();
  const usage = useUsage();
  const deleteAll = useDeleteAllData();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const setCurrency = usePreferencesStore((state) => state.setCurrency);
  const currency = usePreferencesStore((state) => state.currency);
  const displayName = profile.data?.displayName || session?.user.displayName || 'SNAPFIX user';
  const email = profile.data?.email || session?.user.email || '';

  const onExport = async () => {
    setExporting(true);
    try {
      const bundle = await repository.exportUserData();
      await shareExport(bundle);
      Alert.alert(t('common.done'), t('profile.export_ready'));
    } catch {
      Alert.alert(t('errors.title'), t('profile.export_failed'));
    } finally {
      setExporting(false);
    }
  };

  const onDeleteAll = () => {
    Alert.alert(t('profile.delete_data_confirm'), t('profile.delete_data_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setDeleting(true);
            try {
              await deleteAll.mutateAsync();
              Alert.alert(t('common.done'), t('profile.data_deleted'));
            } catch {
              Alert.alert(t('errors.title'), t('errors.unknown'));
            } finally {
              setDeleting(false);
            }
          })();
        },
      },
    ]);
  };

  const onSignOut = () => {
    Alert.alert(t('auth.sign_out_confirm'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.sign_out'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await signOut();
            router.replace('/(auth)/sign-in');
          })();
        },
      },
    ]);
  };

  const onDeleteAccount = () => {
    Alert.alert(t('auth.delete_account_confirm'), t('auth.delete_account_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('auth.delete_account'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              router.replace('/(auth)/sign-in');
            } catch {
              Alert.alert(t('errors.title'), t('errors.unknown'));
            } finally {
              setDeleting(false);
            }
          })();
        },
      },
    ]);
  };

  if (profile.isLoading) return <LoadingView />;

  return (
    <Screen>
      <ScreenHeader title={t('profile.title')} large />

      <View style={[styles.identity, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <View style={[styles.avatar, { backgroundColor: theme.colors.brand }]}>
          <AppText variant="title" color={theme.colors.onBrand} align="center">
            {displayName.slice(0, 1).toUpperCase()}
          </AppText>
        </View>
        <View style={[styles.flex, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <AppText variant="title">{displayName}</AppText>
          <AppText variant="body" color={theme.colors.textMuted}>
            {email}
          </AppText>
          <Badge
            label={
              usage.data?.plan === 'premium' ? t('profile.plan_premium') : t('profile.plan_free')
            }
            tone={usage.data?.plan === 'premium' ? 'brand' : 'neutral'}
          />
        </View>
      </View>

      <DemoBanner />

      <Card style={styles.planCard}>
        <View style={[styles.rowBetween, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={[styles.flex, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
            <AppText variant="subtitle">{t('profile.plan')}</AppText>
            {usage.data ? (
              <AppText variant="body" color={theme.colors.textMuted}>
                {t('subscription.usage_this_month', {
                  used: usage.data.used,
                  limit: usage.data.limit,
                })}
              </AppText>
            ) : null}
          </View>
          <Button
            label={
              usage.data?.plan === 'premium'
                ? t('profile.manage_subscription')
                : t('profile.upgrade')
            }
            variant="secondary"
            fullWidth={false}
            onPress={() => router.push('/settings/subscription')}
          />
        </View>
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle">{t('profile.language')}</AppText>
        <View style={styles.chips}>
          {LANGUAGES.map((code: Language) => (
            <Chip
              key={code}
              label={code === 'en' ? 'English' : code === 'fr' ? 'Français' : 'العربية'}
              selected={language === code}
              onPress={() => setLanguage(code)}
            />
          ))}
        </View>
        {language !== 'en' ? (
          <AppText variant="caption" color={theme.colors.textMuted}>
            {t('common.restart_required')}
          </AppText>
        ) : null}
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle">{t('profile.currency')}</AppText>
        <View style={styles.chips}>
          {CURRENCIES.map((code: Currency) => (
            <Chip
              key={code}
              label={code}
              selected={currency === code}
              onPress={() => setCurrency(code)}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle">{t('profile.theme')}</AppText>
        <View style={styles.chips}>
          {THEME_PREFERENCES.map((value: ThemePreference) => (
            <Chip
              key={value}
              label={t(`profile.theme_${value}`)}
              selected={preference === value}
              onPress={() => setTheme(value)}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle">{t('profile.support')}</AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings/support')}
          style={({ pressed }) => [
            styles.linkRow,
            { flexDirection: isRTL ? 'row-reverse' : 'row', opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="help-circle-outline" size={20} color={theme.colors.text} />
          <AppText variant="body" style={styles.flex}>
            {t('support.title')}
          </AppText>
          <Ionicons
            name={isRTL ? 'chevron-back' : 'chevron-forward'}
            size={18}
            color={theme.colors.textMuted}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings/privacy')}
          style={({ pressed }) => [
            styles.linkRow,
            { flexDirection: isRTL ? 'row-reverse' : 'row', opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.text} />
          <AppText variant="body" style={styles.flex}>
            {t('profile.privacy')}
          </AppText>
          <Ionicons
            name={isRTL ? 'chevron-back' : 'chevron-forward'}
            size={18}
            color={theme.colors.textMuted}
          />
        </Pressable>
        <Button
          label={t('profile.export_data')}
          variant="secondary"
          icon="download-outline"
          loading={exporting}
          onPress={() => void onExport()}
        />
      </Card>

      <Card style={styles.section}>
        <AppText variant="subtitle" color={theme.colors.danger}>
          {t('profile.delete_data')}
        </AppText>
        <AppText variant="body" color={theme.colors.textMuted}>
          {t('profile.delete_data_body')}
        </AppText>
        <Button
          label={t('profile.delete_data')}
          variant="danger"
          icon="trash-outline"
          loading={deleting}
          onPress={onDeleteAll}
        />
      </Card>

      <Card style={styles.section}>
        <Button
          label={t('auth.sign_out')}
          variant="secondary"
          icon="log-out-outline"
          onPress={onSignOut}
        />
        <Button
          label={t('auth.delete_account')}
          variant="ghost"
          icon="person-remove-outline"
          onPress={onDeleteAccount}
        />
        <AppText variant="caption" color={theme.colors.textMuted}>
          {t('profile.delete_account_note')}
        </AppText>
      </Card>

      <AppText variant="caption" color={theme.colors.textMuted} align="center">
        {t('app.version', { version: appConfig.version, build: appConfig.build })}
      </AppText>
      <AppText variant="caption" color={theme.colors.textMuted} align="center">
        {t('profile.made_with')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: 14 },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: 4 },
  planCard: { gap: 10 },
  rowBetween: { alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  section: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkRow: { alignItems: 'center', gap: 10, paddingVertical: 6 },
});

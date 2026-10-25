import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText, Button, Card, Chip, Screen } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { usePreferencesStore, LANGUAGES, type Language } from '@/stores/preferences';
import { useAuth } from '@/providers/AuthProvider';
import { appConfig } from '@/constants/config';
import { trackEvent } from '@/services/analytics';

const FEATURES = [
  { icon: 'camera-outline', title: 'onboarding.feature1_title', body: 'onboarding.feature1_body' },
  {
    icon: 'shield-checkmark-outline',
    title: 'onboarding.feature2_title',
    body: 'onboarding.feature2_body',
  },
  {
    icon: 'construct-outline',
    title: 'onboarding.feature3_title',
    body: 'onboarding.feature3_body',
  },
] as const;

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const { t, language } = useI18n();
  const router = useRouter();
  const { session } = useAuth();
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const completeOnboarding = usePreferencesStore((state) => state.completeOnboarding);

  const finishOnboarding = () => {
    completeOnboarding();
    void trackEvent(session?.user.id ?? null, 'onboarding_completed');
  };

  const start = () => {
    finishOnboarding();
    router.replace(session ? '/(tabs)' : '/(auth)/sign-in');
  };

  return (
    <Screen scroll contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View
          style={[
            styles.mark,
            { backgroundColor: theme.colors.brand, borderRadius: theme.radii.xl },
          ]}
        >
          <Ionicons name="scan-outline" size={34} color={theme.colors.onBrand} />
        </View>
        <AppText variant="display" align="center">
          {t('app.name')}
        </AppText>
        <AppText variant="title" align="center" color={theme.colors.textMuted}>
          {t('onboarding.title')}
        </AppText>
        <AppText variant="body" align="center" color={theme.colors.textMuted}>
          {t('onboarding.subtitle')}
        </AppText>
      </View>

      <View style={styles.features}>
        {FEATURES.map((feature) => (
          <Card key={feature.title} style={styles.feature}>
            <View style={[styles.featureIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Ionicons name={feature.icon} size={22} color={theme.colors.brand} />
            </View>
            <View style={styles.flex}>
              <AppText variant="subtitle">{t(feature.title)}</AppText>
              <AppText variant="body" color={theme.colors.textMuted}>
                {t(feature.body)}
              </AppText>
            </View>
          </Card>
        ))}
      </View>

      <Card tone="danger" style={styles.safety}>
        <View style={styles.safetyHeader}>
          <Ionicons name="warning-outline" size={22} color={theme.colors.danger} />
          <AppText variant="subtitle" color={theme.colors.danger} style={styles.flex}>
            {t('onboarding.safety_title')}
          </AppText>
        </View>
        <AppText variant="body">{t('onboarding.safety_body')}</AppText>
      </Card>

      <View style={styles.language}>
        <AppText variant="label" color={theme.colors.textMuted}>
          {t('onboarding.language')}
        </AppText>
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
      </View>

      <View style={styles.actions}>
        <Button label={t('onboarding.get_started')} onPress={start} icon="arrow-forward" />
        <Button
          label={t('onboarding.have_account')}
          variant="ghost"
          onPress={() => {
            finishOnboarding();
            router.replace('/(auth)/sign-in');
          }}
        />
      </View>

      {appConfig.demoMode ? (
        <AppText variant="caption" color={theme.colors.textMuted} align="center">
          {t('onboarding.demo_note')}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 24, gap: 22 },
  hero: { alignItems: 'center', gap: 10, paddingTop: 16 },
  mark: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  features: { gap: 10 },
  feature: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: 3 },
  safety: { gap: 10 },
  safetyHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  language: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { gap: 8, marginTop: 4 },
});

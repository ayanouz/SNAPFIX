import { StyleSheet, View } from 'react-native';
import { AppText, Card, Screen, ScreenHeader } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { appConfig } from '@/constants/config';

export default function LegalScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();

  return (
    <Screen>
      <ScreenHeader title={t('legal.title')} back />
      <AppText variant="body" color={theme.colors.textMuted}>
        {t('legal.intro')}
      </AppText>

      <Card style={styles.card}>
        <AppText variant="title">{t('legal.terms_title')}</AppText>
        <AppText variant="body">{t('legal.terms_body')}</AppText>
      </Card>

      <Card style={styles.card}>
        <AppText variant="title">{t('legal.privacy_title')}</AppText>
        <AppText variant="body">{t('legal.privacy_body')}</AppText>
      </Card>

      <Card style={styles.card}>
        <AppText variant="body">{t('legal.contact', { email: appConfig.supportEmail })}</AppText>
      </Card>

      <View style={styles.footer}>
        <AppText variant="caption" color={theme.colors.textMuted} align="center">
          {t('legal.last_updated')}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  footer: { paddingVertical: 12 },
});

import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { appConfig } from '@/constants/config';
import { AppText } from './AppText';

export function DemoBanner() {
  const { theme } = useTheme();
  const { t, isRTL } = useI18n();
  const { repository } = useAuth();
  const isDemo = (repository?.mode ?? (appConfig.demoMode ? 'demo' : 'live')) === 'demo';

  if (!isDemo) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.warningSoft,
          borderColor: theme.colors.warning,
          borderRadius: theme.radii.md,
          flexDirection: isRTL ? 'row-reverse' : 'row',
        },
      ]}
    >
      <Ionicons name="flask-outline" size={18} color={theme.colors.warning} />
      <View style={styles.flex}>
        <AppText variant="label" color={theme.colors.warning}>
          {t('demo.banner')}
        </AppText>
        <AppText variant="caption" color={theme.colors.textMuted}>
          {t('demo.banner_body')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  flex: { flex: 1, gap: 2 },
});

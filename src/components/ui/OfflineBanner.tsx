import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkState } from 'expo-network';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { AppText } from './AppText';

export function OfflineBanner() {
  const network = useNetworkState();
  const { theme } = useTheme();
  const { t, isRTL } = useI18n();
  const offline = network.isConnected === false || network.isInternetReachable === false;

  if (!offline) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.warningSoft,
          borderColor: theme.colors.warning,
          flexDirection: isRTL ? 'row-reverse' : 'row',
        },
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={20} color={theme.colors.warning} />
      <View style={styles.copy}>
        <AppText variant="label" color={theme.colors.warning}>
          {t('network.offline_title')}
        </AppText>
        <AppText variant="caption" color={theme.colors.warning}>
          {t('network.offline_body')}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  copy: { flex: 1, gap: 2 },
});

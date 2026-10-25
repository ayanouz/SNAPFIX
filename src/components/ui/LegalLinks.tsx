import { Pressable, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { AppText } from './AppText';

export function LegalLinks() {
  const { theme } = useTheme();
  const { t, isRTL } = useI18n();

  return (
    <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <Link href="/legal" asChild>
        <Pressable accessibilityRole="link" hitSlop={8}>
          <AppText variant="caption" color={theme.colors.brand}>
            {t('legal.terms_short')}
          </AppText>
        </Pressable>
      </Link>
      <AppText variant="caption" color={theme.colors.textMuted}>
        ·
      </AppText>
      <Link href="/legal" asChild>
        <Pressable accessibilityRole="link" hitSlop={8}>
          <AppText variant="caption" color={theme.colors.brand}>
            {t('legal.privacy_short')}
          </AppText>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
});

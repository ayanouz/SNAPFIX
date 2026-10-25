import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { AppText } from './AppText';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  large?: boolean;
};

export function ScreenHeader({
  title,
  subtitle,
  back = false,
  right,
  large = false,
}: ScreenHeaderProps) {
  const { theme } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={12}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)');
            }}
            style={({ pressed }) => [
              styles.back,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Ionicons
              name={isRTL ? 'chevron-forward' : 'chevron-back'}
              size={20}
              color={theme.colors.text}
            />
          </Pressable>
        ) : null}
        <View style={styles.titleBlock}>
          <AppText variant={large ? 'display' : 'title'}>{title}</AppText>
          {subtitle ? (
            <AppText variant="body" color={theme.colors.textMuted}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  row: {
    alignItems: 'center',
    gap: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  right: {
    alignItems: 'flex-end',
  },
});

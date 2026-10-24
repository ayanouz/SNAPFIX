import {
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '@/providers/ThemeProvider';

type ScreenProps = {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: Edge[];
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  footer?: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
};

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top'],
  style,
  contentContainerStyle,
  footer,
  refreshControl,
}: ScreenProps) {
  const { theme } = useTheme();
  const padding = padded ? theme.spacing.lg : 0;

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safe, { backgroundColor: theme.colors.background }, style]}
    >
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            {
              padding,
              paddingBottom: theme.spacing.xxl,
              gap: theme.spacing.lg,
            },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, { padding }, contentContainerStyle]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
});

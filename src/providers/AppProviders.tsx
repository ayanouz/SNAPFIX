import { useEffect, type ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider } from './QueryProvider';
import { AppThemeProvider } from './ThemeProvider';
import { I18nProvider } from '@/i18n';
import { AuthProvider } from './AuthProvider';
import { configureNotifications } from '@/services/notifications';

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    configureNotifications();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <AppThemeProvider>
            <I18nProvider>
              <AuthProvider>{children}</AuthProvider>
            </I18nProvider>
          </AppThemeProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

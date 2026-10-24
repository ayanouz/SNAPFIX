import { useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { usePreferencesHydrated } from '@/hooks/useHydrated';
import { usePreferencesStore } from '@/stores/preferences';
import { AppProviders } from '@/providers/AppProviders';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Splash screen may already be hidden during fast refresh.
});

function AppReady({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  const hydrated = usePreferencesHydrated();

  useEffect(() => {
    if (hydrated && !loading) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [hydrated, loading]);

  if (!hydrated || loading) return null;
  return <>{children}</>;
}

function NotificationObserver() {
  const router = useRouter();

  useEffect(() => {
    // expo-notifications does not implement response handling on web.
    if (Platform.OS === 'web') return;

    function redirect(notification: Notifications.Notification) {
      const url = notification.request.content.data?.url;
      if (typeof url === 'string') {
        router.push(url as never);
        Notifications.clearLastNotificationResponse();
      }
    }

    const response = Notifications.getLastNotificationResponse();
    if (response?.notification) redirect(response.notification);

    const subscription = Notifications.addNotificationResponseReceivedListener((next) => {
      redirect(next.notification);
    });
    return () => subscription.remove();
  }, [router]);

  return null;
}

function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { session } = useAuth();
  const onboardingComplete = usePreferencesStore((state) => state.onboardingComplete);

  useEffect(() => {
    const root = segments[0];
    const isProtected =
      root === '(tabs)' ||
      root === 'diagnose' ||
      root === 'diagnosis' ||
      root === 'maintenance' ||
      root === 'settings';
    if (!isProtected) return;
    if (!onboardingComplete) {
      router.replace('/onboarding');
      return;
    }
    if (!session) router.replace('/(auth)/sign-in');
  }, [onboardingComplete, router, segments, session]);

  return null;
}

function RootNavigator() {
  const { theme, mode } = useTheme();

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <AuthGate />
      <NotificationObserver />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="diagnose/index" />
        <Stack.Screen name="diagnosis/[id]/index" />
        <Stack.Screen name="diagnosis/[id]/repair" />
        <Stack.Screen name="diagnosis/[id]/compare" />
        <Stack.Screen name="maintenance/new" />
        <Stack.Screen name="maintenance/[id]" />
        <Stack.Screen name="settings/subscription" />
        <Stack.Screen name="settings/support" />
        <Stack.Screen name="settings/privacy" />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <AppReady>
        <RootNavigator />
      </AppReady>
    </AppProviders>
  );
}

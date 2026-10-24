import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { LoadingView } from '@/components/ui';
import { usePreferencesHydrated } from '@/hooks/useHydrated';

export default function AuthLayout() {
  const { session, loading } = useAuth();
  const hydrated = usePreferencesHydrated();

  if (loading || !hydrated) return <LoadingView />;
  if (session) return <Redirect href="/(tabs)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    />
  );
}

import { Redirect } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { usePreferencesStore } from '@/stores/preferences';
import { LoadingView } from '@/components/ui';
import { usePreferencesHydrated } from '@/hooks/useHydrated';

export default function IndexScreen() {
  const { session, loading } = useAuth();
  const hydrated = usePreferencesHydrated();
  const onboardingComplete = usePreferencesStore((state) => state.onboardingComplete);

  if (loading || !hydrated) return <LoadingView />;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Redirect href="/(tabs)" />;
}

import { useRouter } from 'expo-router';
import { EmptyState, Screen, ScreenHeader } from '@/components/ui';
import { useI18n } from '@/i18n';

export default function NotFoundScreen() {
  const { t } = useI18n();
  const router = useRouter();

  return (
    <Screen>
      <ScreenHeader title={t('not_found.title')} back />
      <EmptyState
        icon="compass-outline"
        title={t('not_found.title')}
        body={t('not_found.body')}
        actionLabel={t('not_found.go_home')}
        onAction={() => router.replace('/(tabs)')}
      />
    </Screen>
  );
}

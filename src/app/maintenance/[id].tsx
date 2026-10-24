import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMaintenance } from '@/hooks/queries';
import { MaintenanceForm } from '@/components/maintenance/MaintenanceForm';
import { EmptyState, ErrorState, LoadingView, Screen, ScreenHeader } from '@/components/ui';
import { useI18n } from '@/i18n';

export default function EditMaintenanceScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const maintenance = useMaintenance();
  const task = (maintenance.data ?? []).find((entry) => entry.id === id);

  if (!id) {
    return (
      <Screen>
        <ScreenHeader title={t('maintenance.edit_title')} back />
        <ErrorState error={null} />
      </Screen>
    );
  }

  if (maintenance.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t('maintenance.edit_title')} back />
        <LoadingView />
      </Screen>
    );
  }

  if (maintenance.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('maintenance.edit_title')} back />
        <ErrorState error={maintenance.error} onRetry={() => void maintenance.refetch()} />
      </Screen>
    );
  }

  if (!task) {
    return (
      <Screen>
        <ScreenHeader title={t('maintenance.edit_title')} back />
        <EmptyState
          icon="calendar-outline"
          title={t('errors.not_found')}
          actionLabel={t('common.back')}
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return <MaintenanceForm task={task} />;
}

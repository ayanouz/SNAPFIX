import type { DataRepository, ExportBundle } from '@/services/repositories/types';
import { usePreferencesStore } from '@/stores/preferences';

/**
 * Export account data and attach local display preferences. Preferences are
 * device-local, so they are added here rather than by the repository.
 */
export async function exportUserData(repository: DataRepository): Promise<ExportBundle> {
  const bundle = await repository.exportUserData();
  const { language, currency, theme } = usePreferencesStore.getState();
  return {
    ...bundle,
    preferences: { language, currency, theme },
  };
}

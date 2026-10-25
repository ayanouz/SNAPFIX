import { useDiagnosisDraft } from '@/stores/diagnosisDraft';
import { clearDrafts } from '@/services/storage/imageService';
import { cancelAllMaintenanceReminders } from '@/services/notifications';

/**
 * Remove device-local state that belongs to the signed-in user. This is called
 * on sign-out and account deletion so a different account cannot see a previous
 * user's draft, draft photos, or scheduled reminders.
 */
export async function clearLocalUserState(): Promise<void> {
  useDiagnosisDraft.getState().reset();
  clearDrafts();
  await cancelAllMaintenanceReminders();
}

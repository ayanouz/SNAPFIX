import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import type { MaintenanceTask } from '@/domain/diagnosis/types';

const CHANNEL_ID = 'maintenance';

export function configureNotifications(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Maintenance reminders',
      importance: AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200, 150, 200],
      lightColor: '#E85D2A',
    });
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Maintenance reminders',
      importance: AndroidImportance.DEFAULT,
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return requested.granted;
}

export async function scheduleMaintenanceReminder(task: MaintenanceTask): Promise<string | null> {
  if (!task.reminderEnabled || !task.isActive) return null;
  if (Platform.OS === 'web') return null;
  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  const due = new Date(`${task.nextDueDate}T09:00:00`);
  if (Number.isNaN(due.getTime()) || due.getTime() <= Date.now()) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: task.itemDescription,
      body: task.taskDescription,
      data: { url: `/maintenance/${task.id}` },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: due,
      channelId: CHANNEL_ID,
    },
  });
}

export async function cancelMaintenanceReminder(notificationId: string | null): Promise<void> {
  if (!notificationId || Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // A missing notification is not an error the user needs to see.
  }
}

export async function cancelAllMaintenanceReminders(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Notification cleanup must never block sign-out or account deletion.
  }
}

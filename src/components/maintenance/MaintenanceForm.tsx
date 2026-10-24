import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Switch, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText, Button, Card, Chip, Screen, ScreenHeader, TextField } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import {
  useCreateMaintenance,
  useDeleteMaintenance,
  useSetMaintenanceNotification,
  useUpdateMaintenance,
} from '@/hooks/queries';
import {
  cancelMaintenanceReminder,
  ensureNotificationPermission,
  scheduleMaintenanceReminder,
} from '@/services/notifications';
import { maintenanceFormSchema, type MaintenanceFormValues } from '@/domain/validation';
import type { MaintenanceFrequency, MaintenanceTask } from '@/domain/diagnosis/types';
import { todayIsoDate } from '@/utils/format';

const FREQUENCIES: MaintenanceFrequency[] = [
  'once',
  'weekly',
  'monthly',
  'quarterly',
  'biannual',
  'yearly',
];

type FieldName =
  'itemDescription' | 'taskDescription' | 'frequency' | 'nextDueDate' | 'reminderEnabled' | 'notes';

export function MaintenanceForm({ task }: { task?: MaintenanceTask }) {
  const { theme } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const create = useCreateMaintenance();
  const update = useUpdateMaintenance();
  const remove = useDeleteMaintenance();
  const setNotification = useSetMaintenanceNotification();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<MaintenanceFormValues>({
    defaultValues: {
      itemDescription: task?.itemDescription ?? '',
      taskDescription: task?.taskDescription ?? '',
      frequency: task?.frequency ?? 'monthly',
      nextDueDate: task?.nextDueDate ?? todayIsoDate(),
      reminderEnabled: task?.reminderEnabled ?? false,
      notes: task?.notes ?? '',
    },
  });

  const submit = handleSubmit(async (values) => {
    const parsed = maintenanceFormSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          field === 'itemDescription' ||
          field === 'taskDescription' ||
          field === 'frequency' ||
          field === 'nextDueDate' ||
          field === 'reminderEnabled' ||
          field === 'notes'
        ) {
          setError(field as FieldName, { type: 'validation', message: issue.message });
        }
      }
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      if (task) {
        await cancelMaintenanceReminder(task.notificationId);
      }
      const input = {
        itemDescription: parsed.data.itemDescription,
        taskDescription: parsed.data.taskDescription,
        frequency: parsed.data.frequency,
        nextDueDate: parsed.data.nextDueDate,
        reminderEnabled: parsed.data.reminderEnabled,
        lastCompletedAt: task?.lastCompletedAt ?? null,
        notes: parsed.data.notes,
        isActive: task?.isActive ?? true,
      };
      const saved = task
        ? await update.mutateAsync({ taskId: task.id, input })
        : await create.mutateAsync(input);

      if (saved.reminderEnabled && saved.isActive) {
        const granted = await ensureNotificationPermission();
        if (granted) {
          const notificationId = await scheduleMaintenanceReminder(saved);
          if (notificationId) {
            await setNotification.mutateAsync({ taskId: saved.id, notificationId });
          }
        } else {
          Alert.alert(t('maintenance.notification_permission'), t('maintenance.notification_body'));
        }
      }

      router.back();
    } catch {
      setFormError(t('errors.unknown'));
    } finally {
      setSaving(false);
    }
  });

  const confirmDelete = () => {
    if (!task) return;
    Alert.alert(t('maintenance.delete_confirm'), task.itemDescription, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await cancelMaintenanceReminder(task.notificationId);
              await remove.mutateAsync(task.id);
              router.back();
            } catch {
              Alert.alert(t('errors.title'), t('errors.unknown'));
            }
          })();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <ScreenHeader
          title={task ? t('maintenance.edit_title') : t('maintenance.form_title')}
          back
        />

        <Card style={styles.form}>
          <Controller
            control={control}
            name="itemDescription"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={t('maintenance.item')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={t('maintenance.item_placeholder')}
                error={errors.itemDescription?.message}
                maxLength={160}
                required
              />
            )}
          />
          <Controller
            control={control}
            name="taskDescription"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={t('maintenance.task')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={t('maintenance.task_placeholder')}
                error={errors.taskDescription?.message}
                maxLength={500}
                required
              />
            )}
          />
          <View style={styles.fieldBlock}>
            <AppText variant="label">{t('maintenance.frequency')}</AppText>
            <Controller
              control={control}
              name="frequency"
              render={({ field: { onChange, value } }) => (
                <View style={styles.chips}>
                  {FREQUENCIES.map((frequency) => (
                    <Chip
                      key={frequency}
                      label={t(`maintenance.${frequency}`)}
                      selected={value === frequency}
                      onPress={() => onChange(frequency)}
                    />
                  ))}
                </View>
              )}
            />
          </View>
          <Controller
            control={control}
            name="nextDueDate"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={t('maintenance.next_due')}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="YYYY-MM-DD"
                hint={t('maintenance.next_due_hint')}
                error={errors.nextDueDate?.message}
                autoCapitalize="none"
                maxLength={10}
                required
              />
            )}
          />
          <View style={[styles.switchRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={styles.flex}>
              <AppText variant="label">{t('maintenance.reminder')}</AppText>
              <AppText variant="caption" color={theme.colors.textMuted}>
                {t('maintenance.reminder_enabled')}
              </AppText>
            </View>
            <Controller
              control={control}
              name="reminderEnabled"
              render={({ field: { onChange, value } }) => (
                <Switch
                  value={value}
                  onValueChange={onChange}
                  trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
                  thumbColor="#FFFFFF"
                />
              )}
            />
          </View>
          <Controller
            control={control}
            name="notes"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={t('maintenance.notes')}
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={t('maintenance.notes_placeholder')}
                error={errors.notes?.message}
                multiline
                maxLength={1000}
              />
            )}
          />
          {formError ? (
            <AppText variant="caption" color={theme.colors.danger}>
              {formError}
            </AppText>
          ) : null}
          <Button
            label={t('maintenance.save_task')}
            icon="save-outline"
            loading={saving}
            onPress={() => void submit()}
          />
          {task ? (
            <Button
              label={t('maintenance.delete')}
              variant="ghost"
              icon="trash-outline"
              onPress={confirmDelete}
            />
          ) : null}
        </Card>

        <Card tone="warning" style={styles.safety}>
          <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Ionicons name="shield-outline" size={18} color={theme.colors.warning} />
            <AppText variant="caption" color={theme.colors.warning} style={styles.flex}>
              {t('maintenance.safety_note')}
            </AppText>
          </View>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: 12 },
  fieldBlock: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  switchRow: { alignItems: 'center', gap: 10 },
  inline: { alignItems: 'flex-start', gap: 8 },
  safety: { padding: 12 },
});

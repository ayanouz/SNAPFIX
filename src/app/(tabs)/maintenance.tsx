import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingView,
  Screen,
  ScreenHeader,
} from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import {
  useCompleteMaintenance,
  useDeleteMaintenance,
  useMaintenance,
  useSetMaintenanceNotification,
} from '@/hooks/queries';
import { cancelMaintenanceReminder, scheduleMaintenanceReminder } from '@/services/notifications';
import type { MaintenanceTask } from '@/domain/diagnosis/types';
import { formatDate, todayIsoDate } from '@/utils/format';

export default function MaintenanceScreen() {
  const { theme } = useTheme();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const maintenance = useMaintenance();
  const complete = useCompleteMaintenance();
  const remove = useDeleteMaintenance();
  const setNotification = useSetMaintenanceNotification();

  const groups = useMemo(() => {
    const today = todayIsoDate();
    const active = (maintenance.data ?? []).filter((task) => task.isActive);
    return {
      overdue: active.filter((task) => task.nextDueDate < today),
      due: active.filter((task) => task.nextDueDate === today),
      upcoming: active.filter((task) => task.nextDueDate > today),
      inactive: (maintenance.data ?? []).filter((task) => !task.isActive),
    };
  }, [maintenance.data]);

  const onComplete = async (task: MaintenanceTask) => {
    try {
      await cancelMaintenanceReminder(task.notificationId);
      const updated = await complete.mutateAsync(task.id);
      if (task.reminderEnabled && updated.isActive) {
        const notificationId = await scheduleMaintenanceReminder(updated);
        if (notificationId) {
          await setNotification.mutateAsync({ taskId: updated.id, notificationId });
        }
      }
    } catch {
      Alert.alert(t('errors.title'), t('errors.unknown'));
    }
  };

  const onDelete = (task: MaintenanceTask) => {
    Alert.alert(t('maintenance.delete_confirm'), task.itemDescription, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await cancelMaintenanceReminder(task.notificationId);
            remove.mutate(task.id, {
              onError: () => Alert.alert(t('errors.title'), t('errors.unknown')),
            });
          })();
        },
      },
    ]);
  };

  const renderTask = (task: MaintenanceTask, tone: 'danger' | 'warning' | 'neutral') => (
    <Card key={task.id} style={styles.taskCard}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/maintenance/[id]', params: { id: task.id } })}
        style={({ pressed }) => [
          styles.taskHeader,
          { flexDirection: isRTL ? 'row-reverse' : 'row', opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <View style={[styles.taskIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
          <Ionicons name="calendar-outline" size={20} color={theme.colors.brand} />
        </View>
        <View style={[styles.flex, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
          <AppText variant="subtitle">{task.itemDescription}</AppText>
          <AppText variant="body" color={theme.colors.textMuted}>
            {task.taskDescription}
          </AppText>
          <View style={[styles.metaRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Badge
              label={
                tone === 'danger'
                  ? t('maintenance.overdue')
                  : tone === 'warning'
                    ? t('maintenance.due')
                    : t('maintenance.upcoming')
              }
              tone={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'neutral'}
            />
            <AppText variant="caption" color={theme.colors.textMuted}>
              {t(`maintenance.${task.frequency}`)} ·{' '}
              {formatDate(`${task.nextDueDate}T12:00:00`, language)}
            </AppText>
            {task.reminderEnabled ? (
              <Ionicons name="notifications-outline" size={14} color={theme.colors.textMuted} />
            ) : null}
          </View>
          {task.lastCompletedAt ? (
            <AppText variant="caption" color={theme.colors.textMuted}>
              {t('maintenance.last_completed', {
                date: formatDate(task.lastCompletedAt, language),
              })}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      <View style={[styles.actions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Button
          label={t('maintenance.mark_complete')}
          icon="checkmark-circle-outline"
          size="sm"
          variant="secondary"
          fullWidth={false}
          loading={complete.isPending && complete.variables === task.id}
          onPress={() => void onComplete(task)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.edit')}
          onPress={() => router.push({ pathname: '/maintenance/[id]', params: { id: task.id } })}
          style={[styles.iconButton, { backgroundColor: theme.colors.surfaceAlt }]}
        >
          <Ionicons name="create-outline" size={18} color={theme.colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
          onPress={() => onDelete(task)}
          style={[styles.iconButton, { backgroundColor: theme.colors.dangerSoft }]}
        >
          <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
        </Pressable>
      </View>
    </Card>
  );

  return (
    <Screen>
      <ScreenHeader
        title={t('maintenance.title')}
        subtitle={t('maintenance.subtitle')}
        large
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('maintenance.add')}
            onPress={() => router.push('/maintenance/new')}
            style={[styles.addButton, { backgroundColor: theme.colors.brand }]}
          >
            <Ionicons name="add" size={24} color={theme.colors.onBrand} />
          </Pressable>
        }
      />

      <Card tone="warning" style={styles.safety}>
        <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="shield-outline" size={18} color={theme.colors.warning} />
          <AppText variant="caption" color={theme.colors.warning} style={styles.flex}>
            {t('maintenance.safety_note')}
          </AppText>
        </View>
      </Card>

      {maintenance.isLoading ? (
        <LoadingView message={t('common.loading')} />
      ) : maintenance.isError ? (
        <ErrorState error={maintenance.error} onRetry={() => void maintenance.refetch()} />
      ) : (maintenance.data ?? []).length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title={t('maintenance.empty_title')}
          body={t('maintenance.empty_body')}
          actionLabel={t('maintenance.add')}
          onAction={() => router.push('/maintenance/new')}
        />
      ) : (
        <View style={styles.list}>
          {groups.overdue.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="subtitle" color={theme.colors.danger}>
                {t('maintenance.overdue')}
              </AppText>
              {groups.overdue.map((task) => renderTask(task, 'danger'))}
            </View>
          ) : null}
          {groups.due.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="subtitle" color={theme.colors.warning}>
                {t('maintenance.due')}
              </AppText>
              {groups.due.map((task) => renderTask(task, 'warning'))}
            </View>
          ) : null}
          {groups.upcoming.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="subtitle">{t('maintenance.upcoming')}</AppText>
              {groups.upcoming.map((task) => renderTask(task, 'neutral'))}
            </View>
          ) : null}
          {groups.inactive.length > 0 ? (
            <View style={styles.section}>
              <AppText variant="subtitle" color={theme.colors.textMuted}>
                {t('maintenance.inactive')}
              </AppText>
              {groups.inactive.map((task) => renderTask(task, 'neutral'))}
            </View>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safety: { padding: 12 },
  inline: { alignItems: 'center', gap: 8 },
  flex: { flex: 1, gap: 3 },
  list: { gap: 18 },
  section: { gap: 8 },
  taskCard: { gap: 12 },
  taskHeader: { gap: 12, alignItems: 'flex-start' },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: { alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  actions: { alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

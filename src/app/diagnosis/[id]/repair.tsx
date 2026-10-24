import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AppText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingView,
  ProgressBar,
  SafetyBanner,
  Screen,
  ScreenHeader,
} from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import {
  useDiagnosis,
  useRepairGuide,
  useRepairProgress,
  useSaveRepairProgress,
} from '@/hooks/queries';
import { trackEvent } from '@/services/analytics';
import { useAuth } from '@/providers/AuthProvider';

export default function RepairGuideScreen() {
  const { theme } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { session } = useAuth();
  const diagnosis = useDiagnosis(id);
  const guide = useRepairGuide(id);
  const progress = useRepairProgress(id);
  const save = useSaveRepairProgress(id ?? '');
  const [completed, setCompleted] = useState<string[]>([]);
  const initialized = useRef(false);

  useEffect(() => {
    if (!progress.data || initialized.current) return;
    initialized.current = true;
    setCompleted(progress.data.completedStepIds);
  }, [progress.data]);

  if (!id) {
    return (
      <Screen>
        <ScreenHeader title={t('repair.title')} back />
        <ErrorState error={null} />
      </Screen>
    );
  }

  if (guide.isLoading || progress.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t('repair.title')} back />
        <LoadingView />
      </Screen>
    );
  }

  if (guide.isError || progress.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('repair.title')} back />
        <ErrorState error={guide.error ?? progress.error} onRetry={() => void guide.refetch()} />
      </Screen>
    );
  }

  const data = guide.data;
  if (!data) {
    return (
      <Screen>
        <ScreenHeader title={t('repair.title')} back />
        <EmptyState
          icon="construct-outline"
          title={t('repair.no_guide')}
          actionLabel={t('repair.back_to_diagnosis')}
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const total = data.steps.length;
  const done = completed.length;
  const ratio = total === 0 ? 0 : done / total;
  const safety = diagnosis.data?.analysis?.safety ?? null;

  const toggleStep = (stepId: string, requiresProfessional: boolean) => {
    if (requiresProfessional) return;
    const next = completed.includes(stepId)
      ? completed.filter((value) => value !== stepId)
      : [...completed, stepId];
    const firstIncomplete = data.steps.findIndex((step) => !next.includes(step.id));
    const currentStep = firstIncomplete === -1 ? total : firstIncomplete;
    setCompleted(next);
    save.mutate(
      {
        completedStepIds: next,
        currentStep,
        completedAt: next.length === total ? new Date().toISOString() : null,
      },
      {
        onSuccess: () => {
          void trackEvent(session?.user.id ?? null, 'repair_step_completed', {
            diagnosis_id: data.diagnosisId,
          });
        },
      },
    );
  };

  return (
    <Screen>
      <ScreenHeader title={t('repair.title')} subtitle={data.title} back />

      {safety ? <SafetyBanner safety={safety} compact /> : null}

      <Card style={styles.progressCard}>
        <View style={[styles.rowBetween, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <AppText variant="subtitle">{t('repair.steps')}</AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {t('repair.progress', { done, total })}
          </AppText>
        </View>
        <ProgressBar value={ratio} tone={ratio === 1 ? theme.colors.success : theme.colors.brand} />
        {done === total && total > 0 ? (
          <View style={[styles.completeBanner, { backgroundColor: theme.colors.successSoft }]}>
            <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
            <View style={styles.flex}>
              <AppText variant="subtitle" color={theme.colors.success}>
                {t('repair.completed_title')}
              </AppText>
              <AppText variant="caption" color={theme.colors.textMuted}>
                {t('repair.completed_body')}
              </AppText>
            </View>
          </View>
        ) : null}
        {save.isPending ? (
          <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <ActivityIndicator size="small" color={theme.colors.brand} />
            <AppText variant="caption" color={theme.colors.textMuted}>
              {t('common.loading')}
            </AppText>
          </View>
        ) : null}
      </Card>

      {data.tools.length > 0 || data.materials.length > 0 ? (
        <Card style={styles.section}>
          {data.tools.length > 0 ? (
            <View style={styles.sectionBlock}>
              <AppText variant="label" color={theme.colors.textMuted}>
                {t('repair.tools')}
              </AppText>
              <View style={styles.chips}>
                {data.tools.map((tool) => (
                  <Badge key={tool} label={tool} tone="neutral" />
                ))}
              </View>
            </View>
          ) : null}
          {data.materials.length > 0 ? (
            <View style={styles.sectionBlock}>
              <AppText variant="label" color={theme.colors.textMuted}>
                {t('repair.materials')}
              </AppText>
              <View style={styles.chips}>
                {data.materials.map((material) => (
                  <Badge key={material} label={material} tone="neutral" />
                ))}
              </View>
            </View>
          ) : null}
        </Card>
      ) : null}

      {data.professionalOnly ? (
        <Card tone="danger" style={styles.section}>
          <AppText variant="subtitle" color={theme.colors.danger}>
            {t('diagnosis.professional_only')}
          </AppText>
          <AppText variant="body">{t('diagnosis.professional_note')}</AppText>
        </Card>
      ) : null}

      <View style={styles.stepList}>
        {data.steps.map((step, index) => {
          const isDone = completed.includes(step.id);
          const disabled = step.requires_professional;
          return (
            <Card key={step.id} style={{ ...styles.stepCard, ...(isDone ? styles.stepDone : {}) }}>
              <View style={[styles.stepHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isDone, disabled }}
                  accessibilityLabel={step.title}
                  disabled={disabled}
                  onPress={() => toggleStep(step.id, step.requires_professional)}
                  style={[
                    styles.checkbox,
                    {
                      borderColor: isDone ? theme.colors.success : theme.colors.borderStrong,
                      backgroundColor: isDone ? theme.colors.success : 'transparent',
                      opacity: disabled ? 0.5 : 1,
                    },
                  ]}
                >
                  {isDone ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
                </Pressable>
                <View style={[styles.flex, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                  <AppText variant="label" color={theme.colors.textMuted}>
                    {index + 1} / {total}
                  </AppText>
                  <AppText variant="subtitle" style={isDone ? styles.doneText : undefined}>
                    {step.title}
                  </AppText>
                </View>
                {step.requires_professional ? (
                  <Badge label={t('diagnosis.professional_only')} tone="danger" />
                ) : null}
              </View>
              <AppText variant="body" color={theme.colors.textMuted}>
                {step.instructions}
              </AppText>
              {step.requires_professional ? (
                <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Ionicons name="person-outline" size={16} color={theme.colors.danger} />
                  <AppText variant="caption" color={theme.colors.danger} style={styles.flex}>
                    {t('repair.requires_professional')}
                  </AppText>
                </View>
              ) : null}
              {step.warning ? (
                <View
                  style={[
                    styles.warning,
                    {
                      backgroundColor: theme.colors.warningSoft,
                      borderColor: theme.colors.warning,
                    },
                  ]}
                >
                  <Ionicons name="warning-outline" size={18} color={theme.colors.warning} />
                  <View style={styles.flex}>
                    <AppText variant="label" color={theme.colors.warning}>
                      {t(`safety.warnings.${step.warning.code}`)}
                    </AppText>
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {step.warning.message}
                    </AppText>
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>

      <Button
        label={t('repair.back_to_diagnosis')}
        variant="secondary"
        icon="arrow-back-outline"
        onPress={() => router.back()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressCard: { gap: 10 },
  rowBetween: { justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  completeBanner: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    padding: 10,
    borderRadius: 12,
  },
  inline: { alignItems: 'center', gap: 6 },
  flex: { flex: 1, gap: 3 },
  section: { gap: 10 },
  sectionBlock: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stepList: { gap: 10 },
  stepCard: { gap: 10 },
  stepDone: { opacity: 0.78 },
  stepHeader: { alignItems: 'center', gap: 10 },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { textDecorationLine: 'line-through' },
  warning: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
});

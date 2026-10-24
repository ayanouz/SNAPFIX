import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingView,
  SafetyBanner,
  Screen,
  ScreenHeader,
} from '@/components/ui';
import { FeedbackForm } from '@/components/diagnosis/FeedbackForm';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import {
  useDeleteDiagnosis,
  useDiagnosis,
  useReassessDiagnosis,
  useSetSaved,
  useStartAnalysis,
  useUsage,
} from '@/hooks/queries';
import type { DiagnosisAnalysis, RepairOption } from '@/domain/diagnosis/schema';
import { applySafetyPolicy } from '@/domain/diagnosis/safety';
import { PLAN_LIMITS } from '@/domain/usage';
import {
  confidenceBand,
  confidencePercent,
  estimateReasonKey,
  formatDate,
  formatDuration,
  formatEstimateRange,
} from '@/utils/format';
import { shareDiagnosisSummary } from '@/services/share';
import { trackEvent } from '@/services/analytics';
import { normalizeError } from '@/domain/errors';

function verdictKey(verdict: DiagnosisAnalysis['repairability']['verdict']): string {
  return `diagnosis.verdict_${verdict}`;
}

function difficultyKey(difficulty: RepairOption['difficulty']): string {
  return `diagnosis.difficulty_${difficulty}`;
}

function sourceKey(source: 'image' | 'text' | 'context'): string {
  return `diagnosis.source_${source}`;
}

function stepTypeKey(type: 'check' | 'question' | 'professional'): string {
  return `diagnosis.step_${type}`;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <Card style={styles.sectionCard}>
      <AppText variant="subtitle" color={theme.colors.text}>
        {title}
      </AppText>
      {children}
    </Card>
  );
}

function Bullets({ items, tone }: { items: string[]; tone?: string }) {
  const { theme } = useTheme();
  const { isRTL } = useI18n();
  return (
    <View style={styles.bullets}>
      {items.map((item, index) => (
        <View
          key={`${index}-${item.slice(0, 12)}`}
          style={[styles.bulletRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
        >
          <View style={[styles.bulletDot, { backgroundColor: tone ?? theme.colors.brand }]} />
          <AppText variant="body" color={theme.colors.text} style={styles.flex}>
            {item}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export default function DiagnosisScreen() {
  const { theme } = useTheme();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { session } = useAuth();
  const diagnosis = useDiagnosis(id);
  const usage = useUsage();
  const start = useStartAnalysis();
  const reassess = useReassessDiagnosis();
  const setSaved = useSetSaved();
  const remove = useDeleteDiagnosis();
  const triggered = useRef(false);
  const [sharing, setSharing] = useState(false);
  const startAnalysis = start.mutate;

  useEffect(() => {
    if (!id) return;
    if (diagnosis.data?.status === 'draft' && !triggered.current) {
      triggered.current = true;
      startAnalysis(id);
    }
  }, [diagnosis.data?.status, id, startAnalysis]);

  if (!id) {
    return (
      <Screen>
        <ScreenHeader title={t('errors.not_found')} back />
        <ErrorState error={null} />
      </Screen>
    );
  }

  if (diagnosis.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t('diagnosis.result_title')} back />
        <LoadingView />
      </Screen>
    );
  }

  if (diagnosis.isError || !diagnosis.data) {
    return (
      <Screen>
        <ScreenHeader title={t('diagnosis.result_title')} back />
        <ErrorState error={diagnosis.error} onRetry={() => void diagnosis.refetch()} />
      </Screen>
    );
  }

  const record = diagnosis.data;
  // Defence in depth: re-apply the deterministic policy on the client even
  // though the server already did so. This keeps a stale or tampered response
  // from being rendered without escalation.
  const analysis = record.analysis
    ? applySafetyPolicy(record.analysis, {
        text: record.description,
        locale: record.locale,
        category: record.category,
      })
    : null;
  const isDemo = analysis?.provider.mode === 'demo';
  const saved = record.isSaved;
  const maxReassessments = usage.data
    ? PLAN_LIMITS[usage.data.plan].maxReassessments
    : PLAN_LIMITS.free.maxReassessments;
  const reassessUsed = Math.max(0, record.analysisAttempts - 1);
  const reassessRemaining = Math.max(0, maxReassessments - reassessUsed);

  const retry = () => {
    triggered.current = true;
    start.mutate(record.id);
  };

  const toggleSaved = () => {
    setSaved.mutate(
      { diagnosisId: record.id, saved: !saved },
      { onError: () => Alert.alert(t('errors.title'), t('errors.unknown')) },
    );
    if (!saved) void trackEvent(session?.user.id ?? null, 'diagnosis_saved');
  };

  const share = async () => {
    if (!analysis) return;
    setSharing(true);
    try {
      const range = formatEstimateRange(analysis.estimate, language);
      const text = [
        `${t('app.name')} — ${analysis.summary.headline}`,
        analysis.summary.plain_language,
        `${t('diagnosis.safety')}: ${t(`safety.risk_${analysis.safety.risk_level}`)}`,
        analysis.safety.escalation ?? t('safety.stop_guidance'),
        `${t('diagnosis.possible_causes')}:`,
        ...analysis.possible_causes.map((cause) => `• ${cause.title}`),
        `${t('diagnosis.next_steps')}:`,
        ...analysis.next_steps.map((step) => `• ${step.title}`),
        `${t('diagnosis.estimate')}: ${range ?? t('diagnosis.estimate_unavailable')}`,
        t('estimate.disclaimer'),
      ].join('\n\n');
      await shareDiagnosisSummary(text);
      void trackEvent(session?.user.id ?? null, 'diagnosis_shared');
    } catch {
      Alert.alert(t('errors.title'), t('errors.unknown'));
    } finally {
      setSharing(false);
    }
  };

  const confirmReassess = () => {
    if (reassessRemaining <= 0) {
      Alert.alert(t('diagnosis.reassess_limit'));
      return;
    }
    Alert.alert(t('diagnosis.reassess'), t('diagnosis.reassess_confirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('diagnosis.reassess'),
        onPress: () => {
          triggered.current = true;
          reassess.mutate(record.id, {
            onError: (error) =>
              Alert.alert(t('errors.title'), t(`errors.${normalizeError(error).code}`)),
          });
        },
      },
    ]);
  };

  const confirmDelete = () => {
    Alert.alert(t('diagnosis.delete_confirm'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          remove.mutate(record.id, {
            onSuccess: () => router.replace('/(tabs)/history'),
            onError: () => Alert.alert(t('errors.title'), t('errors.unknown')),
          });
        },
      },
    ]);
  };

  const renderAnalyzing = () => (
    <>
      <Card style={styles.analyzing}>
        <ActivityIndicator size="large" color={theme.colors.brand} />
        <AppText variant="title" align="center">
          {t('diagnosis.analyzing_title')}
        </AppText>
        <AppText variant="body" align="center" color={theme.colors.textMuted}>
          {t('diagnosis.analyzing_body')}
        </AppText>
        <View style={styles.steps}>
          {[1, 2, 3].map((step) => (
            <View
              key={step}
              style={[styles.analyzingStep, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
            >
              <Ionicons name="ellipse-outline" size={18} color={theme.colors.brand} />
              <AppText variant="body" style={styles.flex}>
                {t(`diagnosis.analyzing_step${step}`)}
              </AppText>
            </View>
          ))}
        </View>
      </Card>
      <Card tone="warning" style={styles.sectionCard}>
        <AppText variant="caption" color={theme.colors.warning}>
          {t('diagnosis.safety_override')}
        </AppText>
      </Card>
    </>
  );

  const renderFailed = () => (
    <Card tone="danger" style={styles.sectionCard}>
      <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Ionicons name="alert-circle-outline" size={24} color={theme.colors.danger} />
        <AppText variant="title" color={theme.colors.danger} style={styles.flex}>
          {t('diagnosis.failed_title')}
        </AppText>
      </View>
      <AppText variant="body">{t('diagnosis.failed_body')}</AppText>
      {record.failureCode ? (
        <AppText variant="caption" color={theme.colors.textMuted}>
          {t(`errors.${record.failureCode}`)}
        </AppText>
      ) : null}
      <Button
        label={t('diagnosis.retry_analysis')}
        icon="refresh"
        variant="secondary"
        onPress={retry}
        loading={start.isPending}
      />
    </Card>
  );

  const renderAnalysis = () => {
    if (!analysis) {
      return <ErrorState error={null} onRetry={() => void diagnosis.refetch()} />;
    }
    const range = formatEstimateRange(analysis.estimate, language);
    const band = confidenceBand(analysis.summary.confidence);
    const primaryOption = analysis.repair_options[0] ?? null;

    return (
      <>
        <View style={styles.titleBlock}>
          <View style={[styles.badgeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Badge
              label={isDemo ? t('diagnosis.demo_label') : t('app.live')}
              tone={isDemo ? 'warning' : 'success'}
            />
            <Badge
              label={t(`diagnosis.confidence_${band}`)}
              tone={band === 'high' ? 'success' : band === 'medium' ? 'warning' : 'danger'}
            />
            <Badge label={t(`category.${analysis.item.category}`)} tone="neutral" />
          </View>
          <AppText variant="display">{analysis.summary.headline}</AppText>
          <AppText variant="body" color={theme.colors.textMuted}>
            {analysis.item.identified_type}
            {analysis.item.brand ? ` · ${analysis.item.brand}` : ''}
            {analysis.item.model ? ` · ${analysis.item.model}` : ''}
          </AppText>
        </View>

        {record.images.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.imageRow}
          >
            {record.images.map((image) => {
              const uri = image.signedUrl ?? image.localUri;
              if (!uri) return null;
              return <Image key={image.id} source={{ uri }} style={styles.image} />;
            })}
          </ScrollView>
        ) : null}

        <SafetyBanner safety={analysis.safety} />

        <SectionCard title={t('diagnosis.summary')}>
          <AppText variant="body">{analysis.summary.plain_language}</AppText>
          <View style={[styles.metaRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <AppText variant="caption" color={theme.colors.textMuted}>
              {t('diagnosis.confidence_percent', {
                percent: confidencePercent(analysis.summary.confidence),
              })}
            </AppText>
            <AppText variant="caption" color={theme.colors.textMuted}>
              {t('diagnosis.attempts', { count: record.analysisAttempts })}
            </AppText>
          </View>
          <View style={styles.uncertainty}>
            <AppText variant="label" color={theme.colors.warning}>
              {t('diagnosis.limitations')}
            </AppText>
            <Bullets items={analysis.summary.uncertainty} tone={theme.colors.warning} />
          </View>
        </SectionCard>

        <SectionCard title={t('diagnosis.observations')}>
          {analysis.observations.map((observation) => (
            <View key={observation.id} style={styles.observation}>
              <View
                style={[styles.observationHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              >
                <AppText variant="body" style={styles.flex}>
                  {observation.description}
                </AppText>
                <Badge label={t(sourceKey(observation.source))} tone="neutral" />
              </View>
              <AppText variant="caption" color={theme.colors.textMuted}>
                {t('diagnosis.confidence_percent', {
                  percent: confidencePercent(observation.confidence),
                })}
              </AppText>
            </View>
          ))}
        </SectionCard>

        <SectionCard title={t('diagnosis.possible_causes')}>
          {analysis.possible_causes.map((cause) => (
            <View key={cause.id} style={[styles.cause, { borderColor: theme.colors.border }]}>
              <View
                style={[styles.observationHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              >
                <AppText variant="subtitle" style={styles.flex}>
                  {cause.title}
                </AppText>
                {cause.verification_needed ? (
                  <Badge label={t('diagnosis.verification_needed')} tone="warning" />
                ) : null}
              </View>
              <AppText variant="body" color={theme.colors.textMuted}>
                {cause.explanation}
              </AppText>
              <AppText variant="caption" color={theme.colors.textMuted}>
                {t('diagnosis.confidence_percent', {
                  percent: confidencePercent(cause.confidence),
                })}
              </AppText>
              {cause.evidence.length > 0 ? (
                <Bullets items={cause.evidence} tone={theme.colors.textMuted} />
              ) : null}
            </View>
          ))}
        </SectionCard>

        <SectionCard title={t('diagnosis.next_steps')}>
          {analysis.next_steps.map((step) => (
            <View key={step.id} style={styles.nextStep}>
              <View
                style={[styles.observationHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
              >
                <Ionicons
                  name={step.safe ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                  size={20}
                  color={step.safe ? theme.colors.success : theme.colors.danger}
                />
                <AppText variant="label" style={styles.flex}>
                  {step.title}
                </AppText>
                <Badge
                  label={t(stepTypeKey(step.type))}
                  tone={step.type === 'professional' ? 'danger' : 'neutral'}
                />
              </View>
              <AppText variant="body" color={theme.colors.textMuted}>
                {step.description}
              </AppText>
            </View>
          ))}
        </SectionCard>

        <SectionCard title={t('diagnosis.repairability')}>
          <Badge
            label={t(verdictKey(analysis.repairability.verdict))}
            tone={
              analysis.repairability.verdict === 'professional' ||
              analysis.repairability.verdict === 'replace'
                ? 'danger'
                : analysis.repairability.verdict === 'diy'
                  ? 'success'
                  : 'warning'
            }
          />
          <AppText variant="body">{analysis.repairability.rationale}</AppText>
        </SectionCard>

        {analysis.repair_options.length > 0 ? (
          <SectionCard title={t('diagnosis.repair_options')}>
            {analysis.repair_options.map((option) => (
              <View key={option.id} style={[styles.option, { borderColor: theme.colors.border }]}>
                <View
                  style={[
                    styles.observationHeader,
                    { flexDirection: isRTL ? 'row-reverse' : 'row' },
                  ]}
                >
                  <AppText variant="subtitle" style={styles.flex}>
                    {option.title}
                  </AppText>
                  {option.professional_only ? (
                    <Badge label={t('diagnosis.professional_only')} tone="danger" />
                  ) : (
                    <Badge label={t(difficultyKey(option.difficulty))} tone="info" />
                  )}
                </View>
                <AppText variant="body" color={theme.colors.textMuted}>
                  {option.summary}
                </AppText>
                <View style={[styles.metaRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                    <Ionicons name="time-outline" size={15} color={theme.colors.textMuted} />
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {formatDuration(option.duration_minutes)}
                    </AppText>
                  </View>
                  {option.tools.length > 0 ? (
                    <AppText variant="caption" color={theme.colors.textMuted}>
                      {t('diagnosis.tools')}: {option.tools.join(', ')}
                    </AppText>
                  ) : null}
                </View>
                {option.professional_only ? (
                  <AppText variant="caption" color={theme.colors.danger}>
                    {t('diagnosis.professional_note')}
                  </AppText>
                ) : null}
              </View>
            ))}
            {primaryOption && !primaryOption.professional_only ? (
              <Button
                label={t('diagnosis.start_repair')}
                icon="construct-outline"
                onPress={() =>
                  router.push({
                    pathname: '/diagnosis/[id]/repair',
                    params: { id: record.id },
                  })
                }
              />
            ) : null}
          </SectionCard>
        ) : (
          <Card tone="warning" style={styles.sectionCard}>
            <AppText variant="body">{t('diagnosis.no_repair_options')}</AppText>
          </Card>
        )}

        <SectionCard title={t('diagnosis.estimate')}>
          {range ? (
            <>
              <AppText variant="display" color={theme.colors.success}>
                {range}
              </AppText>
              <View style={[styles.badgeRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                {analysis.estimate.includes_parts ? (
                  <Badge label={t('estimate.includes_parts')} tone="neutral" />
                ) : null}
                {analysis.estimate.includes_labor ? (
                  <Badge label={t('estimate.includes_labor')} tone="neutral" />
                ) : null}
              </View>
              {analysis.estimate.assumptions.length > 0 ? (
                <View style={styles.uncertainty}>
                  <AppText variant="label" color={theme.colors.textMuted}>
                    {t('estimate.assumptions')}
                  </AppText>
                  <Bullets items={analysis.estimate.assumptions} tone={theme.colors.textMuted} />
                </View>
              ) : null}
              {analysis.estimate.data_source ? (
                <AppText variant="caption" color={theme.colors.textMuted}>
                  {t('diagnosis.estimate_source', { source: analysis.estimate.data_source })}
                </AppText>
              ) : null}
              {analysis.estimate.last_verified_at ? (
                <AppText variant="caption" color={theme.colors.textMuted}>
                  {t('diagnosis.estimate_verified', {
                    date: formatDate(analysis.estimate.last_verified_at, language),
                  })}
                </AppText>
              ) : null}
            </>
          ) : (
            <View style={styles.estimateUnavailable}>
              <Ionicons name="information-circle-outline" size={22} color={theme.colors.warning} />
              <View style={styles.flex}>
                <AppText variant="subtitle" color={theme.colors.warning}>
                  {t('diagnosis.estimate_unavailable')}
                </AppText>
                <AppText variant="body" color={theme.colors.textMuted}>
                  {t(estimateReasonKey(analysis.estimate.unavailable_reason))}
                </AppText>
              </View>
            </View>
          )}
          <AppText variant="caption" color={theme.colors.textMuted}>
            {t('estimate.disclaimer')}
          </AppText>
        </SectionCard>

        <SectionCard title={t('diagnosis.limitations')}>
          <Bullets items={analysis.limitations} tone={theme.colors.warning} />
        </SectionCard>

        {analysis.follow_up_questions.length > 0 ? (
          <SectionCard title={t('diagnosis.follow_up')}>
            {analysis.follow_up_questions.map((question) => (
              <View key={question.id} style={styles.followUp}>
                <AppText variant="label">{question.question}</AppText>
                <AppText variant="caption" color={theme.colors.textMuted}>
                  {question.why}
                </AppText>
              </View>
            ))}
          </SectionCard>
        ) : null}

        <FeedbackForm diagnosisId={record.id} />

        <View style={styles.actions}>
          <Button
            label={t('diagnosis.compare_quotes')}
            variant="secondary"
            icon="git-compare-outline"
            onPress={() =>
              router.push({ pathname: '/diagnosis/[id]/compare', params: { id: record.id } })
            }
          />
          <Button
            label={
              reassessRemaining > 0
                ? `${t('diagnosis.reassess')} (${t('diagnosis.reassess_remaining', {
                    count: reassessRemaining,
                  })})`
                : t('diagnosis.reassess_limit')
            }
            variant="ghost"
            icon="refresh"
            onPress={confirmReassess}
            disabled={reassessRemaining <= 0 || reassess.isPending}
            loading={reassess.isPending}
          />
          <Button
            label={t('diagnosis.delete')}
            variant="ghost"
            icon="trash-outline"
            onPress={confirmDelete}
            loading={remove.isPending}
          />
        </View>

        <View style={[styles.provider, { borderTopColor: theme.colors.border }]}>
          <AppText variant="caption" color={theme.colors.textMuted} align="center">
            {t('diagnosis.provider', {
              provider: analysis.provider.name,
              model: analysis.provider.model,
            })}
          </AppText>
          <AppText variant="caption" color={theme.colors.textMuted} align="center">
            {t('diagnosis.generated_at', {
              date: formatDate(analysis.provider.generated_at, language, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </AppText>
          <AppText variant="caption" color={theme.colors.textMuted} align="center">
            {t('diagnosis.schema_version', { version: analysis.provider.schema_version })}
          </AppText>
        </View>
      </>
    );
  };

  return (
    <Screen>
      <ScreenHeader
        title={t('diagnosis.result_title')}
        back
        right={
          analysis ? (
            <View style={[styles.headerActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={saved ? t('diagnosis.unsave') : t('diagnosis.save')}
                onPress={toggleSaved}
                style={[
                  styles.headerButton,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                <Ionicons
                  name={saved ? 'bookmark' : 'bookmark-outline'}
                  size={20}
                  color={saved ? theme.colors.brand : theme.colors.text}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('diagnosis.share')}
                onPress={() => void share()}
                disabled={sharing}
                style={[
                  styles.headerButton,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                <Ionicons name="share-outline" size={20} color={theme.colors.text} />
              </Pressable>
            </View>
          ) : null
        }
      />

      {record.status === 'analyzing' || record.status === 'draft' ? renderAnalyzing() : null}
      {record.status === 'failed' ? renderFailed() : null}
      {record.status === 'completed' ? renderAnalysis() : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionCard: { gap: 10 },
  titleBlock: { gap: 8 },
  badgeRow: { flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  metaRow: { flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  inline: { alignItems: 'center', gap: 6 },
  flex: { flex: 1, gap: 3 },
  imageRow: { gap: 8 },
  image: { width: 120, height: 120, borderRadius: 12 },
  analyzing: { gap: 12, alignItems: 'center', paddingVertical: 28 },
  steps: { gap: 10, alignSelf: 'stretch', marginTop: 6 },
  analyzingStep: { alignItems: 'center', gap: 8 },
  uncertainty: { gap: 6, marginTop: 4 },
  bullets: { gap: 6 },
  bulletRow: { alignItems: 'flex-start', gap: 8 },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 8 },
  observation: { gap: 4 },
  observationHeader: { alignItems: 'flex-start', gap: 8 },
  cause: { gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  nextStep: { gap: 4, paddingVertical: 4 },
  option: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  estimateUnavailable: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  followUp: { gap: 2 },
  stars: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { gap: 8, marginTop: 4 },
  provider: { gap: 2, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 4 },
  headerActions: { gap: 6 },
  headerButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

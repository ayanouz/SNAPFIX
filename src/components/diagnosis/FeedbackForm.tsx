import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, TextField } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { useFeedback, useSubmitFeedback } from '@/hooks/queries';
import { feedbackSchema } from '@/domain/validation';
import {
  FEEDBACK_REASONS,
  type DiagnosisFeedback,
  type FeedbackReason,
} from '@/domain/diagnosis/types';
import { trackEvent } from '@/services/analytics';

export function FeedbackForm({ diagnosisId }: { diagnosisId: string }) {
  const feedback = useFeedback(diagnosisId);
  return (
    <FeedbackFormInner
      key={feedback.data?.id ?? 'new'}
      diagnosisId={diagnosisId}
      existing={feedback.data ?? null}
    />
  );
}

function FeedbackFormInner({
  diagnosisId,
  existing,
}: {
  diagnosisId: string;
  existing: DiagnosisFeedback | null;
}) {
  const { theme } = useTheme();
  const { t, isRTL } = useI18n();
  const { session } = useAuth();
  const submit = useSubmitFeedback();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [reason, setReason] = useState<FeedbackReason | null>(existing?.reason ?? null);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    const parsed = feedbackSchema.safeParse({ rating, reason, comment });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('errors.invalid_input'));
      return;
    }
    setError(null);
    submit.mutate(
      {
        diagnosisId,
        rating: parsed.data.rating,
        reason: parsed.data.reason,
        comment: parsed.data.comment,
      },
      {
        onSuccess: () => {
          Alert.alert(t('common.done'), t('diagnosis.feedback_thanks'));
          void trackEvent(session?.user.id ?? null, 'feedback_submitted', {
            rating: parsed.data.rating,
          });
        },
        onError: () => setError(t('errors.unknown')),
      },
    );
  };

  return (
    <Card style={styles.card}>
      <AppText variant="subtitle">{t('diagnosis.feedback')}</AppText>
      <AppText variant="body" color={theme.colors.textMuted}>
        {existing ? t('diagnosis.feedback_thanks') : t('diagnosis.feedback_prompt')}
      </AppText>
      <View style={[styles.stars, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={`${value} / 5`}
            accessibilityState={{ selected: rating === value }}
            onPress={() => setRating(value)}
            hitSlop={6}
          >
            <Ionicons
              name={value <= rating ? 'star' : 'star-outline'}
              size={28}
              color={value <= rating ? theme.colors.warning : theme.colors.textMuted}
            />
          </Pressable>
        ))}
      </View>
      {rating > 0 && rating <= 3 ? (
        <View style={styles.chips}>
          {FEEDBACK_REASONS.map((value) => (
            <Chip
              key={value}
              label={t(`diagnosis.reason_${value}`)}
              selected={reason === value}
              onPress={() => setReason(reason === value ? null : value)}
            />
          ))}
        </View>
      ) : null}
      <TextField
        label={t('diagnosis.comment')}
        value={comment}
        onChangeText={setComment}
        multiline
        maxLength={1000}
        placeholder={t('diagnosis.comment')}
      />
      {error ? (
        <AppText variant="caption" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : null}
      <Button
        label={t('diagnosis.submit_feedback')}
        variant="secondary"
        icon="send-outline"
        loading={submit.isPending}
        onPress={send}
        disabled={rating === 0}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  stars: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});

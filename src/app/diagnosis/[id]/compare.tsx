import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  LoadingView,
  Screen,
  ScreenHeader,
  TextField,
} from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAddQuote, useDeleteQuote, useDiagnosis, useQuotes } from '@/hooks/queries';
import { compareQuotes } from '@/domain/diagnosis/cost';
import { quoteFormSchema } from '@/domain/validation';
import { usePreferencesStore } from '@/stores/preferences';
import { formatCurrency, formatEstimateRange } from '@/utils/format';

type FormErrors = Partial<Record<'label' | 'amount', string>>;

export default function CompareQuotesScreen() {
  const { theme } = useTheme();
  const { t, language, isRTL } = useI18n();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const diagnosis = useDiagnosis(id);
  const quotes = useQuotes(id);
  const addQuote = useAddQuote(id ?? '');
  const deleteQuote = useDeleteQuote(id ?? '');
  const preferredCurrency = usePreferencesStore((state) => state.currency);

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'repair' | 'replacement'>('repair');
  const [includesParts, setIncludesParts] = useState(false);
  const [includesLabor, setIncludesLabor] = useState(false);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const currency = diagnosis.data?.currency ?? preferredCurrency;
  const comparison = compareQuotes(quotes.data ?? []);
  const estimateRange = diagnosis.data?.analysis
    ? formatEstimateRange(diagnosis.data.analysis.estimate, language)
    : null;

  const submit = () => {
    if (!id) return;
    const parsed = quoteFormSchema.safeParse({
      label,
      amount,
      type,
      includesParts,
      includesLabor,
      notes,
    });
    if (!parsed.success) {
      const next: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'label' || field === 'amount') {
          if (!next[field]) next[field] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setFormError(null);
    addQuote.mutate(
      {
        diagnosisId: id,
        type: parsed.data.type,
        label: parsed.data.label,
        amount: parsed.data.amount,
        currency,
        includesParts: parsed.data.includesParts,
        includesLabor: parsed.data.includesLabor,
        notes: parsed.data.notes,
      },
      {
        onSuccess: () => {
          setLabel('');
          setAmount('');
          setNotes('');
          setType('repair');
          setIncludesParts(false);
          setIncludesLabor(false);
          setShowForm(false);
        },
        onError: () => setFormError(t('errors.unknown')),
      },
    );
  };

  const confirmDelete = (quoteId: string) => {
    Alert.alert(t('compare.delete_quote'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () =>
          deleteQuote.mutate(quoteId, {
            onError: () => Alert.alert(t('errors.title'), t('errors.unknown')),
          }),
      },
    ]);
  };

  if (!id) {
    return (
      <Screen>
        <ScreenHeader title={t('compare.title')} back />
        <ErrorState error={null} />
      </Screen>
    );
  }

  if (quotes.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t('compare.title')} back />
        <LoadingView />
      </Screen>
    );
  }

  if (quotes.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('compare.title')} back />
        <ErrorState error={quotes.error} onRetry={() => void quotes.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('compare.title')} subtitle={t('compare.subtitle')} back />

      <Card style={styles.estimateNote}>
        <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="information-circle-outline" size={18} color={theme.colors.info} />
          <AppText variant="caption" color={theme.colors.info} style={styles.flex}>
            {t('compare.estimate_note')}
          </AppText>
        </View>
        <AppText variant="body" color={theme.colors.textMuted}>
          {estimateRange
            ? `${t('estimate.available')}: ${estimateRange}`
            : t('diagnosis.estimate_unavailable')}
        </AppText>
      </Card>

      <Button
        label={showForm ? t('common.cancel') : t('compare.add_quote')}
        variant={showForm ? 'ghost' : 'secondary'}
        icon={showForm ? 'close-outline' : 'add-outline'}
        onPress={() => setShowForm((value) => !value)}
      />

      {showForm ? (
        <Card style={styles.form}>
          <TextField
            label={t('compare.quote_label')}
            value={label}
            onChangeText={setLabel}
            placeholder={t('compare.quote_label_placeholder')}
            error={errors.label}
            maxLength={120}
            required
          />
          <TextField
            label={`${t('compare.quote_amount')} (${currency})`}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            error={errors.amount}
            maxLength={12}
            required
          />
          <View style={styles.fieldBlock}>
            <AppText variant="label">{t('compare.quote_type')}</AppText>
            <View style={styles.chips}>
              <Chip
                label={t('compare.repair')}
                selected={type === 'repair'}
                onPress={() => setType('repair')}
              />
              <Chip
                label={t('compare.replacement')}
                selected={type === 'replacement'}
                onPress={() => setType('replacement')}
              />
            </View>
          </View>
          <View style={[styles.switchRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <AppText variant="body" style={styles.flex}>
              {t('compare.includes_parts')}
            </AppText>
            <Switch
              value={includesParts}
              onValueChange={setIncludesParts}
              trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={[styles.switchRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <AppText variant="body" style={styles.flex}>
              {t('compare.includes_labor')}
            </AppText>
            <Switch
              value={includesLabor}
              onValueChange={setIncludesLabor}
              trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
              thumbColor="#FFFFFF"
            />
          </View>
          <TextField
            label={t('compare.notes')}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={500}
          />
          {formError ? (
            <AppText variant="caption" color={theme.colors.danger}>
              {formError}
            </AppText>
          ) : null}
          <Button
            label={t('compare.save_quote')}
            icon="save-outline"
            loading={addQuote.isPending}
            onPress={submit}
          />
        </Card>
      ) : null}

      {quotes.data && quotes.data.length > 0 ? (
        <>
          <View style={styles.quoteList}>
            {quotes.data.map((quote) => (
              <Card key={quote.id} style={styles.quoteCard}>
                <View style={[styles.rowBetween, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <View style={[styles.flex, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                    <AppText variant="subtitle">{quote.label}</AppText>
                    <Badge
                      label={
                        quote.type === 'repair' ? t('compare.repair') : t('compare.replacement')
                      }
                      tone={quote.type === 'repair' ? 'info' : 'neutral'}
                    />
                  </View>
                  <View
                    style={[styles.amountBlock, { alignItems: isRTL ? 'flex-start' : 'flex-end' }]}
                  >
                    <AppText variant="title" color={theme.colors.text}>
                      {formatCurrency(quote.amount, quote.currency, language)}
                    </AppText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('compare.delete_quote')}
                      onPress={() => confirmDelete(quote.id)}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                    </Pressable>
                  </View>
                </View>
                <View style={styles.chips}>
                  {quote.includesParts ? (
                    <Badge label={t('compare.includes_parts')} tone="neutral" />
                  ) : null}
                  {quote.includesLabor ? (
                    <Badge label={t('compare.includes_labor')} tone="neutral" />
                  ) : null}
                </View>
                {quote.notes ? (
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    {quote.notes}
                  </AppText>
                ) : null}
              </Card>
            ))}
          </View>

          <Card style={styles.comparison}>
            <AppText variant="subtitle">{t('compare.comparison')}</AppText>
            {comparison.mixedCurrencies ? (
              <AppText variant="body" color={theme.colors.warning}>
                {t('compare.mixed_currencies')}
              </AppText>
            ) : (
              <>
                {comparison.cheapestRepair ? (
                  <View style={styles.comparisonRow}>
                    <AppText variant="label" color={theme.colors.textMuted}>
                      {t('compare.cheapest')}
                    </AppText>
                    <AppText variant="body">
                      {comparison.cheapestRepair.label} ·{' '}
                      {formatCurrency(
                        comparison.cheapestRepair.amount,
                        comparison.cheapestRepair.currency,
                        language,
                      )}
                    </AppText>
                  </View>
                ) : null}
                {comparison.savingsVsReplacement !== null && comparison.currency ? (
                  <AppText variant="body" color={theme.colors.success}>
                    {t('compare.savings', {
                      amount: formatCurrency(
                        comparison.savingsVsReplacement,
                        comparison.currency,
                        language,
                      ),
                    })}
                  </AppText>
                ) : null}
              </>
            )}
          </Card>
        </>
      ) : (
        <EmptyState
          icon="git-compare-outline"
          title={t('compare.no_quotes')}
          actionLabel={t('compare.add_quote')}
          onAction={() => setShowForm(true)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  estimateNote: { gap: 6 },
  inline: { alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1, gap: 3 },
  form: { gap: 12 },
  fieldBlock: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  switchRow: { alignItems: 'center', gap: 10 },
  quoteList: { gap: 8 },
  quoteCard: { gap: 8 },
  rowBetween: { justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  amountBlock: { gap: 4 },
  comparison: { gap: 8 },
  comparisonRow: { gap: 2 },
});

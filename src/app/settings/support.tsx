import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Chip, Screen, ScreenHeader, TextField } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { useSendSupportMessage } from '@/hooks/queries';
import { supportFormSchema } from '@/domain/validation';
import type { SupportMessage } from '@/domain/diagnosis/types';

type Category = SupportMessage['category'];

const CATEGORIES: Category[] = ['bug', 'diagnosis', 'privacy', 'billing', 'other'];

type FormErrors = Partial<Record<'email' | 'message', string>>;

export default function SupportScreen() {
  const { theme } = useTheme();
  const { t, isRTL } = useI18n();
  const { session } = useAuth();
  const send = useSendSupportMessage();
  const [category, setCategory] = useState<Category>('bug');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [sent, setSent] = useState(false);

  const submit = () => {
    const parsed = supportFormSchema.safeParse({ category, email, message });
    if (!parsed.success) {
      const next: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email' || field === 'message') {
          if (!next[field]) next[field] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    send.mutate(
      {
        category: parsed.data.category,
        email: parsed.data.email,
        message: parsed.data.message,
        diagnosisId: null,
      },
      {
        onSuccess: () => {
          setSent(true);
          setMessage('');
        },
        onError: () => Alert.alert(t('errors.title'), t('errors.unknown')),
      },
    );
  };

  return (
    <Screen>
      <ScreenHeader title={t('support.title')} subtitle={t('support.subtitle')} back />

      {sent ? (
        <Card tone="success" style={styles.section}>
          <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
            <AppText variant="subtitle" color={theme.colors.success} style={styles.flex}>
              {t('support.sent')}
            </AppText>
          </View>
          <Button
            label={t('support.send')}
            variant="secondary"
            onPress={() => setSent(false)}
            fullWidth={false}
          />
        </Card>
      ) : null}

      <Card style={styles.section}>
        <AppText variant="label">{t('support.category')}</AppText>
        <View style={styles.chips}>
          {CATEGORIES.map((value) => (
            <Chip
              key={value}
              label={t(`support.${value}`)}
              selected={category === value}
              onPress={() => setCategory(value)}
            />
          ))}
        </View>
        <TextField
          label={t('support.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          error={errors.email}
          maxLength={254}
        />
        <TextField
          label={t('support.message')}
          value={message}
          onChangeText={setMessage}
          placeholder={t('support.message_placeholder')}
          error={errors.message}
          multiline
          maxLength={2000}
          required
        />
        <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Ionicons name="lock-closed-outline" size={16} color={theme.colors.textMuted} />
          <AppText variant="caption" color={theme.colors.textMuted} style={styles.flex}>
            {t('support.privacy_note')}
          </AppText>
        </View>
        <Button
          label={t('support.send')}
          icon="send-outline"
          loading={send.isPending}
          onPress={submit}
          disabled={message.trim().length < 10}
        />
      </Card>

      <AppText variant="caption" color={theme.colors.textMuted} align="center">
        {t('support.response_time')}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  inline: { alignItems: 'flex-start', gap: 8 },
  flex: { flex: 1, gap: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});

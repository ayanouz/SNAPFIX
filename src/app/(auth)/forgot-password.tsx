import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { forgotPasswordSchema } from '@/domain/validation';
import { normalizeError } from '@/domain/errors';

export default function ForgotPasswordScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? null);
      return;
    }
    setError(null);
    setFormError(null);
    setLoading(true);
    try {
      await requestPasswordReset(parsed.data.email);
      setSent(true);
    } catch (cause) {
      setFormError(t(`errors.${normalizeError(cause).code}`));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen contentContainerStyle={styles.content}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.back()}
        style={styles.back}
        hitSlop={12}
      >
        <Ionicons name="chevron-back" size={22} color={theme.colors.text} />
        <AppText variant="label" color={theme.colors.textMuted}>
          {t('common.back')}
        </AppText>
      </Pressable>

      <View style={styles.hero}>
        <View style={[styles.mark, { backgroundColor: theme.colors.infoSoft }]}>
          <Ionicons name="key-outline" size={28} color={theme.colors.info} />
        </View>
        <AppText variant="title" align="center">
          {t('auth.reset_title')}
        </AppText>
        <AppText variant="body" align="center" color={theme.colors.textMuted}>
          {t('auth.reset_subtitle')}
        </AppText>
      </View>

      {sent ? (
        <Card tone="success" style={styles.card}>
          <AppText variant="subtitle" color={theme.colors.success}>
            {t('auth.reset_sent')}
          </AppText>
          <Button
            label={t('auth.back_to_sign_in')}
            onPress={() => router.replace('/(auth)/sign-in')}
            variant="secondary"
          />
        </Card>
      ) : (
        <Card style={styles.card}>
          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            error={error}
          />
          {formError ? (
            <AppText variant="caption" color={theme.colors.danger}>
              {formError}
            </AppText>
          ) : null}
          <Button
            label={t('auth.send_reset')}
            onPress={() => void submit()}
            loading={loading}
            icon="mail-outline"
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 12, gap: 22 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  hero: { alignItems: 'center', gap: 8 },
  mark: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { gap: 14 },
});

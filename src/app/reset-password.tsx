import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText, Button, Card, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { resetPasswordSchema } from '@/domain/validation';
import { normalizeError } from '@/domain/errors';

type Status = 'checking' | 'ready' | 'error';

export default function ResetPasswordScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const { session, completePasswordRecovery, updatePassword, signOut } = useAuth();
  const [status, setStatus] = useState<Status>(() =>
    code ? 'checking' : session ? 'ready' : 'error',
  );
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!code)
      return () => {
        active = false;
      };
    completePasswordRecovery(`snapfix://reset-password?code=${encodeURIComponent(code)}`)
      .then(() => {
        if (active) setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [code, completePasswordRecovery]);

  const submit = async () => {
    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const next: { password?: string; confirmPassword?: string } = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'password' || field === 'confirmPassword') {
          if (!next[field]) next[field] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      await updatePassword(parsed.data.password);
      await signOut();
      Alert.alert(t('common.done'), t('auth.password_updated'));
      router.replace('/(auth)/sign-in');
    } catch (cause) {
      setFormError(t(`errors.${normalizeError(cause).code}`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={[styles.mark, { backgroundColor: theme.colors.infoSoft }]}>
          <Ionicons name="lock-closed-outline" size={28} color={theme.colors.info} />
        </View>
        <AppText variant="title" align="center">
          {status === 'error' ? t('auth.recovery_invalid') : t('auth.new_password')}
        </AppText>
      </View>

      {status === 'checking' ? (
        <Card style={styles.card}>
          <AppText variant="body" align="center" color={theme.colors.textMuted}>
            {t('common.loading')}
          </AppText>
        </Card>
      ) : status === 'error' ? (
        <Card style={styles.card}>
          <Button
            label={t('auth.back_to_sign_in')}
            onPress={() => router.replace('/(auth)/sign-in')}
          />
        </Card>
      ) : (
        <Card style={styles.card}>
          <TextField
            label={t('auth.new_password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            hint={t('auth.password_hint')}
            error={errors.password}
          />
          <TextField
            label={t('auth.confirm_password')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            error={errors.confirmPassword}
          />
          {formError ? (
            <AppText variant="caption" color={theme.colors.danger}>
              {formError}
            </AppText>
          ) : null}
          <Button
            label={t('auth.update_password')}
            onPress={() => void submit()}
            loading={saving}
            icon="checkmark-circle-outline"
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: 20, paddingTop: 24 },
  hero: { alignItems: 'center', gap: 10 },
  mark: {
    width: 62,
    height: 62,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { gap: 14 },
});

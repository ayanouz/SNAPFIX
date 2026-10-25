import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText, Button, Card, Screen, ScreenHeader, TextField } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { resetPasswordSchema } from '@/domain/validation';
import { normalizeError } from '@/domain/errors';

type FieldErrors = Partial<Record<'password' | 'confirmPassword', string>>;

export default function ChangePasswordScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const submit = async () => {
    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'password' || field === 'confirmPassword') {
          next[field] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      await updatePassword(parsed.data.password);
      Alert.alert(t('common.done'), t('auth.password_updated'));
      goBack();
    } catch (error) {
      setFormError(t(`errors.${normalizeError(error).code}`));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('profile.change_password')} back />
      <Card style={styles.card}>
        <AppText variant="body" color={theme.colors.textMuted}>
          {t('auth.password_hint')}
        </AppText>
        <TextField
          label={t('auth.new_password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          error={errors.password}
          required
        />
        <TextField
          label={t('auth.confirm_password')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          error={errors.confirmPassword}
          required
        />
        {formError ? (
          <AppText variant="caption" color={theme.colors.danger}>
            {formError}
          </AppText>
        ) : null}
        <Button
          label={t('auth.update_password')}
          icon="lock-closed-outline"
          loading={loading}
          onPress={() => void submit()}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});

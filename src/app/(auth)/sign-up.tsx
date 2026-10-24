import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { AppText, Button, Card, DemoBanner, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { signUpSchema } from '@/domain/validation';
import { normalizeError } from '@/domain/errors';

type FieldErrors = Partial<
  Record<'displayName' | 'email' | 'password' | 'confirmPassword', string>
>;

export default function SignUpScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const submit = async () => {
    const parsed = signUpSchema.safeParse({
      displayName,
      email,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          field === 'displayName' ||
          field === 'email' ||
          field === 'password' ||
          field === 'confirmPassword'
        ) {
          if (!next[field]) next[field] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      const result = await signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        displayName: parsed.data.displayName,
      });
      if (result.needsEmailConfirmation) {
        setConfirmationSent(true);
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      setFormError(t(`errors.${normalizeError(error).code}`));
    } finally {
      setLoading(false);
    }
  };

  if (confirmationSent) {
    return (
      <Screen contentContainerStyle={styles.confirm}>
        <View style={[styles.mark, { backgroundColor: theme.colors.successSoft }]}>
          <Ionicons name="mail-outline" size={30} color={theme.colors.success} />
        </View>
        <AppText variant="title" align="center">
          {t('auth.email_confirmation')}
        </AppText>
        <AppText variant="body" align="center" color={theme.colors.textMuted}>
          {t('auth.email_confirmation_body')}
        </AppText>
        <Button
          label={t('auth.back_to_sign_in')}
          onPress={() => router.replace('/(auth)/sign-in')}
        />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.mark, { backgroundColor: theme.colors.brand }]}>
            <Ionicons name="person-add-outline" size={28} color={theme.colors.onBrand} />
          </View>
          <AppText variant="title" align="center">
            {t('auth.sign_up')}
          </AppText>
        </View>

        <DemoBanner />

        <Card style={styles.form}>
          <TextField
            label={t('auth.display_name')}
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            error={errors.displayName}
          />
          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            error={errors.email}
          />
          <TextField
            label={t('auth.password')}
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
            label={loading ? t('auth.creating') : t('auth.sign_up')}
            onPress={() => void submit()}
            loading={loading}
            icon="person-add-outline"
          />
        </Card>

        <View style={styles.footer}>
          <AppText variant="body" color={theme.colors.textMuted}>
            {t('auth.have_account')}
          </AppText>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable accessibilityRole="link">
              <AppText variant="label" color={theme.colors.brand}>
                {t('auth.sign_in')}
              </AppText>
            </Pressable>
          </Link>
        </View>
        <AppText variant="caption" color={theme.colors.textMuted} align="center">
          {t('auth.terms')}
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { justifyContent: 'center', paddingTop: 16 },
  hero: { alignItems: 'center', gap: 8 },
  mark: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  form: { gap: 14 },
  confirm: { justifyContent: 'center', alignItems: 'center', gap: 14, paddingTop: 40 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
});

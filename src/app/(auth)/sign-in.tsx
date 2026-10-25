import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { AppText, Button, Card, DemoBanner, LegalLinks, Screen, TextField } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { signInSchema } from '@/domain/validation';
import { normalizeError } from '@/domain/errors';
import { appConfig } from '@/constants/config';

export default function SignInScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const { signIn, signInDemo } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const submit = async () => {
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      const next: { email?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email' || field === 'password') next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
      router.replace('/(tabs)');
    } catch (error) {
      setFormError(t(`errors.${normalizeError(error).code}`));
    } finally {
      setLoading(false);
    }
  };

  const enterDemo = async () => {
    setDemoLoading(true);
    setFormError(null);
    try {
      await signInDemo();
      router.replace('/(tabs)');
    } catch (error) {
      setFormError(t(`errors.${normalizeError(error).code}`));
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={[styles.mark, { backgroundColor: theme.colors.brand }]}>
            <Ionicons name="scan-outline" size={30} color={theme.colors.onBrand} />
          </View>
          <AppText variant="title" align="center">
            {t('auth.sign_in')}
          </AppText>
          <AppText variant="body" align="center" color={theme.colors.textMuted}>
            {t('app.tagline')}
          </AppText>
        </View>

        <DemoBanner />

        <Card style={styles.form}>
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
            autoComplete="current-password"
            textContentType="password"
            error={errors.password}
          />
          {formError ? (
            <AppText variant="caption" color={theme.colors.danger}>
              {formError}
            </AppText>
          ) : null}
          <Button
            label={t('auth.sign_in')}
            onPress={() => void submit()}
            loading={loading}
            icon="log-in-outline"
          />
          {!appConfig.demoMode ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/(auth)/forgot-password')}
              style={styles.center}
            >
              <AppText variant="label" color={theme.colors.brand}>
                {t('auth.forgot_password')}
              </AppText>
            </Pressable>
          ) : null}
        </Card>

        {appConfig.demoMode ? (
          <Card style={styles.demoCard}>
            <AppText variant="subtitle">{t('auth.sign_in_demo')}</AppText>
            <AppText variant="body" color={theme.colors.textMuted}>
              {t('auth.demo_explainer')}
            </AppText>
            <Button
              label={t('auth.sign_in_demo')}
              variant="secondary"
              icon="flask-outline"
              onPress={() => void enterDemo()}
              loading={demoLoading}
            />
          </Card>
        ) : null}

        <View style={styles.footer}>
          <AppText variant="body" color={theme.colors.textMuted}>
            {t('auth.no_account')}
          </AppText>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable accessibilityRole="link">
              <AppText variant="label" color={theme.colors.brand}>
                {t('auth.sign_up')}
              </AppText>
            </Pressable>
          </Link>
        </View>
        <AppText variant="caption" color={theme.colors.textMuted} align="center">
          {t('auth.terms')}
        </AppText>
        <LegalLinks />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { justifyContent: 'center', paddingTop: 24 },
  hero: { alignItems: 'center', gap: 8 },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  form: { gap: 14 },
  demoCard: { gap: 10 },
  center: { alignItems: 'center', paddingVertical: 4 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
});

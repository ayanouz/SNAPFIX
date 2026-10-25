import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AppText,
  Button,
  Card,
  ErrorState,
  LoadingView,
  Screen,
  ScreenHeader,
  TextField,
} from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useProfile, useUpdateProfile } from '@/hooks/queries';

export default function EditProfileScreen() {
  const profile = useProfile();
  const { t } = useI18n();

  if (profile.isLoading) {
    return (
      <Screen>
        <ScreenHeader title={t('profile.account_settings')} back />
        <LoadingView />
      </Screen>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <Screen>
        <ScreenHeader title={t('profile.account_settings')} back />
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }

  return (
    <EditProfileForm
      key={profile.data.id}
      initialName={profile.data.displayName}
      email={profile.data.email}
    />
  );
}

function EditProfileForm({ initialName, email }: { initialName: string; email: string }) {
  const { theme } = useTheme();
  const { t, isRTL } = useI18n();
  const router = useRouter();
  const update = useUpdateProfile();
  const [displayName, setDisplayName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const save = async () => {
    const value = displayName.trim();
    if (value.length < 1 || value.length > 80) {
      setError(t('errors.invalid_input'));
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({ displayName: value });
      Alert.alert(t('common.done'), t('profile.saved'));
      goBack();
    } catch {
      setError(t('errors.unknown'));
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('profile.account_settings')} back />
      <Card style={styles.card}>
        <AppText variant="subtitle">{t('profile.account')}</AppText>
        <TextField
          label={t('profile.display_name')}
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          maxLength={80}
          error={error ?? undefined}
          required
        />
        <View style={styles.readonly}>
          <AppText variant="label" color={theme.colors.textMuted}>
            {t('profile.email')}
          </AppText>
          <AppText variant="body">{email}</AppText>
        </View>
        <Button
          label={t('common.save')}
          icon="checkmark"
          onPress={() => void save()}
          loading={update.isPending}
        />
      </Card>

      <Card style={styles.card}>
        <AppText variant="subtitle">{t('auth.password')}</AppText>
        <AppText variant="body" color={theme.colors.textMuted}>
          {t('auth.password_hint')}
        </AppText>
        <Button
          label={t('profile.change_password')}
          variant="secondary"
          icon="lock-closed-outline"
          onPress={() => router.push('/settings/password')}
        />
      </Card>

      <View style={{ alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
        <Button label={t('common.cancel')} variant="ghost" onPress={goBack} fullWidth={false} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  readonly: { gap: 4 },
});

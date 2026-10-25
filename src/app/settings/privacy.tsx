import { useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Screen, ScreenHeader } from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { useDeleteAllData } from '@/hooks/queries';
import { shareExport } from '@/services/share';
import { exportUserData } from '@/services/export';
import { appConfig } from '@/constants/config';

export default function PrivacyScreen() {
  const { theme } = useTheme();
  const { t, isRTL } = useI18n();
  const { repository } = useAuth();
  const deleteAll = useDeleteAllData();
  const [exporting, setExporting] = useState(false);

  const exportData = async () => {
    if (!repository) {
      Alert.alert(t('errors.title'), t('errors.unauthorized'));
      return;
    }
    setExporting(true);
    try {
      const bundle = await exportUserData(repository);
      await shareExport(bundle);
      Alert.alert(t('common.done'), t('profile.export_ready'));
    } catch {
      Alert.alert(t('errors.title'), t('profile.export_failed'));
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(t('profile.delete_data_confirm'), t('profile.delete_data_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteAll.mutate(undefined, {
            onSuccess: () => Alert.alert(t('common.done'), t('profile.data_deleted')),
            onError: () => Alert.alert(t('errors.title'), t('errors.unknown')),
          });
        },
      },
    ]);
  };

  const sections = [
    {
      icon: 'server-outline' as const,
      title: t('privacy.data_title'),
      body: t('privacy.data_body'),
    },
    {
      icon: 'images-outline' as const,
      title: t('privacy.photos_title'),
      body: t('privacy.photos_body'),
    },
    { icon: 'sparkles-outline' as const, title: t('privacy.ai_title'), body: t('privacy.ai_body') },
    {
      icon: 'time-outline' as const,
      title: t('privacy.retention_title'),
      body: t('privacy.retention_body'),
    },
    {
      icon: 'options-outline' as const,
      title: t('privacy.rights_title'),
      body: t('privacy.rights_body'),
    },
  ];

  return (
    <Screen>
      <ScreenHeader title={t('privacy.title')} back />

      <AppText variant="body" color={theme.colors.textMuted}>
        {t('privacy.intro')}
      </AppText>

      {sections.map((section) => (
        <Card key={section.title} style={styles.section}>
          <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <View style={[styles.icon, { backgroundColor: theme.colors.surfaceAlt }]}>
              <Ionicons name={section.icon} size={19} color={theme.colors.brand} />
            </View>
            <AppText variant="subtitle" style={styles.flex}>
              {section.title}
            </AppText>
          </View>
          <AppText variant="body" color={theme.colors.textMuted}>
            {section.body}
          </AppText>
        </Card>
      ))}

      <Card style={styles.section}>
        <AppText variant="subtitle">{t('privacy.contact')}</AppText>
        <AppText variant="body" color={theme.colors.textMuted}>
          {appConfig.supportEmail}
        </AppText>
        <Button
          label={appConfig.supportEmail}
          variant="secondary"
          icon="mail-outline"
          onPress={() => {
            void Linking.openURL(`mailto:${appConfig.supportEmail}`);
          }}
        />
      </Card>

      <View style={styles.actions}>
        <Button
          label={t('privacy.export')}
          variant="secondary"
          icon="download-outline"
          loading={exporting}
          onPress={() => void exportData()}
        />
        <Button
          label={t('privacy.delete')}
          variant="danger"
          icon="trash-outline"
          loading={deleteAll.isPending}
          onPress={confirmDelete}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  inline: { alignItems: 'center', gap: 10 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, gap: 3 },
  actions: { gap: 8 },
});

import { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  Screen,
  ScreenHeader,
  TextField,
} from '@/components/ui';
import { useTheme } from '@/providers/ThemeProvider';
import { useI18n } from '@/i18n';
import { useAuth } from '@/providers/AuthProvider';
import { useCreateDiagnosis, useUsage } from '@/hooks/queries';
import { diagnosisDetailsFormSchema, type DiagnosisDetailsForm } from '@/domain/validation';
import { CATEGORIES, type Category } from '@/domain/diagnosis/schema';
import { PLAN_LIMITS } from '@/domain/usage';
import { useDiagnosisDraft } from '@/stores/diagnosisDraft';
import { usePreferencesStore } from '@/stores/preferences';
import {
  deleteFileQuietly,
  persistDraftImage,
  prepareImage,
} from '@/services/storage/imageService';
import { createId } from '@/utils/ids';
import { normalizeError } from '@/domain/errors';
import { appConfig } from '@/constants/config';

export default function DiagnoseScreen() {
  const { theme } = useTheme();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const { session } = useAuth();
  const usage = useUsage();
  const createDiagnosis = useCreateDiagnosis();
  const currency = usePreferencesStore((state) => state.currency);
  const draft = useDiagnosisDraft();
  const [submitting, setSubmitting] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const maxPhotos = usage.data
    ? PLAN_LIMITS[usage.data.plan].maxPhotos
    : PLAN_LIMITS.free.maxPhotos;
  const remainingPhotos = Math.max(0, maxPhotos - draft.photos.length);
  const remainingDiagnoses = usage.data ? Math.max(0, usage.data.limit - usage.data.used) : 1;

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<DiagnosisDetailsForm>({
    defaultValues: {
      description: draft.description,
      brand: draft.brand,
      model: draft.model,
      errorCode: draft.errorCode,
      ageYears: draft.ageYears,
    },
  });

  const addPrepared = async (asset: ImagePicker.ImagePickerAsset) => {
    const prepared = await prepareImage({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
    });
    const persisted = await persistDraftImage(prepared);
    draft.addPhoto({
      uri: persisted.uri,
      width: persisted.width,
      height: persisted.height,
      sizeBytes: persisted.sizeBytes,
      mimeType: persisted.mimeType,
    });
  };

  const pickFromLibrary = async () => {
    setPhotoError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('diagnose.permission_title'), t('diagnose.permission_body'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remainingPhotos,
        quality: 0.9,
        exif: false,
      });
      if (result.canceled) return;
      for (const asset of result.assets.slice(0, remainingPhotos)) {
        await addPrepared(asset);
      }
    } catch (error) {
      const normalized = normalizeError(error);
      setPhotoError(t(`errors.${normalized.code}`));
    }
  };

  const takePhoto = async () => {
    setPhotoError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('diagnose.permission_title'), t('diagnose.permission_body'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        exif: false,
      });
      if (result.canceled || !result.assets[0]) return;
      await addPrepared(result.assets[0]);
    } catch (error) {
      const normalized = normalizeError(error);
      setPhotoError(t(`errors.${normalized.code}`));
    }
  };

  const removePhoto = (uri: string) => {
    draft.removePhoto(uri);
    deleteFileQuietly(uri);
  };

  const submit = handleSubmit(async (values) => {
    const parsed = diagnosisDetailsFormSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          field === 'description' ||
          field === 'brand' ||
          field === 'model' ||
          field === 'errorCode' ||
          field === 'ageYears'
        ) {
          setError(field, { type: 'validation', message: issue.message });
        }
      }
      return;
    }
    if (draft.photos.length === 0) {
      setPhotoError(t('diagnose.photo_required'));
      return;
    }
    if (remainingDiagnoses <= 0) {
      Alert.alert(t('errors.quota_exceeded'), t('errors.quota_exceeded'), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('profile.upgrade'),
          onPress: () => router.push('/settings/subscription'),
        },
      ]);
      return;
    }

    setSubmitting(true);
    try {
      const record = await createDiagnosis.mutateAsync({
        id: createId(),
        category: draft.category,
        description: parsed.data.description,
        brand: parsed.data.brand,
        model: parsed.data.model,
        errorCode: parsed.data.errorCode,
        itemAgeYears: parsed.data.ageYears,
        currency,
        locale: language,
        imageUris: draft.photos.map((photo) => photo.uri),
      });
      for (const photo of draft.photos) deleteFileQuietly(photo.uri);
      draft.reset();
      router.replace({ pathname: '/diagnosis/[id]', params: { id: record.id } });
    } catch (error) {
      Alert.alert(t('errors.title'), t(`errors.${normalizeError(error).code}`));
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <ScreenHeader title={t('diagnose.title')} subtitle={t('diagnose.subtitle')} back />

        {appConfig.demoMode ? <Badge label={t('app.demo')} tone="warning" /> : null}

        <Card style={styles.section}>
          <View style={[styles.rowBetween, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <AppText variant="subtitle">{t('diagnose.photos_title')}</AppText>
            <AppText variant="caption" color={theme.colors.textMuted}>
              {t('diagnose.photo_limit', { count: draft.photos.length, limit: maxPhotos })}
            </AppText>
          </View>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {t('diagnose.photos_hint')}
          </AppText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRow}
          >
            {draft.photos.map((photo, index) => (
              <View key={photo.uri} style={styles.photoWrap}>
                <Image source={{ uri: photo.uri }} style={styles.photo} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('diagnose.remove_photo')}
                  onPress={() => removePhoto(photo.uri)}
                  style={[styles.removePhoto, { backgroundColor: theme.colors.danger }]}
                >
                  <Ionicons name="close" size={14} color="#FFFFFF" />
                </Pressable>
                <View style={[styles.photoIndex, { backgroundColor: theme.colors.overlay }]}>
                  <AppText variant="caption" color="#FFFFFF">
                    {index + 1}
                  </AppText>
                </View>
              </View>
            ))}
            {remainingPhotos > 0 ? (
              <View style={styles.addColumn}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('diagnose.gallery')}
                  onPress={() => void pickFromLibrary()}
                  style={[
                    styles.addPhoto,
                    {
                      backgroundColor: theme.colors.surfaceAlt,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Ionicons name="images-outline" size={24} color={theme.colors.brand} />
                  <AppText variant="caption" color={theme.colors.brand} align="center">
                    {t('diagnose.gallery')}
                  </AppText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('diagnose.camera')}
                  onPress={() => void takePhoto()}
                  style={[
                    styles.cameraButton,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Ionicons name="camera-outline" size={16} color={theme.colors.text} />
                  <AppText variant="caption" color={theme.colors.text}>
                    {t('diagnose.camera')}
                  </AppText>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
          {photoError ? (
            <AppText variant="caption" color={theme.colors.danger}>
              {photoError}
            </AppText>
          ) : null}
          <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Ionicons name="shield-outline" size={16} color={theme.colors.warning} />
            <AppText variant="caption" color={theme.colors.warning} style={styles.flex}>
              {t('diagnose.safety_note')}
            </AppText>
          </View>
        </Card>

        <Card style={styles.section}>
          <AppText variant="subtitle">{t('diagnose.category')}</AppText>
          <View style={styles.chips}>
            {CATEGORIES.map((value: Category) => (
              <Chip
                key={value}
                label={t(`category.${value}`)}
                selected={draft.category === value}
                onPress={() => draft.setCategory(value)}
              />
            ))}
          </View>
        </Card>

        <Card style={styles.section}>
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={t('diagnose.description')}
                value={value}
                onChangeText={(next) => {
                  onChange(next);
                  draft.setDescription(next);
                }}
                onBlur={onBlur}
                placeholder={t('diagnose.description_placeholder')}
                hint={t('diagnose.description_hint')}
                error={errors.description?.message}
                multiline
                maxLength={2000}
                required
              />
            )}
          />
        </Card>

        <Card style={styles.section}>
          <AppText variant="subtitle">{t('diagnose.details_title')}</AppText>
          <AppText variant="caption" color={theme.colors.textMuted}>
            {t('diagnose.details_hint')}
          </AppText>
          <Controller
            control={control}
            name="brand"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={t('diagnose.brand')}
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                maxLength={80}
                error={errors.brand?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="model"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={t('diagnose.model')}
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                maxLength={80}
                error={errors.model?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="errorCode"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={t('diagnose.error_code')}
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                maxLength={40}
                autoCapitalize="characters"
                error={errors.errorCode?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="ageYears"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextField
                label={t('diagnose.age')}
                value={value ?? ''}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder={t('diagnose.age_placeholder')}
                keyboardType="number-pad"
                maxLength={3}
                error={errors.ageYears?.message}
              />
            )}
          />
        </Card>

        {usage.data && remainingDiagnoses <= 0 ? (
          <Card tone="warning" style={styles.section}>
            <AppText variant="subtitle" color={theme.colors.warning}>
              {t('errors.quota_exceeded')}
            </AppText>
            <Button
              label={t('profile.upgrade')}
              variant="secondary"
              onPress={() => router.push('/settings/subscription')}
            />
          </Card>
        ) : null}

        <Button
          label={submitting ? t('diagnose.submitting') : t('diagnose.submit')}
          icon="sparkles-outline"
          loading={submitting}
          onPress={() => void submit()}
          disabled={!session}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: 10 },
  rowBetween: { justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  photoRow: { gap: 10, paddingVertical: 2 },
  photoWrap: { width: 104, height: 104 },
  photo: { width: 104, height: 104, borderRadius: 12 },
  removePhoto: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoIndex: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  addColumn: { gap: 6 },
  addPhoto: {
    width: 104,
    height: 74,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  cameraButton: {
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  inline: { alignItems: 'flex-start', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

import { useDeferredValue, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  AppText,
  Badge,
  Button,
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
import { useDiagnosisHistory } from '@/hooks/queries';
import { CATEGORIES, type Category } from '@/domain/diagnosis/schema';
import { formatRelativeDate, truncate } from '@/utils/format';

export default function HistoryScreen() {
  const { theme } = useTheme();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [savedOnly, setSavedOnly] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);

  const history = useDiagnosisHistory({
    search: deferredSearch,
    savedOnly,
    category,
  });

  const items = useMemo(
    () => (history.data?.pages ?? []).flatMap((page) => page.items),
    [history.data],
  );

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={history.isRefetching && !history.isFetchingNextPage}
          onRefresh={() => void history.refetch()}
          tintColor={theme.colors.brand}
        />
      }
    >
      <ScreenHeader title={t('history.title')} large />

      <TextField
        value={search}
        onChangeText={setSearch}
        placeholder={t('history.search_placeholder')}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      <View style={styles.filters}>
        <Chip label={t('history.all')} selected={!savedOnly} onPress={() => setSavedOnly(false)} />
        <Chip
          label={t('history.saved_only')}
          selected={savedOnly}
          onPress={() => setSavedOnly(true)}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}
      >
        <Chip
          label={t('history.all')}
          selected={category === null}
          onPress={() => setCategory(null)}
        />
        {CATEGORIES.map((value) => (
          <Chip
            key={value}
            label={t(`category.${value}`)}
            selected={category === value}
            onPress={() => setCategory(category === value ? null : value)}
          />
        ))}
      </ScrollView>

      {history.isLoading ? (
        <LoadingView message={t('common.loading')} />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="time-outline"
          title={t('history.empty_title')}
          body={t('history.empty_body')}
          actionLabel={t('home.new_diagnosis')}
          onAction={() => router.push('/diagnose')}
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/diagnosis/[id]', params: { id: item.id } })}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radii.md,
                  flexDirection: isRTL ? 'row-reverse' : 'row',
                  opacity: pressed ? 0.78 : 1,
                },
              ]}
            >
              {item.thumbnailUri ? (
                <Image source={{ uri: item.thumbnailUri }} style={styles.thumb} />
              ) : (
                <View
                  style={[
                    styles.thumb,
                    styles.thumbFallback,
                    { backgroundColor: theme.colors.surfaceAlt },
                  ]}
                >
                  <Ionicons name="image-outline" size={20} color={theme.colors.textMuted} />
                </View>
              )}
              <View style={[styles.flex, { alignItems: isRTL ? 'flex-end' : 'flex-start' }]}>
                <AppText variant="label" numberOfLines={1}>
                  {item.identifiedType || truncate(item.description, 70)}
                </AppText>
                <AppText variant="caption" color={theme.colors.textMuted} numberOfLines={2}>
                  {truncate(item.description, 120)}
                </AppText>
                <View style={[styles.meta, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
                  <Badge
                    label={t(`history.status_${item.status}`)}
                    tone={
                      item.status === 'completed'
                        ? 'success'
                        : item.status === 'failed'
                          ? 'danger'
                          : 'warning'
                    }
                  />
                  <AppText variant="caption" color={theme.colors.textMuted}>
                    {formatRelativeDate(item.createdAt, language)}
                  </AppText>
                  {item.isSaved ? (
                    <Ionicons name="bookmark" size={14} color={theme.colors.brand} />
                  ) : null}
                </View>
              </View>
              <Ionicons
                name={isRTL ? 'chevron-back' : 'chevron-forward'}
                size={18}
                color={theme.colors.textMuted}
              />
            </Pressable>
          ))}

          {history.hasNextPage ? (
            <Button
              label={history.isFetchingNextPage ? t('common.loading') : t('history.load_more')}
              variant="secondary"
              onPress={() => void history.fetchNextPage()}
              loading={history.isFetchingNextPage}
            />
          ) : (
            <AppText variant="caption" color={theme.colors.textMuted} align="center">
              {t('history.no_more')}
            </AppText>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  categoryRow: { gap: 8, paddingVertical: 2 },
  list: { gap: 8 },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    gap: 12,
    alignItems: 'center',
  },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 3 },
  meta: { alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { I18nManager } from 'react-native';
import { en, type TranslationKey } from './en';
import { fr } from './fr';
import { ar } from './ar';
import { usePreferencesStore, type Language } from '@/stores/preferences';

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, fr, ar };

export type TranslateParams = Record<string, string | number>;

export function translate(
  language: Language,
  key: TranslationKey | string,
  params?: TranslateParams,
): string {
  const dictionary = dictionaries[language] ?? en;
  const fallback = en as Record<string, string>;
  let value = dictionary[key as TranslationKey] ?? fallback[key] ?? key;
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, 'g'), String(replacement));
    }
  }
  return value;
}

export function localeForLanguage(language: Language): string {
  switch (language) {
    case 'fr':
      return 'fr-MA';
    case 'ar':
      return 'ar-MA';
    default:
      return 'en-GB';
  }
}

type I18nContextValue = {
  language: Language;
  isRTL: boolean;
  locale: string;
  t: (key: TranslationKey | string, params?: TranslateParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const language = usePreferencesStore((state) => state.language);
  const isRTL = language === 'ar';

  useEffect(() => {
    I18nManager.allowRTL(true);
  }, []);

  const t = useCallback(
    (key: TranslationKey | string, params?: TranslateParams) => translate(language, key, params),
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      isRTL,
      locale: localeForLanguage(language),
      t,
    }),
    [language, isRTL, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

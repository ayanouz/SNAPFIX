import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export const LANGUAGES = ['en', 'fr', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];

export const CURRENCIES = ['MAD', 'EUR', 'USD', 'GBP'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

type PreferencesState = {
  language: Language;
  currency: Currency;
  theme: ThemePreference;
  onboardingComplete: boolean;
  setLanguage: (language: Language) => void;
  setCurrency: (currency: Currency) => void;
  setTheme: (theme: ThemePreference) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      language: 'en',
      currency: 'MAD',
      theme: 'system',
      onboardingComplete: false,
      setLanguage: (language) => set({ language }),
      setCurrency: (currency) => set({ currency }),
      setTheme: (theme) => set({ theme }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      resetOnboarding: () => set({ onboardingComplete: false }),
    }),
    {
      name: 'snapfix.preferences.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        language: state.language,
        currency: state.currency,
        theme: state.theme,
        onboardingComplete: state.onboardingComplete,
      }),
    },
  ),
);

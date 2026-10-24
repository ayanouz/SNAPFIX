import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { buildTheme, type AppTheme, type ThemeMode } from '@/theme';
import { usePreferencesStore, type ThemePreference } from '@/stores/preferences';

type ThemeContextValue = {
  theme: AppTheme;
  mode: ThemeMode;
  preference: ThemePreference;
  setTheme: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const preference = usePreferencesStore((state) => state.theme);
  const setTheme = usePreferencesStore((state) => state.setTheme);

  const mode: ThemeMode =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const theme = useMemo(() => buildTheme(mode), [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, preference, setTheme }),
    [theme, mode, preference, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside AppThemeProvider');
  return value;
}

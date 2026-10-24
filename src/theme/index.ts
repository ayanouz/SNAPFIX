export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export type ColorTokens = {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceRaised: string;
  text: string;
  textMuted: string;
  textInverse: string;
  border: string;
  borderStrong: string;
  brand: string;
  brandPressed: string;
  onBrand: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  critical: string;
  criticalSoft: string;
  info: string;
  infoSoft: string;
  overlay: string;
  shadow: string;
};

export const lightColors: ColorTokens = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF1F7',
  surfaceRaised: '#FFFFFF',
  text: '#0B1220',
  textMuted: '#5C6778',
  textInverse: '#FFFFFF',
  border: '#DCE2EB',
  borderStrong: '#B9C3D2',
  brand: '#E85D2A',
  brandPressed: '#C94A1C',
  onBrand: '#FFFFFF',
  success: '#1B7F55',
  successSoft: '#E4F4EC',
  warning: '#8A5A00',
  warningSoft: '#FFF4D6',
  danger: '#B3261E',
  dangerSoft: '#FDECEA',
  critical: '#7A1010',
  criticalSoft: '#FBE3E3',
  info: '#1D4ED8',
  infoSoft: '#E7EEFF',
  overlay: 'rgba(11, 18, 32, 0.55)',
  shadow: '#0B1220',
};

export const darkColors: ColorTokens = {
  background: '#080E1A',
  surface: '#101A2B',
  surfaceAlt: '#18253B',
  surfaceRaised: '#152137',
  text: '#F3F6FB',
  textMuted: '#A0AEC3',
  textInverse: '#0B1220',
  border: '#26354D',
  borderStrong: '#3B4E6B',
  brand: '#FF7A4D',
  brandPressed: '#E85D2A',
  onBrand: '#1A0D07',
  success: '#4FD1A0',
  successSoft: '#123A2D',
  warning: '#F4C15D',
  warningSoft: '#3A2D10',
  danger: '#FF8A80',
  dangerSoft: '#3D1A1A',
  critical: '#FFB4AB',
  criticalSoft: '#4A1515',
  info: '#8AB4FF',
  infoSoft: '#17264A',
  overlay: 'rgba(0, 0, 0, 0.65)',
  shadow: '#000000',
};

export type ThemeMode = 'light' | 'dark';

export type AppTheme = {
  mode: ThemeMode;
  colors: ColorTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: {
    display: number;
    title: number;
    subtitle: number;
    body: number;
    caption: number;
    label: number;
  };
  shadow: {
    card: {
      shadowColor: string;
      shadowOffset: { width: number; height: number };
      shadowOpacity: number;
      shadowRadius: number;
      elevation: number;
    };
  };
};

export function buildTheme(mode: ThemeMode): AppTheme {
  return {
    mode,
    colors: mode === 'dark' ? darkColors : lightColors,
    spacing,
    radii,
    typography: {
      display: 30,
      title: 23,
      subtitle: 18,
      body: 15,
      caption: 12,
      label: 13,
    },
    shadow: {
      card: {
        shadowColor: mode === 'dark' ? '#000000' : '#0B1220',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: mode === 'dark' ? 0.35 : 0.07,
        shadowRadius: 14,
        elevation: 3,
      },
    },
  };
}

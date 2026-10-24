import Constants from 'expo-constants';

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
const demoFlag = (process.env.EXPO_PUBLIC_ENABLE_DEMO_MODE ?? '').trim().toLowerCase();

export const appConfig = {
  supabaseUrl,
  supabaseAnonKey,
  isSupabaseConfigured: supabaseUrl.length > 0 && supabaseAnonKey.length > 0,
  demoMode: !(supabaseUrl && supabaseAnonKey) || demoFlag !== 'false',
  supportEmail: (process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@snapfix.app').trim(),
  environment: process.env.EXPO_PUBLIC_ENVIRONMENT ?? 'development',
  version: Constants.expoConfig?.version ?? '1.0.0',
  build:
    Constants.expoConfig?.ios?.buildNumber ??
    String(Constants.expoConfig?.android?.versionCode ?? '1'),
  appName: Constants.expoConfig?.name ?? 'SNAPFIX',
} as const;

export function isLiveMode(): boolean {
  return appConfig.isSupabaseConfigured && !appConfig.demoMode;
}

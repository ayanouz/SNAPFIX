import * as Linking from 'expo-linking';
import type { Session, User } from '@supabase/supabase-js';
import { AppError, normalizeError } from '@/domain/errors';
import { requireSupabaseClient, getSupabaseClient } from '@/services/supabase/client';
import type { AuthService, AuthSession } from '@/services/repositories/types';

function sessionFromSupabase(session: Session, profileName?: string | null): AuthSession {
  const user = session.user;
  const displayName =
    profileName?.trim() ||
    (typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name
      : user.email?.split('@')[0] || 'SNAPFIX user');
  return {
    user: {
      id: user.id,
      email: user.email ?? '',
      displayName,
      isDemo: false,
    },
    expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
  };
}

async function profileDisplayName(user: User): Promise<string | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return null;
  return data?.display_name ?? null;
}

export function createSupabaseAuthService(): AuthService {
  const listeners = new Set<(session: AuthSession | null) => void>();
  let unsubscribe: (() => void) | null = null;

  function ensureSubscription() {
    if (unsubscribe) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        listeners.forEach((listener) => listener(null));
        return;
      }
      void profileDisplayName(session.user).then((name) => {
        listeners.forEach((listener) => listener(sessionFromSupabase(session, name)));
      });
    });
    unsubscribe = () => data.subscription.unsubscribe();
  }

  async function getSession(): Promise<AuthSession | null> {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw normalizeError(error);
    if (!data.session) return null;
    const name = await profileDisplayName(data.session.user);
    return sessionFromSupabase(data.session, name);
  }

  return {
    mode: 'live',

    getSession,

    async signIn(email: string, password: string): Promise<AuthSession> {
      const supabase = requireSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw normalizeError(error);
      if (!data.session) throw new AppError('unauthorized', 'Sign in did not return a session');
      const name = await profileDisplayName(data.session.user);
      return sessionFromSupabase(data.session, name);
    },

    async signUp(input: {
      email: string;
      password: string;
      displayName: string;
    }): Promise<{ session: AuthSession | null; needsEmailConfirmation: boolean }> {
      const supabase = requireSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          data: { display_name: input.displayName.trim() },
          emailRedirectTo: Linking.createURL('/'),
        },
      });
      if (error) throw normalizeError(error);
      if (!data.session) {
        return { session: null, needsEmailConfirmation: true };
      }
      return {
        session: sessionFromSupabase(data.session, input.displayName),
        needsEmailConfirmation: false,
      };
    },

    async signInDemo(): Promise<AuthSession> {
      throw new AppError('invalid_input', 'Demo sign-in is not available in live mode');
    },

    async signOut(): Promise<void> {
      const supabase = requireSupabaseClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw normalizeError(error);
      listeners.forEach((listener) => listener(null));
    },

    async requestPasswordReset(email: string): Promise<void> {
      const supabase = requireSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: Linking.createURL('/reset-password'),
      });
      if (error) throw normalizeError(error);
    },

    async updatePassword(password: string): Promise<void> {
      const supabase = requireSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw normalizeError(error);
    },

    async completePasswordRecovery(url: string): Promise<void> {
      const supabase = requireSupabaseClient();
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new AppError('invalid_input', 'This recovery link is invalid');
      }

      const code = parsed.searchParams.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw normalizeError(error);
        return;
      }

      const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw normalizeError(error);
        return;
      }
      throw new AppError('invalid_input', 'The recovery link has expired or is incomplete');
    },

    async deleteAccount(): Promise<void> {
      const supabase = requireSupabaseClient();
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirm: true },
      });
      if (error) throw normalizeError(error);
      if (data?.error) throw new AppError('unknown', String(data.error));
      await supabase.auth.signOut();
      listeners.forEach((listener) => listener(null));
    },

    onAuthStateChange(callback: (session: AuthSession | null) => void): () => void {
      ensureSubscription();
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
        if (listeners.size === 0 && unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      };
    },
  };
}

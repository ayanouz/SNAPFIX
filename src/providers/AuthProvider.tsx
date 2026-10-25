import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { normalizeError, type AppError } from '@/domain/errors';
import { isLiveMode } from '@/constants/config';
import { createDemoAuthService } from '@/services/auth/demoAuth';
import { createSupabaseAuthService } from '@/services/auth/supabaseAuth';
import { createRepositoryForUser } from '@/services/repositories';
import { clearLocalUserState } from '@/services/localState';
import { clearUserImages } from '@/services/storage/imageService';
import type { AuthService, AuthSession, DataRepository } from '@/services/repositories/types';

const authService: AuthService = isLiveMode()
  ? createSupabaseAuthService()
  : createDemoAuthService();

type AuthContextValue = {
  session: AuthSession | null;
  repository: DataRepository | null;
  loading: boolean;
  error: AppError | null;
  signIn: (email: string, password: string) => Promise<AuthSession>;
  signUp: (input: {
    email: string;
    password: string;
    displayName: string;
  }) => Promise<{ session: AuthSession | null; needsEmailConfirmation: boolean }>;
  signInDemo: () => Promise<AuthSession>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  completePasswordRecovery: (url: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = authService.onAuthStateChange((next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);
    });

    authService
      .getSession()
      .then((next) => {
        if (active) setSession(next);
      })
      .catch((cause) => {
        if (active) setError(normalizeError(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const repository = useMemo<DataRepository | null>(
    () => (session ? createRepositoryForUser(session.user) : null),
    [session],
  );

  const previousUserId = useRef<string | null>(null);
  useEffect(() => {
    if (session?.user.id) {
      previousUserId.current = session.user.id;
      return;
    }
    if (previousUserId.current) {
      previousUserId.current = null;
      void clearLocalUserState();
    }
  }, [session?.user.id]);

  const refreshSession = useCallback(async () => {
    try {
      const next = await authService.getSession();
      setSession(next);
    } catch (cause) {
      setError(normalizeError(cause));
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    const next = await authService.signIn(email, password);
    setSession(next);
    return next;
  }, []);

  const signUp = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      setError(null);
      const result = await authService.signUp(input);
      if (result.session) setSession(result.session);
      return result;
    },
    [],
  );

  const signInDemo = useCallback(async () => {
    setError(null);
    const next = await authService.signInDemo();
    setSession(next);
    return next;
  }, []);

  const signOut = useCallback(async () => {
    const userId = session?.user.id ?? null;
    const mode = repository?.mode;
    await authService.signOut();
    await clearLocalUserState();
    // Demo data is local-only, so its photos must survive sign-out. Live data
    // can be re-fetched from cloud storage, so local copies are removed.
    if (mode === 'live' && userId) clearUserImages(userId);
    setSession(null);
    queryClient.clear();
  }, [queryClient, repository?.mode, session?.user.id]);

  const requestPasswordReset = useCallback(async (email: string) => {
    setError(null);
    await authService.requestPasswordReset(email);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    setError(null);
    await authService.updatePassword(password);
  }, []);

  const completePasswordRecovery = useCallback(async (url: string) => {
    setError(null);
    await authService.completePasswordRecovery(url);
  }, []);

  const deleteAccount = useCallback(async () => {
    const userId = session?.user.id ?? null;
    if (repository?.mode === 'demo') {
      await repository.deleteAllData();
    }
    await authService.deleteAccount();
    await clearLocalUserState();
    if (userId) clearUserImages(userId);
    setSession(null);
    queryClient.clear();
  }, [queryClient, repository, session?.user.id]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      repository,
      loading,
      error,
      signIn,
      signUp,
      signInDemo,
      signOut,
      requestPasswordReset,
      updatePassword,
      completePasswordRecovery,
      deleteAccount,
      refreshSession,
      clearError,
    }),
    [
      session,
      repository,
      loading,
      error,
      signIn,
      signUp,
      signInDemo,
      signOut,
      requestPasswordReset,
      updatePassword,
      completePasswordRecovery,
      deleteAccount,
      refreshSession,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

export function useRepository(): DataRepository {
  const { repository } = useAuth();
  if (!repository) throw new Error('A signed-in session is required');
  return repository;
}

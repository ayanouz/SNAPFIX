import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AppError } from '@/domain/errors';
import { createId } from '@/utils/ids';
import type { AuthService, AuthSession } from '@/services/repositories/types';
import type { KeyValueStore } from '@/services/repositories/demoRepository';

/**
 * Local demo authentication. It exists so the complete product can be tested
 * without a backend. It is NOT a substitute for Supabase Auth: credentials are
 * hashed locally but there is no server trust boundary and no cross-device
 * session. The UI labels this mode explicitly.
 */

type DemoAccount = {
  id: string;
  email: string;
  displayName: string;
  salt: string;
  passwordHash: string | null;
  createdAt: string;
};

type DemoSessionRecord = {
  userId: string;
  expiresAt: string;
};

type DemoAuthOptions = {
  store?: KeyValueStore;
  now?: () => Date;
};

const ACCOUNTS_KEY = 'snapfix.demo.v1.accounts';
const SESSION_KEY = 'snapfix.demo.v1.session';
const DEMO_EMAIL = 'demo@snapfix.local';

async function hashPassword(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `snapfix-demo:${salt}:${password}`,
  );
}

export function createDemoAuthService(options: DemoAuthOptions = {}): AuthService {
  const store = options.store ?? AsyncStorage;
  const now = options.now ?? (() => new Date());
  const listeners = new Set<(session: AuthSession | null) => void>();

  async function readAccounts(): Promise<DemoAccount[]> {
    const raw = await store.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as DemoAccount[]) : [];
    } catch {
      throw new AppError('unknown', 'Demo account data could not be read');
    }
  }

  async function writeAccounts(accounts: DemoAccount[]): Promise<void> {
    await store.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  async function writeSession(account: DemoAccount): Promise<AuthSession> {
    const expiresAt = new Date(now().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const sessionRecord: DemoSessionRecord = { userId: account.id, expiresAt };
    await store.setItem(SESSION_KEY, JSON.stringify(sessionRecord));
    const session: AuthSession = {
      user: {
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        isDemo: true,
      },
      expiresAt,
    };
    listeners.forEach((listener) => listener(session));
    return session;
  }

  async function currentAccount(): Promise<DemoAccount | null> {
    const raw = await store.getItem(SESSION_KEY);
    if (!raw) return null;
    let sessionRecord: DemoSessionRecord;
    try {
      sessionRecord = JSON.parse(raw) as DemoSessionRecord;
    } catch {
      await store.removeItem(SESSION_KEY);
      return null;
    }
    if (
      !sessionRecord.expiresAt ||
      new Date(sessionRecord.expiresAt).getTime() <= now().getTime()
    ) {
      await store.removeItem(SESSION_KEY);
      return null;
    }
    const accounts = await readAccounts();
    const account = accounts.find((entry) => entry.id === sessionRecord.userId) ?? null;
    if (!account) {
      await store.removeItem(SESSION_KEY);
      return null;
    }
    return account;
  }

  return {
    mode: 'demo',

    async getSession(): Promise<AuthSession | null> {
      const account = await currentAccount();
      if (!account) return null;
      const raw = await store.getItem(SESSION_KEY);
      const record = raw ? (JSON.parse(raw) as DemoSessionRecord) : null;
      return {
        user: {
          id: account.id,
          email: account.email,
          displayName: account.displayName,
          isDemo: true,
        },
        expiresAt: record?.expiresAt ?? null,
      };
    },

    async signIn(email: string, password: string): Promise<AuthSession> {
      const normalizedEmail = email.trim().toLowerCase();
      const accounts = await readAccounts();
      const account = accounts.find((entry) => entry.email === normalizedEmail);
      if (!account || !account.passwordHash) {
        throw new AppError('unauthorized', 'Email or password is incorrect');
      }
      const hash = await hashPassword(password, account.salt);
      if (hash !== account.passwordHash) {
        throw new AppError('unauthorized', 'Email or password is incorrect');
      }
      return writeSession(account);
    },

    async signUp(input: {
      email: string;
      password: string;
      displayName: string;
    }): Promise<{ session: AuthSession | null; needsEmailConfirmation: boolean }> {
      const normalizedEmail = input.email.trim().toLowerCase();
      const accounts = await readAccounts();
      if (accounts.some((entry) => entry.email === normalizedEmail)) {
        throw new AppError('conflict', 'An account already exists for this email');
      }
      const salt = createId();
      const account: DemoAccount = {
        id: createId(),
        email: normalizedEmail,
        displayName: input.displayName.trim(),
        salt,
        passwordHash: await hashPassword(input.password, salt),
        createdAt: now().toISOString(),
      };
      await writeAccounts([...accounts, account]);
      return { session: await writeSession(account), needsEmailConfirmation: false };
    },

    async signInDemo(): Promise<AuthSession> {
      const accounts = await readAccounts();
      let account = accounts.find((entry) => entry.email === DEMO_EMAIL);
      if (!account) {
        account = {
          id: 'demo-user',
          email: DEMO_EMAIL,
          displayName: 'Demo explorer',
          salt: '',
          passwordHash: null,
          createdAt: now().toISOString(),
        };
        await writeAccounts([...accounts, account]);
      }
      return writeSession(account);
    },

    async signOut(): Promise<void> {
      await store.removeItem(SESSION_KEY);
      listeners.forEach((listener) => listener(null));
    },

    async requestPasswordReset(): Promise<void> {
      throw new AppError(
        'invalid_input',
        'Password reset is not available in demo mode. Create a local account or configure Supabase.',
      );
    },

    async updatePassword(password: string): Promise<void> {
      const account = await currentAccount();
      if (!account) throw new AppError('unauthorized', 'Sign in first');
      const accounts = await readAccounts();
      const salt = createId();
      const updated: DemoAccount = {
        ...account,
        salt,
        passwordHash: await hashPassword(password, salt),
      };
      await writeAccounts(accounts.map((entry) => (entry.id === account.id ? updated : entry)));
    },

    async completePasswordRecovery(): Promise<void> {
      throw new AppError('invalid_input', 'Password recovery is not available in demo mode');
    },

    async deleteAccount(): Promise<void> {
      const account = await currentAccount();
      if (!account) return;
      const accounts = await readAccounts();
      await writeAccounts(accounts.filter((entry) => entry.id !== account.id));
      await store.removeItem(SESSION_KEY);
      listeners.forEach((listener) => listener(null));
    },

    onAuthStateChange(callback: (session: AuthSession | null) => void): () => void {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
}

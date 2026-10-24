import { isLiveMode } from '@/constants/config';
import type { AuthUser, DataRepository } from './types';
import { createDemoRepository } from './demoRepository';
import { createSupabaseRepository } from './supabaseRepository';

export function createRepositoryForUser(user: AuthUser): DataRepository {
  if (isLiveMode() && !user.isDemo) {
    return createSupabaseRepository({
      userId: user.id,
      email: user.email,
      displayName: user.displayName,
    });
  }
  return createDemoRepository({
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
  });
}

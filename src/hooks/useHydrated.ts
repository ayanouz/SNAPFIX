import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePreferencesStore } from '@/stores/preferences';
import { useDiagnosisDraft } from '@/stores/diagnosisDraft';

// Zustand does not mark a store as hydrated when reading persisted storage
// throws. Without a fallback the app would stay on the splash screen forever,
// so render with defaults after a short grace period instead.
const HYDRATION_TIMEOUT_MS = 3000;

function usePersistedStoreHydrated(store: {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: () => void) => () => void;
  };
}): boolean {
  const hydrated = useSyncExternalStore(
    (onStoreChange) => store.persist.onFinishHydration(onStoreChange),
    () => store.persist.hasHydrated(),
    () => false,
  );
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    const timer = setTimeout(() => setTimedOut(true), HYDRATION_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [hydrated]);

  return hydrated || timedOut;
}

export function usePreferencesHydrated(): boolean {
  return usePersistedStoreHydrated(usePreferencesStore);
}

export function useDiagnosisDraftHydrated(): boolean {
  return usePersistedStoreHydrated(useDiagnosisDraft);
}

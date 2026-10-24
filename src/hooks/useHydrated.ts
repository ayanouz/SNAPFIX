import { useEffect, useState } from 'react';
import { usePreferencesStore } from '@/stores/preferences';

export function usePreferencesHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => usePreferencesStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    const unsubscribe = usePreferencesStore.persist.onFinishHydration(() => setHydrated(true));
    return unsubscribe;
  }, [hydrated]);

  return hydrated;
}

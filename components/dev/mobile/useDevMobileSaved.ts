import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'swingsphere:dev-mobile:saved-listings';

const readSavedIds = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export const useDevMobileSaved = () => {
  const [savedIds, setSavedIds] = useState<string[]>(readSavedIds);

  useEffect(() => {
    const onStorage = () => setSavedIds(readSavedIds());
    window.addEventListener('storage', onStorage);
    window.addEventListener('swingsphere:dev-mobile-saved', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('swingsphere:dev-mobile-saved', onStorage);
    };
  }, []);

  const toggleSaved = useCallback((listingId: string) => {
    setSavedIds((current) => {
      const next = current.includes(listingId)
        ? current.filter((id) => id !== listingId)
        : [...current, listingId];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('swingsphere:dev-mobile-saved'));
      return next;
    });
  }, []);

  return {
    savedIds,
    isSaved: (listingId: string) => savedIds.includes(listingId),
    toggleSaved,
  };
};


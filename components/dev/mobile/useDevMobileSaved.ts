import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listSavedEntities, removeSavedEntity, saveEntity } from '../../../lib/profile/profileService';
import type { SavedEntity, SavedEntityType } from '../../../lib/profile/profileTypes';
import { useAppStore } from '../../../store/appStore';
import { useDeviceExperience } from '../../device/DeviceExperienceContext';

const MOBILE_SAVED_CHANGED_EVENT = 'swingsphere:mobile-saved-changed';

export const useDevMobileSaved = () => {
  const navigate = useNavigate();
  const { toPath } = useDeviceExperience();
  const { currentUser, isAuthLoading, addToast } = useAppStore();
  const [savedEntities, setSavedEntities] = useState<SavedEntity[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(currentUser));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!currentUser) {
      setSavedEntities([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    try {
      const saved = await listSavedEntities(currentUser.id);
      setSavedEntities(saved);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your saved places.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onSavedChanged = () => void refresh();
    window.addEventListener(MOBILE_SAVED_CHANGED_EVENT, onSavedChanged);
    return () => window.removeEventListener(MOBILE_SAVED_CHANGED_EVENT, onSavedChanged);
  }, [refresh]);

  const savedIds = useMemo(() => savedEntities.map((item) => item.entityId), [savedEntities]);

  const toggleSaved = useCallback(async (listingId: string, entityType: Extract<SavedEntityType, 'club' | 'event'>) => {
    if (isAuthLoading) return;
    if (!currentUser) {
      navigate(`${toPath('/account')}?intent=save`);
      return;
    }

    const existing = savedEntities.find((item) => item.entityId === listingId && item.entityType === entityType);
    try {
      if (existing) {
        await removeSavedEntity(currentUser.id, existing.id);
        setSavedEntities((current) => current.filter((item) => item.id !== existing.id));
        addToast({ message: 'Removed from your private saved library.', type: 'success' });
      } else {
        const created = await saveEntity(currentUser.id, entityType, listingId);
        setSavedEntities((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        addToast({ message: 'Saved privately to your SwingSphere account.', type: 'success' });
      }
      window.dispatchEvent(new Event(MOBILE_SAVED_CHANGED_EVENT));
      setError(null);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to update your saved places.';
      setError(message);
      addToast({ message, type: 'error' });
    }
  }, [addToast, currentUser, isAuthLoading, navigate, savedEntities, toPath]);

  return {
    savedEntities,
    savedIds,
    isLoading: isLoading || isAuthLoading,
    error,
    isSaved: (listingId: string) => savedIds.includes(listingId),
    toggleSaved,
    refresh,
  };
};


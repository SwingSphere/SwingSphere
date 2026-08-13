import { useCallback, useEffect, useState } from 'react';
import { getProfilePrivacy, updateProfilePrivacy } from '../lib/profile/profileService';
import type { ProfilePrivacySettings, ProfileVisibility } from '../lib/profile/profileTypes';

export const useProfilePrivacy = (userId?: string) => {
  const [settings, setSettings] = useState<ProfilePrivacySettings | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(userId));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!userId) {
      setSettings(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      setSettings(await getProfilePrivacy(userId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load profile privacy settings.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (profileVisibility: ProfileVisibility) => {
    if (!userId) throw new Error('You must be signed in to update profile privacy.');
    setIsSaving(true);
    setError('');
    try {
      const updated = await updateProfilePrivacy(userId, profileVisibility);
      setSettings(updated);
      return updated;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to update profile privacy.';
      setError(message);
      throw saveError;
    } finally {
      setIsSaving(false);
    }
  }, [userId]);

  return { settings, isLoading, isSaving, error, reload, save };
};

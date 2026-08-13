import React, { useEffect, useState } from 'react';
import { Bookmark, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMemberHubDemoContent } from '../../hooks/useMemberHubDemoContent';
import {
  getSavedEntity,
  removeSavedEntity,
  saveEntity,
} from '../../lib/profile/profileService';
import type { SavedEntity, SavedEntityType } from '../../lib/profile/profileTypes';
import { useAppStore } from '../../store/appStore';

const SaveEntityButton: React.FC<{
  entityType: SavedEntityType;
  entityId: string;
  entityName?: string;
  entityLocation?: string;
  className?: string;
}> = ({ entityType, entityId, entityName, entityLocation, className = '' }) => {
  const navigate = useNavigate();
  const { currentUser, addToast } = useAppStore();
  const demo = useMemberHubDemoContent(currentUser);
  const [saved, setSaved] = useState<SavedEntity | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(currentUser));
  const [isSaving, setIsSaving] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);

  const demoSaved = demo.savedDiscoveries.find((item) => (
    item.entityType === entityType && item.entityId === entityId
  ));

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!currentUser) {
        setSaved(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const result = await getSavedEntity(currentUser.id, entityType, entityId);
        if (!cancelled) {
          setSaved(result);
          setBackendAvailable(true);
        }
      } catch {
        if (!cancelled) {
          setSaved(null);
          setBackendAvailable(false);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [currentUser, entityId, entityType]);

  const toggle = async () => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    setIsSaving(true);
    try {
      if (saved) {
        await removeSavedEntity(currentUser.id, saved.id);
        setSaved(null);
        if (demoSaved) demo.deleteSavedDiscovery(demoSaved.id);
        addToast({ message: 'Removed from your private saved library.', type: 'success' });
        return;
      }

      if (demoSaved) {
        demo.deleteSavedDiscovery(demoSaved.id);
        addToast({ message: 'Removed from your private saved library.', type: 'success' });
        return;
      }

      if (backendAvailable !== false) {
        try {
          const created = await saveEntity(currentUser.id, entityType, entityId);
          setSaved(created);
          setBackendAvailable(true);
          addToast({ message: 'Saved privately.', type: 'success' });
          return;
        } catch (error) {
          setBackendAvailable(false);
          if (!demo.isEligible || !demo.isEnabled) throw error;
        }
      }

      if (demo.isEligible && demo.isEnabled) {
        demo.addSavedDiscovery({
          entityType,
          entityId,
          targetName: entityName,
          location: entityLocation,
        });
        addToast({ message: 'Saved privately in this demo.', type: 'success' });
        return;
      }

      throw new Error('Unable to update save status.');
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to update saved status.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const active = Boolean(saved || demoSaved);
  const displayLoading = isLoading && !demoSaved;

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={displayLoading || isSaving}
      aria-pressed={active}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-65 ${
        active
          ? 'border-amber-300/40 bg-amber-400/12 text-amber-100 shadow-[0_0_20px_rgba(251,191,36,.08)]'
          : 'border-white/10 bg-white/[0.035] text-gray-200 hover:border-amber-300/35 hover:text-white'
      } ${className}`}
    >
      {displayLoading || isSaving
        ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        : <Bookmark size={16} className={active ? 'fill-current' : ''} aria-hidden="true" />}
      {active ? 'Saved' : 'Save'}
    </button>
  );
};

export default SaveEntityButton;

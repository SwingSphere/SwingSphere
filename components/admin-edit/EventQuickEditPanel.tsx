import React, { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { EventData } from '../../types';
import type { MediaAsset, MediaRole } from '../../lib/media/types';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';
import MediaUploader from '../media/MediaUploader';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';
import { useAdminEditMode } from './AdminEditModeContext';

export type EventQuickEditField = 'title' | 'description' | 'logo' | 'hero' | 'flyer' | 'gallery';

type Props = {
  event: EventData;
  field: EventQuickEditField | null;
  onClose: () => void;
  onPreview: (event: EventData) => void;
  onSaved: (event: EventData) => void;
};

const fieldLabels: Record<EventQuickEditField, string> = {
  title: 'Event title',
  description: 'Event description',
  logo: 'Event logo',
  hero: 'Hero image',
  flyer: 'Event flyer',
  gallery: 'Gallery image',
};

const EventQuickEditPanel: React.FC<Props> = ({ event, field, onClose, onPreview, onSaved }) => {
  const [draft, setDraft] = useState<EventData>(event);
  const [saving, setSaving] = useState(false);
  const { addToast } = useAppStore();
  const { markSaved, markUnsaved } = useAdminEditMode();

  const existingAsset = useMemo(() => {
    if (!field || field === 'title' || field === 'description' || field === 'gallery') return null;
    return draft.mediaAssets?.find((asset) => asset.role === field) ?? null;
  }, [draft.mediaAssets, field]);
  const mediaOwnerId = useMemo(
    () => draft.mediaAssets?.find((asset) => asset.owner_id)?.owner_id ?? getMediaOwnerId('event', draft.id),
    [draft.id, draft.mediaAssets],
  );

  if (!field) return null;

  const updateDraft = (next: EventData) => {
    setDraft(next);
    onPreview(next);
    markUnsaved();
  };

  const handleUploaded = (asset: MediaAsset) => {
    const role = asset.role;
    const currentAssets = draft.mediaAssets ?? [];
    const mediaAssets = role === 'gallery'
      ? [...currentAssets, asset]
      : [...currentAssets.filter((item) => item.role !== role), asset];
    updateDraft({ ...draft, mediaAssets });
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveEvent(draft);
      markSaved();
      onSaved(saved);
      addToast({ message: `${fieldLabels[field]} updated.`, type: 'success' });
      onClose();
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to save this event change.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const mediaRole: MediaRole | null = field === 'logo' || field === 'hero' || field === 'flyer' || field === 'gallery' ? field : null;

  return (
    <aside className="fixed bottom-24 right-4 z-[1500] w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/15 bg-[#111217]/98 p-4 text-white shadow-2xl shadow-black/60 backdrop-blur-xl" aria-label={`Quick edit ${fieldLabels[field]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-300">Quick edit</p>
          <h2 className="mt-1 text-lg font-black">{fieldLabels[field]}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Close quick editor"><X size={18} /></button>
      </div>

      <div className="mt-4">
        {field === 'title' ? (
          <input
            autoFocus
            value={draft.name}
            onChange={(event) => updateDraft({ ...draft, name: event.target.value })}
            className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-3 text-white outline-none focus:border-red-300/60"
          />
        ) : null}

        {field === 'description' ? (
          <textarea
            autoFocus
            rows={10}
            value={draft.description_full}
            onChange={(event) => updateDraft({ ...draft, description_full: event.target.value })}
            className="w-full resize-y rounded-xl border border-white/15 bg-black/35 px-3 py-3 text-sm leading-6 text-white outline-none focus:border-red-300/60"
          />
        ) : null}

        {mediaRole ? (
          <MediaUploader
            ownerType="event"
            ownerId={mediaOwnerId}
            role={mediaRole}
            existingAsset={existingAsset}
            onUploaded={handleUploaded}
            label={`Upload ${fieldLabels[field].toLowerCase()}`}
            tone="dark"
            cropAspectRatioOverride={field === 'logo' ? 1 : undefined}
          />
        ) : null}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/10">Cancel</button>
        <button type="button" onClick={save} disabled={saving || !draft.name.trim()} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
          <Check size={16} />
          {saving ? 'Saving…' : 'Save change'}
        </button>
      </div>
    </aside>
  );
};

export default EventQuickEditPanel;

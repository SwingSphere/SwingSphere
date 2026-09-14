import React, { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { OrganizationData } from '../../types';
import type { MediaAsset, MediaRole } from '../../lib/media/types';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaRule } from '../../lib/media/mediaRules';
import MediaUploader from '../media/MediaUploader';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';
import { useAdminEditMode } from './AdminEditModeContext';

export type HostQuickEditField = 'profile' | 'logo' | 'hero';

type Props = {
  organization: OrganizationData;
  field: HostQuickEditField | null;
  onClose: () => void;
};

const labels: Record<HostQuickEditField, string> = {
  profile: 'Host profile',
  logo: 'Host logo',
  hero: 'Host hero image',
};

const HostQuickEditPanel: React.FC<Props> = ({ organization, field, onClose }) => {
  const [draft, setDraft] = useState<OrganizationData>(organization);
  const [saving, setSaving] = useState(false);
  const { addToast } = useAppStore();
  const { markSaved, markUnsaved } = useAdminEditMode();

  const mediaOwnerId = useMemo(
    () => draft.mediaAssets?.find((asset) => asset.owner_id)?.owner_id ?? getMediaOwnerId('organization', draft.id),
    [draft.id, draft.mediaAssets],
  );

  const existingAsset = useMemo(() => {
    if (!field || field === 'profile') return null;
    return draft.mediaAssets?.find((asset) => asset.role === field) ?? null;
  }, [draft.mediaAssets, field]);

  if (!field) return null;

  const updateDraft = (next: OrganizationData) => {
    setDraft(next);
    markUnsaved();
  };

  const handleUploaded = (asset: MediaAsset) => {
    const url = getCloudflareImageUrl({ externalId: asset.external_id, variant: getMediaRule(asset.role).defaultVariant });
    const mediaAssets = [
      ...(draft.mediaAssets ?? []).filter((item) => item.role !== asset.role),
      asset,
    ];
    updateDraft({
      ...draft,
      mediaAssets,
      ...(asset.role === 'logo' ? { logoImageUrl: url } : {}),
      ...(asset.role === 'hero' ? { headerImageUrl: url } : {}),
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await api.saveOrganization(draft);
      markSaved();
      addToast({ message: `${labels[field]} updated.`, type: 'success' });
      onClose();
      window.setTimeout(() => window.location.reload(), 150);
      return saved;
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to save host profile.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const mediaRole: MediaRole | null = field === 'logo' || field === 'hero' ? field : null;

  return (
    <aside className="fixed bottom-24 right-4 z-[1500] w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/15 bg-[#111217]/98 p-4 text-white shadow-2xl shadow-black/60 backdrop-blur-xl" aria-label={`Quick edit ${labels[field]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-300">Quick edit</p>
          <h2 className="mt-1 text-lg font-black">{labels[field]}</h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Close quick editor"><X size={18} /></button>
      </div>

      <div className="mt-4">
        {field === 'profile' ? (
          <div className="max-h-[58vh] space-y-4 overflow-y-auto pr-1">
            <label className="block text-xs font-semibold text-gray-400">Public name
              <input value={draft.name} onChange={(event) => updateDraft({ ...draft, name: event.target.value })} className="mt-1 block w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none focus:border-red-300/60" />
            </label>
            <label className="block text-xs font-semibold text-gray-400">Short description
              <textarea rows={4} value={draft.descriptionShort ?? ''} onChange={(event) => updateDraft({ ...draft, descriptionShort: event.target.value })} className="mt-1 block w-full resize-y rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-red-300/60" />
            </label>
            <label className="block text-xs font-semibold text-gray-400">Website
              <input type="url" value={draft.website ?? ''} onChange={(event) => updateDraft({ ...draft, website: event.target.value || undefined })} placeholder="https://example.com" className="mt-1 block w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none focus:border-red-300/60" />
            </label>
            <label className="block text-xs font-semibold text-gray-400">Contact email
              <input type="email" value={draft.contactEmail ?? ''} onChange={(event) => updateDraft({ ...draft, contactEmail: event.target.value || undefined })} className="mt-1 block w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none focus:border-red-300/60" />
            </label>
            <label className="block text-xs font-semibold text-gray-400">Instagram
              <input value={draft.instagram ?? ''} onChange={(event) => updateDraft({ ...draft, instagram: event.target.value || undefined })} placeholder="@handle or URL" className="mt-1 block w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none focus:border-red-300/60" />
            </label>
            <label className="block text-xs font-semibold text-gray-400">FetLife
              <input value={draft.fetlife ?? ''} onChange={(event) => updateDraft({ ...draft, fetlife: event.target.value || undefined })} placeholder="Profile or group URL" className="mt-1 block w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none focus:border-red-300/60" />
            </label>
          </div>
        ) : null}

        {mediaRole ? (
          <MediaUploader
            ownerType="organization"
            ownerId={mediaOwnerId}
            role={mediaRole}
            existingAsset={existingAsset}
            onUploaded={handleUploaded}
            label={`Upload ${labels[field].toLowerCase()}`}
            tone="dark"
            cropAspectRatioOverride={field === 'logo' ? 1 : undefined}
            managedEntityId={draft.id}
          />
        ) : null}
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-white/10">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={saving || !draft.name.trim()} className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
          <Check size={16} />
          {saving ? 'Saving…' : 'Save change'}
        </button>
      </div>
    </aside>
  );
};

export default HostQuickEditPanel;

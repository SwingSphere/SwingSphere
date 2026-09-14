import React, { useMemo, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import type { ClubData, SocialLink } from '../../types';
import type { MediaAsset, MediaRole } from '../../lib/media/types';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';
import MediaUploader from '../media/MediaUploader';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';
import { useAdminEditMode } from './AdminEditModeContext';
import { nameSlug } from '../../lib/identityUtils';
import { getClubSocialLinks, SOCIAL_NETWORK_OPTIONS, syncLegacySocialFields } from '../../lib/socialLinks';

export type ClubQuickEditField = 'title' | 'description' | 'schedule' | 'links' | 'logo' | 'hero' | 'gallery';

type Props = {
  club: ClubData;
  field: ClubQuickEditField | null;
  onClose: () => void;
  onPreview: (club: ClubData) => void;
  onSaved: (club: ClubData) => void;
};

const fieldLabels: Record<ClubQuickEditField, string> = {
  title: 'Club title',
  description: 'Club description',
  schedule: 'Club schedule',
  links: 'Website & social links',
  logo: 'Club logo',
  hero: 'Hero image',
  gallery: 'Gallery image',
};

const ClubQuickEditPanel: React.FC<Props> = ({ club, field, onClose, onPreview, onSaved }) => {
  const [draft, setDraft] = useState<ClubData>(club);
  const [saving, setSaving] = useState(false);
  const { addToast } = useAppStore();
  const { markSaved, markUnsaved } = useAdminEditMode();

  const existingAsset = useMemo(() => {
    if (!field || field === 'title' || field === 'description' || field === 'schedule' || field === 'links' || field === 'gallery') return null;
    return draft.mediaAssets?.find((asset) => asset.role === field) ?? null;
  }, [draft.mediaAssets, field]);

  const mediaOwnerId = useMemo(
    () => draft.mediaAssets?.find((asset) => asset.owner_id)?.owner_id ?? getMediaOwnerId('club', draft.id),
    [draft.id, draft.mediaAssets],
  );

  if (!field) return null;

  const updateDraft = (next: ClubData) => {
    setDraft(next);
    onPreview(next);
    markUnsaved();
  };

  const handleUploaded = (asset: MediaAsset) => {
    const currentAssets = draft.mediaAssets ?? [];
    const mediaAssets = asset.role === 'gallery'
      ? [...currentAssets, asset]
      : [...currentAssets.filter((item) => item.role !== asset.role), asset];
    updateDraft({ ...draft, mediaAssets });
  };

  const save = async () => {
    setSaving(true);
    try {
      const clubToSave = field === 'links'
        ? syncLegacySocialFields(draft, getClubSocialLinks(draft))
        : draft;
      const saved = await api.saveClub(clubToSave, { requirePersistence: true, requireExisting: true });
      markSaved();
      onSaved(saved);
      addToast({ message: `${fieldLabels[field]} updated.`, type: 'success' });
      onClose();

      if (field === 'title' && saved.name !== club.name) {
        const currentSegment = window.location.pathname.split('/').filter(Boolean).at(-1) ?? '';
        const keySuffix = currentSegment.includes('--')
          ? `--${currentSegment.split('--').slice(1).join('--')}`
          : '';
        const nextPath = `/clubs/${nameSlug(saved.name)}${keySuffix}`;
        window.history.replaceState(null, '', nextPath);
      }
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to save this club change.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const mediaRole: MediaRole | null = field === 'logo' || field === 'hero' || field === 'gallery' ? field : null;
  const socialLinks = getClubSocialLinks(draft, { includeEmpty: true });
  const updateSocialLinks = (links: SocialLink[]) => updateDraft(syncLegacySocialFields(draft, links));
  const updateScheduleDay = (index: number, patch: Partial<ClubData['schedule'][number]>) => {
    const schedule = [...draft.schedule];
    schedule[index] = { ...schedule[index], ...patch };
    updateDraft({ ...draft, schedule });
  };

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
            value={draft.description_short}
            onChange={(event) => updateDraft({ ...draft, description_short: event.target.value })}
            className="w-full resize-y rounded-xl border border-white/15 bg-black/35 px-3 py-3 text-sm leading-6 text-white outline-none focus:border-red-300/60"
          />
        ) : null}

        {field === 'schedule' ? (
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {draft.schedule.map((day, index) => {
              const isOpen = !day.isClosed;
              return (
                <div key={day.day} className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-white">{day.day}</span>
                    <button
                      type="button"
                      onClick={() => updateScheduleDay(index, { isClosed: isOpen, open: day.open ?? '21:00', close: day.close ?? '02:00' })}
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${isOpen ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/5 text-gray-400'}`}
                    >
                      {isOpen ? 'Open' : 'Closed'}
                    </button>
                  </div>
                  {isOpen ? (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="text-xs font-semibold text-gray-400">Open
                        <input type="time" value={day.open ?? ''} onChange={(event) => updateScheduleDay(index, { open: event.target.value })} className="mt-1 block w-full rounded-lg border border-white/10 bg-black/35 px-2 py-2 text-sm text-white" />
                      </label>
                      <label className="text-xs font-semibold text-gray-400">Close
                        <input type="time" value={day.close ?? ''} onChange={(event) => updateScheduleDay(index, { close: event.target.value })} className="mt-1 block w-full rounded-lg border border-white/10 bg-black/35 px-2 py-2 text-sm text-white" />
                      </label>
                    </div>
                  ) : null}
                </div>
              );
            })}
            <label className="block text-xs font-semibold text-gray-400">Schedule notes
              <textarea rows={3} value={draft.specialScheduleNotes ?? ''} onChange={(event) => updateDraft({ ...draft, specialScheduleNotes: event.target.value })} className="mt-1 block w-full resize-y rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white" placeholder="Theme nights, holiday changes, RSVP notes…" />
            </label>
          </div>
        ) : null}

        {field === 'links' ? (
          <div className="max-h-[58vh] space-y-4 overflow-y-auto pr-1">
            <label className="block text-xs font-semibold text-gray-400">Website
              <input
                type="url"
                value={draft.website ?? ''}
                onChange={(event) => updateDraft({ ...draft, website: event.target.value })}
                placeholder="https://example.com"
                className="mt-1 block w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-400">Contact email
              <input
                type="email"
                value={draft.contactEmail ?? ''}
                onChange={(event) => updateDraft({ ...draft, contactEmail: event.target.value })}
                placeholder="info@example.com"
                className="mt-1 block w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-sm text-white outline-none focus:border-red-300/60"
              />
            </label>

            <div className="border-t border-white/10 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-gray-200">Social media</div>
                  <div className="mt-0.5 text-[11px] leading-4 text-gray-500">Add as many profiles as you use. Handles work for common networks; full URLs are also accepted.</div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSocialLinks([...socialLinks, { network: 'instagram', value: '' }])}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-300/25 bg-red-400/[0.08] px-2.5 py-2 text-xs font-bold text-red-100 hover:bg-red-400/[0.12]"
                >
                  <Plus size={13} /> Add social
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {socialLinks.map((link, index) => {
                  const option = SOCIAL_NETWORK_OPTIONS.find((item) => item.value === link.network) ?? SOCIAL_NETWORK_OPTIONS[SOCIAL_NETWORK_OPTIONS.length - 1];
                  return (
                    <div key={`${link.network}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)_auto] gap-2">
                        <select
                          value={link.network}
                          onChange={(event) => {
                            const next = [...socialLinks];
                            next[index] = { ...link, network: event.target.value as SocialLink['network'] };
                            updateSocialLinks(next);
                          }}
                          className="min-w-0 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-xs font-semibold text-white outline-none focus:border-red-300/50"
                        >
                          {SOCIAL_NETWORK_OPTIONS.map((network) => <option key={network.value} value={network.value}>{network.label}</option>)}
                        </select>
                        <input
                          value={link.value}
                          onChange={(event) => {
                            const next = [...socialLinks];
                            next[index] = { ...link, value: event.target.value };
                            updateSocialLinks(next);
                          }}
                          placeholder={option.placeholder}
                          className="min-w-0 rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-red-300/50"
                        />
                        <button
                          type="button"
                          onClick={() => updateSocialLinks(socialLinks.filter((_, itemIndex) => itemIndex !== index))}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-red-400/10 hover:text-red-200"
                          aria-label={`Remove ${option.label}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {socialLinks.length === 0 ? <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-gray-600">No social profiles added yet.</p> : null}
              </div>
            </div>
          </div>
        ) : null}

        {mediaRole ? (
          <MediaUploader
            ownerType="club"
            ownerId={mediaOwnerId}
            role={mediaRole}
            existingAsset={existingAsset}
            onUploaded={handleUploaded}
            label={`Upload ${fieldLabels[field].toLowerCase()}`}
            tone="dark"
            cropAspectRatioOverride={field === 'logo' ? 1 : undefined}
            managedEntityId={draft.id}
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

export default ClubQuickEditPanel;

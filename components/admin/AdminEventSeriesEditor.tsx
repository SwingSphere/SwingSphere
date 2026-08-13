import React, { useMemo, useState } from 'react';
import type { EventData, EventSeriesData, OrganizationData, VenueData } from '../../types';
import type { MediaAsset, MediaRole } from '../../lib/media/types';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';
import { getMediaRule } from '../../lib/media/mediaRules';
import MediaUploader from '../media/MediaUploader';

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

type AdminEventSeriesEditorProps = {
  eventSeries: EventSeriesData;
  events: EventData[];
  organizations: OrganizationData[];
  venues: VenueData[];
  onSaved: (saved: EventSeriesData) => void;
  onEditOccurrence: (eventId: string) => void;
  onBack: () => void;
};

const AdminEventSeriesEditor: React.FC<AdminEventSeriesEditorProps> = ({
  eventSeries,
  events,
  organizations,
  venues,
  onSaved,
  onEditOccurrence,
  onBack,
}) => {
  const [draft, setDraft] = useState<EventSeriesData>(eventSeries);
  const [tagsText, setTagsText] = useState((eventSeries.defaultTags ?? []).join(', '));
  const [isSaving, setIsSaving] = useState(false);
  const { addToast } = useAppStore();

  const linkedOccurrences = useMemo(() => events
    .filter((event) => event.eventSeriesId === draft.id)
    .sort((a, b) => Date.parse(a.time.start) - Date.parse(b.time.start)), [draft.id, events]);

  const update = <K extends keyof EventSeriesData>(key: K, value: EventSeriesData[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const mediaOwnerId = draft.id ? getMediaOwnerId('event_series', draft.id) : '';
  const getAsset = (role: MediaRole) => draft.mediaAssets?.find((asset) => asset.role === role) ?? null;
  const handleAssetUploaded = (asset: MediaAsset) => {
    const variant = getMediaRule(asset.role).defaultVariant;
    const url = getCloudflareImageUrl({ externalId: asset.external_id, variant });
    setDraft((current) => {
      const existing = current.mediaAssets ?? [];
      const mediaAssets = asset.role === 'gallery'
        ? [...existing, asset]
        : [...existing.filter((item) => item.role !== asset.role), asset];
      return {
        ...current,
        mediaAssets,
        ...(asset.role === 'logo' ? { logoImageUrl: url } : {}),
        ...(asset.role === 'hero' ? { headerImageUrl: url } : {}),
      };
    });
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      addToast({ message: 'Series name is required.', type: 'error' });
      return;
    }
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const saved = await api.saveEventSeries({
        ...draft,
        id: draft.id || `series-${slugify(draft.name)}-${Date.now()}`,
        slug: draft.slug.trim() || slugify(draft.name),
        defaultTags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
        createdAt: draft.createdAt ?? now,
        updatedAt: now,
      });
      addToast({ message: 'Event series saved.', type: 'success' });
      onSaved(saved);
    } catch {
      addToast({ message: 'Failed to save event series.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button onClick={onBack} className="mb-3 text-sm font-semibold text-blue-600 hover:text-blue-800">← Back to events</button>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">Recurring event brand</p>
          <h1 className="mt-1 text-4xl font-bold text-gray-800">{draft.id ? `Edit ${draft.name}` : 'Add event series'}</h1>
          <p className="mt-2 text-sm text-gray-500">Shared identity, promoter relationship, logo, defaults, and usual venue live here. Dates and flyers stay on individual occurrences.</p>
        </div>
        <button onClick={handleSave} disabled={isSaving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{isSaving ? 'Saving…' : 'Save series'}</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800">Identity</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold text-gray-700">Series name</span><input value={draft.name} onChange={(event) => update('name', event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" placeholder="Her Fantasy" /></label>
              <label><span className="mb-1 block text-sm font-semibold text-gray-700">Slug</span><input value={draft.slug} onChange={(event) => update('slug', event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" placeholder="her-fantasy" /></label>
              <label><span className="mb-1 block text-sm font-semibold text-gray-700">Status</span><select value={draft.status} onChange={(event) => update('status', event.target.value as EventSeriesData['status'])} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"><option value="draft">Draft</option><option value="approved">Active / approved</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>
              <label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold text-gray-700">Short description</span><textarea value={draft.descriptionShort ?? ''} onChange={(event) => update('descriptionShort', event.target.value)} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" /></label>
              <label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold text-gray-700">Full description</span><textarea value={draft.descriptionFull ?? ''} onChange={(event) => update('descriptionFull', event.target.value)} rows={7} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" /></label>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800">Ownership and defaults</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label><span className="mb-1 block text-sm font-semibold text-gray-700">Promoter / organization</span><select value={draft.organizerOrganizationId ?? ''} onChange={(event) => update('organizerOrganizationId', event.target.value || undefined)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"><option value="">Not linked</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>
              <label><span className="mb-1 block text-sm font-semibold text-gray-700">Usual venue</span><select value={draft.defaultVenueId ?? ''} onChange={(event) => update('defaultVenueId', event.target.value || undefined)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"><option value="">Varies by occurrence</option>{venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label>
              <label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold text-gray-700">Default tags</span><input value={tagsText} onChange={(event) => setTagsText(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900" placeholder="Couples Welcome, Single Women Welcome" /><span className="mt-1 block text-xs text-gray-500">Comma-separated. Occurrences can override or add date-specific tags.</span></label>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800">Brand media</h2>
            <p className="mt-1 text-sm text-gray-500">Upload the reusable series identity here. The logo opens the square crop tool before upload.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <MediaUploader
                tone="light"
                ownerType="event_series"
                ownerId={mediaOwnerId}
                role="logo"
                cropAspectRatioOverride={1}
                existingAsset={getAsset('logo')}
                label="Upload or replace series logo"
                helperText="Square logo used across every occurrence in this series. You can crop and reposition the image before upload."
                onUploaded={handleAssetUploaded}
              />
              <MediaUploader
                tone="light"
                ownerType="event_series"
                ownerId={mediaOwnerId}
                role="hero"
                existingAsset={getAsset('hero')}
                label="Upload or replace default banner"
                helperText="Wide brand banner inherited by occurrences that do not provide their own banner."
                onUploaded={handleAssetUploaded}
              />
            </div>
            {!draft.id && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Save the new series once before uploading media so SwingSphere can create a permanent media owner.</p>}
            <p className="mt-3 text-xs text-gray-500">The series logo is inherited by every occurrence unless that occurrence has an explicit override. Flyers remain attached to each dated occurrence.</p>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-gray-800">Linked occurrences</h2>
            <div className="mt-3 text-3xl font-black text-gray-900">{linkedOccurrences.length}</div>
            <p className="mt-1 text-sm text-gray-500">Individual dates currently using this event series.</p>
            <div className="mt-4 space-y-2">
              {linkedOccurrences.slice(0, 8).map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onEditOccurrence(event.id)}
                  className="w-full rounded-lg border border-gray-200 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <div className="font-semibold text-gray-800">{event.occurrenceTitle || event.name}</div>
                  <div className="mt-1 text-xs text-gray-500">{new Date(event.time.start).toLocaleDateString('en-US')}</div>
                  <div className="mt-2 text-xs font-semibold text-blue-600">Open occurrence →</div>
                </button>
              ))}
              {!linkedOccurrences.length && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No dates linked yet.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default AdminEventSeriesEditor;

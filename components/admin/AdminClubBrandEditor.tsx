import React, { useMemo, useState } from 'react';
import type { ClubBrandData, ClubData, OrganizationData } from '../../types';
import type { MediaAsset, MediaRole } from '../../lib/media/types';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';
import { getMediaRule } from '../../lib/media/mediaRules';
import MediaUploader from '../media/MediaUploader';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';

const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

type Props = {
  brand: ClubBrandData;
  clubs: ClubData[];
  organizations: OrganizationData[];
  onSaved: (brand: ClubBrandData) => void;
  onOpenClub: (clubId: string) => void;
  onBack: () => void;
};

const AdminClubBrandEditor: React.FC<Props> = ({ brand, clubs, organizations, onSaved, onOpenClub, onBack }) => {
  const [draft, setDraft] = useState(brand);
  const [amenitiesText, setAmenitiesText] = useState((brand.defaultAmenities ?? []).join(', '));
  const [isSaving, setIsSaving] = useState(false);
  const { addToast } = useAppStore();
  const locations = useMemo(() => clubs.filter((club) => club.clubBrandId === draft.id), [clubs, draft.id]);
  const mediaOwnerId = getMediaOwnerId('club_brand', draft.id);

  const handleUpload = (asset: MediaAsset) => {
    const url = getCloudflareImageUrl({ externalId: asset.external_id, variant: getMediaRule(asset.role as MediaRole).defaultVariant });
    if (asset.role === 'logo') setDraft((current) => ({ ...current, logoImageUrl: url }));
    if (asset.role === 'hero') setDraft((current) => ({ ...current, headerImageUrl: url }));
  };

  const handleSave = async () => {
    if (!draft.name.trim()) return;
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      const saved = await api.saveClubBrand({
        ...draft,
        id: draft.id || `brand-${slugify(draft.name)}-${Date.now()}`,
        slug: draft.slug || slugify(draft.name),
        defaultAmenities: amenitiesText.split(',').map((value) => value.trim()).filter(Boolean),
        createdAt: draft.createdAt ?? now,
        updatedAt: now,
      });
      onSaved(saved);
      addToast({ message: 'Club brand saved.', type: 'success' });
    } catch {
      addToast({ message: 'Failed to save club brand.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return <div className="mx-auto max-w-5xl">
    <div className="mb-8 flex items-end justify-between gap-4">
      <div><button onClick={onBack} className="mb-3 text-sm font-semibold text-blue-600">← Back to clubs</button><p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600">Multi-location club brand</p><h1 className="mt-1 text-4xl font-bold text-gray-800">{draft.id ? `Edit ${draft.name}` : 'Add club brand'}</h1></div>
      <button onClick={handleSave} disabled={isSaving} className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isSaving ? 'Saving…' : 'Save brand'}</button>
    </div>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-800">Identity</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold text-gray-700">Brand name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
          <label><span className="mb-1 block text-sm font-semibold text-gray-700">Slug</span><input value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
          <label><span className="mb-1 block text-sm font-semibold text-gray-700">Status</span><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ClubBrandData['status'] })} className="w-full rounded-lg border border-gray-300 px-3 py-2"><option value="draft">Draft</option><option value="approved">Active / approved</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label>
          <label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold text-gray-700">Short description</span><textarea rows={3} value={draft.descriptionShort ?? ''} onChange={(e) => setDraft({ ...draft, descriptionShort: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
          <label className="sm:col-span-2"><span className="mb-1 block text-sm font-semibold text-gray-700">Full description</span><textarea rows={7} value={draft.descriptionFull ?? ''} onChange={(e) => setDraft({ ...draft, descriptionFull: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" /></label>
        </div></section>
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-800">Ownership and defaults</h2><div className="mt-4 space-y-4"><label><span className="mb-1 block text-sm font-semibold text-gray-700">Operator organization</span><select value={draft.operatorOrganizationId ?? ''} onChange={(e) => setDraft({ ...draft, operatorOrganizationId: e.target.value || undefined })} className="w-full rounded-lg border border-gray-300 px-3 py-2"><option value="">Not linked</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><label><span className="mb-1 block text-sm font-semibold text-gray-700">Default amenities</span><input value={amenitiesText} onChange={(e) => setAmenitiesText(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" /></label></div></section>
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-gray-800">Brand media</h2><div className="mt-4 grid gap-4"><MediaUploader tone="light" ownerType="club_brand" ownerId={mediaOwnerId} role="logo" label="Upload square brand logo" forceCropAspectRatio={1} onUploaded={handleUpload} /><MediaUploader tone="light" ownerType="club_brand" ownerId={mediaOwnerId} role="hero" label="Upload default brand banner" onUploaded={handleUpload} /></div></section>
      </div>
      <aside><section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-gray-800">Linked locations</h2><div className="mt-3 text-3xl font-black">{locations.length}</div><div className="mt-4 space-y-2">{locations.map((club) => <button key={club.id} onClick={() => onOpenClub(club.id)} className="block w-full rounded-lg border border-gray-200 p-3 text-left hover:border-blue-300 hover:bg-blue-50"><div className="font-semibold text-gray-800">{club.name}</div><div className="mt-1 text-xs text-gray-500">{club.location}</div></button>)}{!locations.length && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">No locations linked yet.</p>}</div></section></aside>
    </div>
  </div>;
};

export default AdminClubBrandEditor;

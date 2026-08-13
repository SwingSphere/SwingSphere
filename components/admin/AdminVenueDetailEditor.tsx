import React, { useMemo, useState } from 'react';
import type {
  BuildingAsset,
  EntityStatus,
  Listing,
  OrganizationData,
  OrganizationVenueRelationship,
  VenueData,
  VenueVisibility,
} from '../../types';
import type { EntityIndex } from '../../lib/entityIndex';
import * as api from '../../lib/api';
import { nameSlug, normalizeIdentityString } from '../../lib/identityUtils';
import { useAppStore } from '../../store/appStore';
import { AdminEditorPage } from './editor/AdminDetailPage';
import EntityRelationshipPanel from './EntityRelationshipPanel';
import MediaUploader from '../media/MediaUploader';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';
import { getMediaRule } from '../../lib/media/mediaRules';
import type { MediaAsset, MediaRole } from '../../lib/media/types';

type AdminVenueDetailEditorProps = {
  venue: VenueData;
  venues: VenueData[];
  organizations: OrganizationData[];
  relationships: OrganizationVenueRelationship[];
  listings: Listing[];
  buildingAssets: BuildingAsset[];
  entityIndex: EntityIndex | null;
  onBack: () => void;
  onSaved: (venue: VenueData) => void;
};

const inputClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-gray-500';

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block space-y-1.5">
    <span className={labelClass}>{label}</span>
    {children}
  </label>
);

const normalizeAddress = (venue: VenueData) => [
  venue.address.addressLine1,
  venue.address.addressLine2,
  venue.address.city,
  venue.address.region,
  venue.address.postalCode,
  venue.address.country,
].map((part) => normalizeIdentityString(part ?? '')).filter(Boolean).join('|');

const findDuplicateWarnings = (draft: VenueData, venues: VenueData[]) => {
  const draftName = normalizeIdentityString(draft.name);
  const draftAddress = normalizeAddress(draft);
  return venues
    .filter((venue) => venue.id !== draft.id)
    .filter((venue) => {
      const sameName = draftName && normalizeIdentityString(venue.name) === draftName;
      const sameAddress = draftAddress && normalizeAddress(venue) === draftAddress;
      const sameCoords = Number.isFinite(draft.latitude) &&
        Number.isFinite(draft.longitude) &&
        Math.abs(venue.latitude - draft.latitude) < 0.0002 &&
        Math.abs(venue.longitude - draft.longitude) < 0.0002;
      return sameName || sameAddress || sameCoords;
    });
};

const AdminVenueDetailEditor: React.FC<AdminVenueDetailEditorProps> = ({
  venue,
  venues,
  organizations,
  relationships,
  listings,
  buildingAssets,
  entityIndex,
  onBack,
  onSaved,
}) => {
  const [draft, setDraft] = useState<VenueData>(venue);
  const { addToast } = useAppStore();
  const duplicateWarnings = useMemo(() => findDuplicateWarnings(draft, venues), [draft, venues]);
  const mediaOwnerId = draft.id ? getMediaOwnerId('venue', draft.id) : '';
  const getAsset = (role: MediaRole) => draft.mediaAssets?.find((asset) => asset.role === role) ?? null;
  const handleAssetUploaded = (asset: MediaAsset) => {
    const url = getCloudflareImageUrl({ externalId: asset.external_id, variant: getMediaRule(asset.role).defaultVariant });
    setDraft((current) => ({
      ...current,
      mediaAssets: asset.role === 'gallery'
        ? [...(current.mediaAssets ?? []), asset]
        : [...(current.mediaAssets ?? []).filter((item) => item.role !== asset.role), asset],
      ...(asset.role === 'logo' ? { logoImageUrl: url } : {}),
      ...(asset.role === 'hero' ? { headerImageUrl: url } : {}),
      ...(asset.role === 'gallery' ? { galleryImageUrls: [...(current.galleryImageUrls ?? []), url] } : {}),
    }));
  };

  const updateAddress = (field: keyof VenueData['address'], value: string) => {
    setDraft((current) => ({
      ...current,
      address: {
        ...current.address,
        [field]: value,
      },
    }));
  };

  const saveDraft = async (nextDraft = draft) => {
    const saved = await api.saveVenue({
      ...nextDraft,
      slug: nextDraft.slug || `${nameSlug(nextDraft.name)}-${nextDraft.id || Date.now()}`,
    });
    setDraft(saved);
    onSaved(saved);
    addToast({ message: `${saved.name} saved.`, type: 'success' });
  };

  return (
    <AdminEditorPage
      title={draft.name || 'New Venue'}
      entityType="Venue"
      entityId={draft.id || 'New'}
      status={draft.status}
      created={draft.createdAt}
      updated={draft.updatedAt}
      onBack={onBack}
      onSave={() => saveDraft()}
      sections={[
        {
          id: 'basic',
          title: 'Basic Information',
          defaultOpen: true,
          saveLabel: 'Save Venue',
          onSave: () => saveDraft(),
          render: () => (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Name"><input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value, slug: `${nameSlug(event.target.value)}-${draft.id}` })} /></Field>
              <Field label="Slug"><input className={inputClass} value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} /></Field>
              <Field label="Visibility">
                <select className={inputClass} value={draft.visibility} onChange={(event) => setDraft({ ...draft, visibility: event.target.value as VenueVisibility })}>
                  <option value="public_exact">Public exact</option>
                  <option value="public_approximate">Public approximate</option>
                  <option value="private">Private</option>
                  <option value="admin_only">Admin only</option>
                </select>
              </Field>
              <Field label="Status">
                <select className={inputClass} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as EntityStatus })}>
                  <option value="draft">Draft</option>
                  <option value="pending_review">Pending review</option>
                  <option value="approved">Approved</option>
                  <option value="active">Active</option>
                  <option value="private">Private</option>
                  <option value="inactive">Inactive</option>
                  <option value="closed">Closed</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Description"><textarea className={`${inputClass} min-h-28`} value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></Field>
              </div>
              {duplicateWarnings.length ? (
                <div className="md:col-span-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
                  Possible duplicate venue: {duplicateWarnings.slice(0, 3).map((candidate) => candidate.name).join(', ')}
                </div>
              ) : null}
            </div>
          ),
        },
        {
          id: 'address',
          title: 'Address & Coordinates',
          saveLabel: 'Save Location',
          onSave: () => saveDraft(),
          render: () => (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Address line 1"><input className={inputClass} value={draft.address.addressLine1 ?? ''} onChange={(event) => updateAddress('addressLine1', event.target.value)} /></Field>
              <Field label="Address line 2"><input className={inputClass} value={draft.address.addressLine2 ?? ''} onChange={(event) => updateAddress('addressLine2', event.target.value)} /></Field>
              <Field label="City"><input className={inputClass} value={draft.address.city} onChange={(event) => updateAddress('city', event.target.value)} /></Field>
              <Field label="Region"><input className={inputClass} value={draft.address.region} onChange={(event) => updateAddress('region', event.target.value)} /></Field>
              <Field label="Postal code"><input className={inputClass} value={draft.address.postalCode ?? ''} onChange={(event) => updateAddress('postalCode', event.target.value)} /></Field>
              <Field label="Country"><input className={inputClass} value={draft.address.country} onChange={(event) => updateAddress('country', event.target.value)} /></Field>
              <Field label="Latitude"><input className={inputClass} type="number" step="0.000001" value={draft.latitude} onChange={(event) => setDraft({ ...draft, latitude: Number(event.target.value) })} /></Field>
              <Field label="Longitude"><input className={inputClass} type="number" step="0.000001" value={draft.longitude} onChange={(event) => setDraft({ ...draft, longitude: Number(event.target.value) })} /></Field>
            </div>
          ),
        },
        {
          id: 'details',
          title: 'Venue Details',
          saveLabel: 'Save Details',
          onSave: () => saveDraft(),
          render: () => (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Amenities"><textarea className={`${inputClass} min-h-28`} value={draft.amenities.join('\n')} onChange={(event) => setDraft({ ...draft, amenities: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} /></Field>
              <Field label="Building asset ID"><input className={inputClass} value={draft.buildingAssetId ?? ''} onChange={(event) => setDraft({ ...draft, buildingAssetId: event.target.value || undefined })} /></Field>
              <Field label="Parking notes"><textarea className={`${inputClass} min-h-24`} value={draft.parkingNotes ?? ''} onChange={(event) => setDraft({ ...draft, parkingNotes: event.target.value })} /></Field>
              <Field label="Accessibility notes"><textarea className={`${inputClass} min-h-24`} value={draft.accessibilityNotes ?? ''} onChange={(event) => setDraft({ ...draft, accessibilityNotes: event.target.value })} /></Field>
            </div>
          ),
        },
        {
          id: 'images',
          title: 'Images',
          saveLabel: 'Save Images',
          onSave: () => saveDraft(),
          render: () => mediaOwnerId ? (
            <div className="grid gap-4 md:grid-cols-2">
              <MediaUploader tone="light" ownerType="venue" ownerId={mediaOwnerId} role="logo" existingAsset={getAsset('logo')} label="Upload or replace venue logo" onUploaded={handleAssetUploaded} />
              <MediaUploader tone="light" ownerType="venue" ownerId={mediaOwnerId} role="hero" existingAsset={getAsset('hero')} label="Upload or replace venue hero image" onUploaded={handleAssetUploaded} />
              <div className="md:col-span-2"><MediaUploader tone="light" ownerType="venue" ownerId={mediaOwnerId} role="gallery" label="Add venue gallery image" onUploaded={handleAssetUploaded} /></div>
              {draft.logoImageUrl ? <img src={draft.logoImageUrl} alt="Current venue logo" className="h-36 w-full rounded-xl border border-gray-200 bg-white object-contain p-3" /> : null}
              {draft.headerImageUrl ? <img src={draft.headerImageUrl} alt="Current venue hero" className="h-36 w-full rounded-xl border border-gray-200 object-cover" /> : null}
              <div className="md:col-span-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(draft.galleryImageUrls ?? []).map((url, index) => (
                  <div key={`${url}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <img src={url} alt="" className="h-32 w-full rounded-lg object-cover" />
                    <button type="button" onClick={() => setDraft((current) => ({ ...current, galleryImageUrls: (current.galleryImageUrls ?? []).filter((_, itemIndex) => itemIndex !== index) }))} className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">Remove from venue</button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">Save the new venue once before uploading images.</div>
          ),
        },
        {
          id: 'relationships',
          title: 'Relationships',
          defaultOpen: true,
          render: () => (
            <EntityRelationshipPanel
              entityType="venue"
              entity={draft}
              index={entityIndex}
              listings={listings}
              venues={venues}
              organizations={organizations}
              relationships={relationships}
              buildingAssets={buildingAssets}
            />
          ),
        },
        {
          id: 'debug',
          title: 'Debug',
          render: () => <pre className="max-h-96 overflow-auto rounded-md bg-gray-950 p-4 text-xs text-gray-100">{JSON.stringify(draft, null, 2)}</pre>,
        },
      ]}
    />
  );
};

export default AdminVenueDetailEditor;

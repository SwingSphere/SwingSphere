import React, { useMemo, useState } from 'react';
import type { EventData, Listing, OrganizationData, OrganizationDisplayType, OrganizationRelationship, OrganizationRelationshipType, OrganizationVenueRelationship, VenueData } from '../../types';
import type { User } from '../../data/mockUsers';
import * as api from '../../lib/api';
import { nameSlug } from '../../lib/identityUtils';
import { useAppStore } from '../../store/appStore';
import MediaUploader from '../media/MediaUploader';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaRule } from '../../lib/media/mediaRules';
import type { MediaAsset, MediaRole } from '../../lib/media/types';
import { AdminEditorPage } from './editor/AdminDetailPage';
import AdminOrganizationTeamAccess from './AdminOrganizationTeamAccess';

const inputClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-gray-500';
const displayTypeOptions: OrganizationDisplayType[] = ['club', 'host', 'promoter', 'event_brand', 'community', 'producer'];
const organizationRelationshipTypes: OrganizationRelationshipType[] = ['operates', 'produces', 'owns', 'parent_brand', 'co_promotes', 'ticketing_provider', 'partner', 'affiliate'];

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block space-y-1.5"><span className={labelClass}>{label}</span>{children}</label>;

const AdminOrganizationDetailEditor: React.FC<{
  organization: OrganizationData;
  organizations: OrganizationData[];
  organizationRelationships: OrganizationRelationship[];
  onOrganizationRelationshipsChanged: React.Dispatch<React.SetStateAction<OrganizationRelationship[]>>;
  listings: Listing[];
  venues: VenueData[];
  relationships: OrganizationVenueRelationship[];
  users: User[];
  onBack: () => void;
  onSaved: (organization: OrganizationData) => void;
  onDeleted: (organizationId: string) => void;
}> = ({ organization, organizations, organizationRelationships, onOrganizationRelationshipsChanged, listings, venues, relationships, users, onBack, onSaved, onDeleted }) => {
  const [draft, setDraft] = useState(organization);
  const [relationshipDirection, setRelationshipDirection] = useState<'incoming' | 'outgoing'>('incoming');
  const [relatedOrganizationId, setRelatedOrganizationId] = useState('');
  const [organizationRelationshipType, setOrganizationRelationshipType] = useState<OrganizationRelationshipType>('operates');
  const { addToast } = useAppStore();
  const mediaOwnerId = draft.id ? getMediaOwnerId('organization', draft.id) : '';
  const linkedEvents = listings.filter((listing): listing is EventData => listing.type === 'event' && listing.organizerOrganizationId === draft.id);
  const linkedClubs = listings.filter((listing) => listing.type === 'club' && listing.ownerOrganizationId === draft.id);
  const linkedRelationships = relationships.filter((relationship) => relationship.organizationId === draft.id);
  const linkedVenues = useMemo(() => linkedRelationships.map((relationship) => ({ relationship, venue: venues.find((venue) => venue.id === relationship.venueId) })).filter((entry) => entry.venue), [linkedRelationships, venues]);
  const linkedOrganizationRelationships = useMemo(() => organizationRelationships.filter((relationship) => relationship.sourceOrganizationId === draft.id || relationship.targetOrganizationId === draft.id), [draft.id, organizationRelationships]);
  const organizationById = useMemo(() => new Map(organizations.map((item) => [item.id, item])), [organizations]);

  const saveDraft = async (next = draft) => {
    const saved = await api.saveOrganization({ ...next, slug: next.slug || nameSlug(next.name) });
    setDraft(saved);
    onSaved(saved);
    addToast({ message: `${saved.name} saved.`, type: 'success' });
  };

  const deleteDraft = async () => {
    if (!draft.id) return;
    if (!window.confirm(`Delete ${draft.name || 'this organization / brand'}? This removes the organization record and unlinks its events, venues, and organization relationships.`)) return;
    await api.deleteOrganization(draft.id);
    onDeleted(draft.id);
    addToast({ message: `${draft.name || 'Organization / brand'} deleted.`, type: 'success' });
  };

  const saveOrganizationRelationship = async () => {
    if (!draft.id || !relatedOrganizationId || relatedOrganizationId === draft.id) return;
    const saved = await api.saveOrganizationRelationship({
      id: '',
      sourceOrganizationId: relationshipDirection === 'incoming' ? relatedOrganizationId : draft.id,
      targetOrganizationId: relationshipDirection === 'incoming' ? draft.id : relatedOrganizationId,
      relationshipType: organizationRelationshipType,
      isPrimary: organizationRelationshipType === 'operates' || organizationRelationshipType === 'owns' || organizationRelationshipType === 'parent_brand',
    });
    onOrganizationRelationshipsChanged((current) => [saved, ...current.filter((item) => item.id !== saved.id && !(item.sourceOrganizationId === saved.sourceOrganizationId && item.targetOrganizationId === saved.targetOrganizationId && item.relationshipType === saved.relationshipType))]);
    setRelatedOrganizationId('');
    addToast({ message: 'Organization relationship saved.', type: 'success' });
  };

  const removeOrganizationRelationship = async (relationship: OrganizationRelationship) => {
    const related = organizationById.get(relationship.sourceOrganizationId === draft.id ? relationship.targetOrganizationId : relationship.sourceOrganizationId);
    const reason = window.prompt(`Why are you removing the relationship with ${related?.name ?? 'this organization'}?`);
    if (!reason?.trim()) return;
    await api.deleteOrganizationRelationship(relationship.id, reason.trim());
    onOrganizationRelationshipsChanged((current) => current.filter((item) => item.id !== relationship.id));
    addToast({ message: 'Organization relationship removed.', type: 'success' });
  };

  const getAsset = (role: MediaRole) => draft.mediaAssets?.find((asset) => asset.role === role) ?? null;
  const handleAssetUploaded = (asset: MediaAsset) => {
    const url = getCloudflareImageUrl({ externalId: asset.external_id, variant: getMediaRule(asset.role).defaultVariant });
    setDraft((current) => ({
      ...current,
      mediaAssets: asset.role === 'gallery' ? [...(current.mediaAssets ?? []), asset] : [...(current.mediaAssets ?? []).filter((item) => item.role !== asset.role), asset],
      ...(asset.role === 'logo' ? { logoImageUrl: url } : {}),
      ...(asset.role === 'hero' ? { headerImageUrl: url } : {}),
      ...(asset.role === 'gallery' ? { galleryImageUrls: [...(current.galleryImageUrls ?? []), url] } : {}),
    }));
  };

  return <AdminEditorPage
    title={draft.name || 'New Organization / Brand'}
    entityType="Organization / Brand"
    entityId={draft.id || 'New'}
    status={draft.status}
    created={draft.createdAt}
    updated={draft.updatedAt}
    onBack={onBack}
    onSave={() => saveDraft()}
    onDelete={draft.id ? deleteDraft : undefined}
    sections={[
      {
        id: 'identity', title: 'Identity', defaultOpen: true, saveLabel: 'Save Identity', onSave: () => saveDraft(), render: () => <div className="grid gap-4 md:grid-cols-2">
          <Field label="Public name"><input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value, slug: draft.slug || nameSlug(event.target.value) })} /></Field>
          <Field label="Slug"><input className={inputClass} value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: nameSlug(event.target.value) })} /></Field>
          <Field label="Status"><select className={inputClass} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as OrganizationData['status'] })}><option value="draft">Draft</option><option value="pending_review">Pending review</option><option value="approved">Approved</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></Field>
          <div><span className={labelClass}>Display types</span><div className="mt-2 flex flex-wrap gap-2">{displayTypeOptions.map((type) => <label key={type} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"><input type="checkbox" checked={draft.displayTypes.includes(type)} onChange={() => setDraft({ ...draft, displayTypes: draft.displayTypes.includes(type) ? draft.displayTypes.filter((item) => item !== type) : [...draft.displayTypes, type] })} />{type.replaceAll('_', ' ')}</label>)}</div></div>
        </div>
      },
      {
        id: 'profile', title: 'Public Profile', saveLabel: 'Save Profile', onSave: () => saveDraft(), render: () => <div className="grid gap-4 md:grid-cols-2">
          <Field label="Website"><input className={inputClass} value={draft.website ?? ''} onChange={(event) => setDraft({ ...draft, website: event.target.value || undefined })} /></Field>
          <Field label="Contact email"><input className={inputClass} type="email" value={draft.contactEmail ?? ''} onChange={(event) => setDraft({ ...draft, contactEmail: event.target.value || undefined })} /></Field>
          <div className="md:col-span-2"><Field label="Short description"><textarea className={`${inputClass} min-h-24`} value={draft.descriptionShort ?? ''} onChange={(event) => setDraft({ ...draft, descriptionShort: event.target.value })} /></Field></div>
          <div className="md:col-span-2"><Field label="Full description / philosophy"><textarea className={`${inputClass} min-h-40`} value={draft.descriptionFull ?? ''} onChange={(event) => setDraft({ ...draft, descriptionFull: event.target.value })} /></Field></div>
        </div>
      },
      {
        id: 'images', title: 'Images', saveLabel: 'Save Images', onSave: () => saveDraft(), render: () => mediaOwnerId ? <div className="grid gap-4 md:grid-cols-2">
          <MediaUploader tone="light" ownerType="organization" ownerId={mediaOwnerId} role="logo" existingAsset={getAsset('logo')} label="Upload or replace logo" onUploaded={handleAssetUploaded} />
          <MediaUploader tone="light" ownerType="organization" ownerId={mediaOwnerId} role="hero" existingAsset={getAsset('hero')} label="Upload or replace hero" onUploaded={handleAssetUploaded} />
          <div className="md:col-span-2"><MediaUploader tone="light" ownerType="organization" ownerId={mediaOwnerId} role="gallery" label="Add gallery image" onUploaded={handleAssetUploaded} /></div>
        </div> : <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">Save this organization once before uploading images.</div>
      },
      {
        id: 'organization-relationships', title: 'Organization Relationships', render: () => <div className="space-y-5">
          <p className="text-sm text-gray-600">Keep public brands separate while recording who operates, produces, owns, co-promotes, services, or partners with them. These relationships do not cause brand-media inheritance.</p>
          {linkedOrganizationRelationships.length ? <div className="space-y-2">{linkedOrganizationRelationships.map((relationship) => {
            const outgoing = relationship.sourceOrganizationId === draft.id;
            const relatedId = outgoing ? relationship.targetOrganizationId : relationship.sourceOrganizationId;
            const related = organizationById.get(relatedId);
            return <div key={relationship.id} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold text-gray-900">{outgoing ? draft.name : related?.name ?? relatedId} <span className="font-normal text-gray-500">{outgoing ? relationship.relationshipType.replaceAll('_', ' ') : `${relationship.relationshipType.replaceAll('_', ' ')} →`}</span> {outgoing ? related?.name ?? relatedId : draft.name}</div><div className="mt-1 text-xs text-gray-500">{relationship.isPrimary ? 'Primary relationship' : 'Related organization'}{relationship.label ? ` • ${relationship.label}` : ''}</div></div><button type="button" onClick={() => void removeOrganizationRelationship(relationship)} className="self-start rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">Remove</button></div>;
          })}</div> : <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">No organization-to-organization relationships yet.</p>}
          {draft.id ? <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 md:grid-cols-3">
            <Field label="Direction"><select className={inputClass} value={relationshipDirection} onChange={(event) => setRelationshipDirection(event.target.value as 'incoming' | 'outgoing')}><option value="incoming">Another org → this brand</option><option value="outgoing">This org → another brand/org</option></select></Field>
            <Field label="Relationship"><select className={inputClass} value={organizationRelationshipType} onChange={(event) => setOrganizationRelationshipType(event.target.value as OrganizationRelationshipType)}>{organizationRelationshipTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select></Field>
            <Field label="Related organization"><select className={inputClass} value={relatedOrganizationId} onChange={(event) => setRelatedOrganizationId(event.target.value)}><option value="">Select organization</option>{organizations.filter((item) => item.id !== draft.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <div className="md:col-span-3"><button type="button" disabled={!relatedOrganizationId} onClick={() => void saveOrganizationRelationship()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Add relationship</button></div>
          </div> : <p className="text-sm text-amber-700">Save this organization before adding relationships.</p>}
        </div>
      },
      {
        id: 'managed-content', title: 'Managed Content', render: () => <div className="grid gap-5 lg:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><div className="font-semibold text-gray-900">Clubs ({linkedClubs.length})</div><div className="mt-3 space-y-2">{linkedClubs.map((club) => <div key={club.id} className="rounded-lg bg-white p-3 text-sm">{club.name}</div>)}{!linkedClubs.length && <p className="text-sm text-gray-500">No clubs linked yet.</p>}</div></div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><div className="font-semibold text-gray-900">Events ({linkedEvents.length})</div><div className="mt-3 space-y-2">{linkedEvents.map((event) => <div key={event.id} className="rounded-lg bg-white p-3 text-sm">{event.name}</div>)}{!linkedEvents.length && <p className="text-sm text-gray-500">No events linked yet.</p>}</div></div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4"><div className="font-semibold text-gray-900">Venues ({linkedVenues.length})</div><div className="mt-3 space-y-2">{linkedVenues.map(({ relationship, venue }) => <div key={relationship.id} className="rounded-lg bg-white p-3 text-sm"><div>{venue?.name}</div><div className="mt-1 text-xs text-gray-500">{relationship.relationshipType.replaceAll('_', ' ')}</div></div>)}{!linkedVenues.length && <p className="text-sm text-gray-500">No venues linked yet.</p>}</div></div>
        </div>
      },
      {
        id: 'access', title: 'Team Access', render: () => <AdminOrganizationTeamAccess organizationId={draft.id} users={users} />
      },
    ]}
  />;
};

export default AdminOrganizationDetailEditor;

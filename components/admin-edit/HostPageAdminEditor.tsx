import React, { useEffect, useState } from 'react';
import type { Listing, OrganizationData, OrganizationVenueRelationship, VenueData } from '../../types';
import type { User } from '../../data/mockUsers';
import { useAppStore } from '../../store/appStore';
import * as api from '../../lib/api';
import AdminEntityEditorDrawer from './AdminEntityEditorDrawer';
import { useAdminEditMode } from './AdminEditModeContext';
import MediaUploader from '../media/MediaUploader';
import { getMediaOwnerId } from '../../lib/media/getMediaOwnerId';
import { getCloudflareImageUrl } from '../../lib/media/getCloudflareImageUrl';
import { getMediaRule } from '../../lib/media/mediaRules';
import type { MediaAsset, MediaRole } from '../../lib/media/types';

const inputClass = 'w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none transition focus:border-red-300/50 focus:ring-2 focus:ring-red-400/10';
const labelClass = 'mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-gray-500';

const Field = ({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={className}>
    <span className={labelClass}>{label}</span>
    {children}
  </label>
);

type HostPageAdminEditorProps = {
  organization: OrganizationData | null;
  listings: Listing[];
  venues: VenueData[];
  relationships: OrganizationVenueRelationship[];
  users: User[];
  canEdit?: boolean;
};

const HostPageAdminEditor: React.FC<HostPageAdminEditorProps> = ({ organization, canEdit = false }) => {
  const { currentUser, addToast } = useAppStore();
  const { isEditing, isAdvancedEditorOpen, closeAdvancedEditor, markSaved } = useAdminEditMode();
  const [draft, setDraft] = useState<OrganizationData | null>(organization);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(organization);
  }, [organization]);

  if (!currentUser || !canEdit || !isEditing || !isAdvancedEditorOpen) return null;

  const handleClose = () => closeAdvancedEditor();

  if (!organization || !draft) {
    return (
      <AdminEntityEditorDrawer
        title="Host profile is not linked"
        eyebrow="Host profile editor"
        subtitle="This host page is still generated from event text and does not yet have an organization record."
        ariaLabel="Host profile cannot be edited yet"
        onClose={handleClose}
      >
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-5 text-sm leading-6 text-amber-100">
          This host needs to be linked to an organization before its public profile can be edited.
        </div>
      </AdminEntityEditorDrawer>
    );
  }

  const mediaOwnerId = getMediaOwnerId('organization', draft.id);
  const getAsset = (role: MediaRole) => draft.mediaAssets?.find((asset) => asset.role === role) ?? null;

  const handleAssetUploaded = (asset: MediaAsset) => {
    const url = getCloudflareImageUrl({ externalId: asset.external_id, variant: getMediaRule(asset.role).defaultVariant });
    setDraft((current) => current ? ({
      ...current,
      mediaAssets: asset.role === 'gallery'
        ? [...(current.mediaAssets ?? []), asset]
        : [...(current.mediaAssets ?? []).filter((item) => item.role !== asset.role), asset],
      ...(asset.role === 'logo' ? { logoImageUrl: url } : {}),
      ...(asset.role === 'hero' ? { headerImageUrl: url } : {}),
      ...(asset.role === 'gallery' ? { galleryImageUrls: [...(current.galleryImageUrls ?? []), url] } : {}),
    }) : current);
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const saved = await api.saveOrganization({
        ...draft,
        // Public host managers can edit profile content, not lifecycle or identity plumbing.
        id: organization.id,
        slug: organization.slug,
        displayTypes: organization.displayTypes,
        status: organization.status,
        postedByUserId: organization.postedByUserId,
      });
      setDraft(saved);
      markSaved();
      addToast({ message: 'Host profile updated.', type: 'success' });
      window.setTimeout(() => window.location.reload(), 200);
    } catch (error) {
      addToast({ message: error instanceof Error ? error.message : 'Unable to update host profile.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminEntityEditorDrawer
      title={draft.name}
      eyebrow="Host profile editor"
      subtitle="Update the public promoter / host identity used across SwingSphere."
      ariaLabel={`Edit ${draft.name}`}
      onClose={handleClose}
      maxWidthClassName="max-w-[900px]"
    >
      <div className="space-y-6 text-white">
        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="mb-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-red-200/80">Public identity</div>
            <h3 className="mt-1 text-lg font-bold">Profile details</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Public name"><input className={inputClass} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field label="Contact email"><input className={inputClass} type="email" value={draft.contactEmail ?? ''} onChange={(event) => setDraft({ ...draft, contactEmail: event.target.value || undefined })} /></Field>
            <Field label="Website"><input className={inputClass} value={draft.website ?? ''} onChange={(event) => setDraft({ ...draft, website: event.target.value || undefined })} /></Field>
            <Field label="Instagram"><input className={inputClass} value={draft.instagram ?? ''} onChange={(event) => setDraft({ ...draft, instagram: event.target.value || undefined })} /></Field>
            <Field label="FetLife"><input className={inputClass} value={draft.fetlife ?? ''} onChange={(event) => setDraft({ ...draft, fetlife: event.target.value || undefined })} /></Field>
            <Field label="Short description" className="md:col-span-2"><textarea className={`${inputClass} min-h-24`} value={draft.descriptionShort ?? ''} onChange={(event) => setDraft({ ...draft, descriptionShort: event.target.value })} /></Field>
            <Field label="Full description / philosophy" className="md:col-span-2"><textarea className={`${inputClass} min-h-36`} value={draft.descriptionFull ?? ''} onChange={(event) => setDraft({ ...draft, descriptionFull: event.target.value })} /></Field>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <div className="mb-4">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-red-200/80">Branding</div>
            <h3 className="mt-1 text-lg font-bold">Logo, hero & gallery</h3>
            <p className="mt-1 text-sm text-gray-400">These assets represent the host/promoter identity independently from any club or venue.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <MediaUploader tone="dark" ownerType="organization" ownerId={mediaOwnerId} role="logo" existingAsset={getAsset('logo')} label="Upload or replace host logo" onUploaded={handleAssetUploaded} />
            <MediaUploader tone="dark" ownerType="organization" ownerId={mediaOwnerId} role="hero" existingAsset={getAsset('hero')} label="Upload or replace host hero" onUploaded={handleAssetUploaded} />
            <div className="md:col-span-2"><MediaUploader tone="dark" ownerType="organization" ownerId={mediaOwnerId} role="gallery" label="Add host gallery image" onUploaded={handleAssetUploaded} /></div>
          </div>
        </section>

        <div className="flex justify-end gap-3 border-t border-white/10 pt-4">
          <button type="button" onClick={handleClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/[0.05]">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={isSaving} className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50">{isSaving ? 'Saving…' : 'Save host profile'}</button>
        </div>
      </div>
    </AdminEntityEditorDrawer>
  );
};

export default HostPageAdminEditor;

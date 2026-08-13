import React from 'react';
import type { Listing, OrganizationData, OrganizationVenueRelationship, VenueData } from '../../types';
import type { User } from '../../data/mockUsers';
import { useAppStore } from '../../store/appStore';
import AdminOrganizationDetailEditor from '../admin/AdminOrganizationDetailEditor';
import AdminEntityEditorDrawer from './AdminEntityEditorDrawer';
import { useAdminEditMode } from './AdminEditModeContext';

type HostPageAdminEditorProps = {
  organization: OrganizationData | null;
  listings: Listing[];
  venues: VenueData[];
  relationships: OrganizationVenueRelationship[];
  users: User[];
  canEdit?: boolean;
};

const HostPageAdminEditor: React.FC<HostPageAdminEditorProps> = ({
  organization,
  listings,
  venues,
  relationships,
  users,
  canEdit = false,
}) => {
  const { currentUser, addToast } = useAppStore();
  const { isEditing, isAdvancedEditorOpen, closeAdvancedEditor, setMode, markSaved } = useAdminEditMode();

  if (!currentUser || !canEdit || !isEditing || !isAdvancedEditorOpen) return null;

  const handleClose = () => closeAdvancedEditor();

  if (!organization) {
    return (
      <AdminEntityEditorDrawer
        title="Host profile is not linked"
        eyebrow="Admin host editor"
        subtitle="This legacy host page was generated from event host text and does not yet have an organization record."
        ariaLabel="Host profile cannot be edited yet"
        onClose={handleClose}
      >
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          Create or link a promoter / host organization in the Admin Panel before editing this public profile.
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={handleClose} className="rounded-lg border border-amber-300 bg-white px-4 py-2 font-semibold">Close</button>
            <button type="button" onClick={() => { if (setMode('viewing')) window.location.href = '/admin'; }} className="rounded-lg bg-amber-900 px-4 py-2 font-semibold text-white">Open Admin Panel</button>
          </div>
        </div>
      </AdminEntityEditorDrawer>
    );
  }

  return (
    <AdminEntityEditorDrawer
      title={organization.name}
      eyebrow="Admin promoter editor"
      subtitle="Changes save to the organization record used by this public host page."
      ariaLabel={`Edit ${organization.name}`}
      onClose={handleClose}
      maxWidthClassName="max-w-[1120px]"
    >
      <AdminOrganizationDetailEditor
        organization={organization}
        listings={listings}
        venues={venues}
        relationships={relationships}
        users={users}
        onBack={handleClose}
        onSaved={(saved) => {
          markSaved();
          addToast({ message: 'Promoter profile updated. Refreshing the public page…', type: 'success' });
          const nextPath = `/hosts/${saved.slug}`;
          window.setTimeout(() => {
            if (window.location.pathname === nextPath) window.location.reload();
            else window.location.href = nextPath;
          }, 250);
        }}
        onDeleted={() => {
          markSaved();
          setMode('viewing');
          addToast({ message: 'Promoter profile deleted.', type: 'success' });
          window.setTimeout(() => { window.location.href = '/admin'; }, 250);
        }}
      />
    </AdminEntityEditorDrawer>
  );
};

export default HostPageAdminEditor;

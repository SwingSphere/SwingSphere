import React, { useEffect, useState } from 'react';
import type {
  BuildingAsset,
  Listing,
  OrganizationData,
  OrganizationVenueRelationship,
  VenueData,
} from '../../types';
import type { EntityIndex } from '../../lib/entityIndex';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';
import AdminVenueDetailEditor from '../admin/AdminVenueDetailEditor';
import AdminEntityEditorDrawer from './AdminEntityEditorDrawer';
import { useAdminEditMode } from './AdminEditModeContext';

type VenuePageAdminEditorProps = {
  venue: VenueData;
  venues: VenueData[];
  organizations: OrganizationData[];
  relationships: OrganizationVenueRelationship[];
  listings: Listing[];
  entityIndex: EntityIndex;
  canEdit?: boolean;
};

const VenuePageAdminEditor: React.FC<VenuePageAdminEditorProps> = ({
  venue,
  venues,
  organizations,
  relationships,
  listings,
  entityIndex,
  canEdit = false,
}) => {
  const { currentUser, addToast } = useAppStore();
  const { isEditing, isAdvancedEditorOpen, closeAdvancedEditor, markSaved } = useAdminEditMode();
  const [buildingAssets, setBuildingAssets] = useState<BuildingAsset[]>([]);

  useEffect(() => {
    if (!currentUser || !canEdit || !isEditing || !isAdvancedEditorOpen) return;
    let active = true;
    api.getBuildingAssets()
      .then((assets) => {
        if (active) setBuildingAssets(assets);
      })
      .catch(() => {
        if (active) setBuildingAssets([]);
      });
    return () => {
      active = false;
    };
  }, [canEdit, currentUser, isAdvancedEditorOpen, isEditing]);

  if (!currentUser || !canEdit || !isEditing || !isAdvancedEditorOpen) return null;

  const handleClose = () => closeAdvancedEditor();

  return (
    <AdminEntityEditorDrawer
      title={venue.name}
      eyebrow="Admin venue editor"
      subtitle="Changes save to the physical venue record used by public pages, clubs, events, and organization relationships."
      ariaLabel={`Edit ${venue.name}`}
      onClose={handleClose}
      maxWidthClassName="max-w-[1120px]"
    >
      <AdminVenueDetailEditor
        venue={venue}
        venues={venues}
        organizations={organizations}
        relationships={relationships}
        listings={listings}
        buildingAssets={buildingAssets}
        entityIndex={entityIndex}
        onBack={handleClose}
        onSaved={(saved) => {
          markSaved();
          addToast({ message: 'Venue updated. Refreshing the public page…', type: 'success' });
          const nextPath = `/venues/${saved.slug}`;
          window.setTimeout(() => {
            if (window.location.pathname === nextPath) window.location.reload();
            else window.location.href = nextPath;
          }, 250);
        }}
      />
    </AdminEntityEditorDrawer>
  );
};

export default VenuePageAdminEditor;

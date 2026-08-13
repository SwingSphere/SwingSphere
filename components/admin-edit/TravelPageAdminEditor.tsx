import React from 'react';
import type { CruiseSailingData, CruiseSeriesData, OrganizationData, ResortData } from '../../types';
import { useAppStore } from '../../store/appStore';
import AdminTravelEditor from '../admin/AdminTravelEditor';
import AdminEntityEditorDrawer from './AdminEntityEditorDrawer';
import { useAdminEditMode } from './AdminEditModeContext';

type TravelEntity = ResortData | CruiseSeriesData;

type TravelPageAdminEditorProps = {
  entity: TravelEntity;
  organizations: OrganizationData[];
  cruiseSeries: CruiseSeriesData[];
  sailings: CruiseSailingData[];
  canEdit?: boolean;
};

const TravelPageAdminEditor: React.FC<TravelPageAdminEditorProps> = ({
  entity,
  organizations,
  cruiseSeries,
  sailings,
  canEdit = false,
}) => {
  const { currentUser, addToast } = useAppStore();
  const { isEditing, isAdvancedEditorOpen, closeAdvancedEditor, markSaved } = useAdminEditMode();

  if (!currentUser || !canEdit || !isEditing || !isAdvancedEditorOpen) return null;

  const handleClose = () => closeAdvancedEditor();

  return (
    <AdminEntityEditorDrawer
      title={entity.name}
      subtitle={`Changes save to the ${entity.type === 'resort' ? 'resort' : 'cruise series'} record used by this public page.`}
      eyebrow={entity.type === 'resort' ? 'Admin resort editor' : 'Admin cruise editor'}
      ariaLabel={`Edit ${entity.name}`}
      onClose={handleClose}
      maxWidthClassName="max-w-[1180px]"
    >
      <AdminTravelEditor
        entity={entity}
        organizations={organizations}
        cruiseSeries={cruiseSeries}
        sailings={sailings}
        onBack={handleClose}
        onOpenSailing={() => {
          addToast({ message: 'Open the Admin travel manager to edit a specific sailing.', type: 'info' });
        }}
        onSaved={(saved) => {
          markSaved();
          const nextSlug = saved.slug;
          const basePath = saved.type === 'resort' ? '/resorts' : '/cruises';
          addToast({ message: 'Travel page updated. Refreshing…', type: 'success' });
          window.setTimeout(() => {
            window.location.href = `${basePath}/${nextSlug}`;
          }, 250);
        }}
      />
    </AdminEntityEditorDrawer>
  );
};

export default TravelPageAdminEditor;

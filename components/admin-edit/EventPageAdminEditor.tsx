import React from 'react';
import type { EventData } from '../../types';
import { useAppStore } from '../../store/appStore';
import ListingEditor from '../listing-editor/ListingEditor';
import { useAdminEditMode } from './AdminEditModeContext';
import AdminEntityEditorDrawer from './AdminEntityEditorDrawer';
import { getEventCanonicalPath } from '../../lib/entityUtils';
import { nameSlug } from '../../lib/identityUtils';

type EventPageAdminEditorProps = {
  event: EventData;
  isMockRoute?: boolean;
};

const EventPageAdminEditor: React.FC<EventPageAdminEditorProps> = ({ event, isMockRoute = false }) => {
  const { currentUser, addToast } = useAppStore();
  const { isEditing, isAdvancedEditorOpen, closeAdvancedEditor, markSaved } = useAdminEditMode();

  if (currentUser?.status !== 'Active' || currentUser.role !== 'Admin' || !isEditing || !isAdvancedEditorOpen || isMockRoute) return null;

  const handleClose = () => closeAdvancedEditor();

  return (
    <AdminEntityEditorDrawer
      title={event.name}
      subtitle="Changes save to the same event record used by the public page."
      ariaLabel={`Edit ${event.name}`}
      onClose={handleClose}
    >
      <ListingEditor
        mode="admin-edit"
        listingToEdit={event}
        onCancel={handleClose}
        onSaved={(saved) => {
          markSaved();
          addToast({ message: 'Event updated. Refreshing the public page…', type: 'success' });
          const nextPath = saved.type === 'event' ? getEventCanonicalPath(saved) : `/events/${nameSlug(saved.name)}`;
          window.setTimeout(() => {
            if (window.location.pathname === nextPath) window.location.reload();
            else window.location.href = nextPath;
          }, 250);
        }}
      />
    </AdminEntityEditorDrawer>
  );
};

export default EventPageAdminEditor;

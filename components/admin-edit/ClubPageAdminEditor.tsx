import React from 'react';
import type { ClubData } from '../../types';
import { useAppStore } from '../../store/appStore';
import ListingEditor from '../listing-editor/ListingEditor';
import AdminEntityEditorDrawer from './AdminEntityEditorDrawer';
import { useAdminEditMode } from './AdminEditModeContext';
import { nameSlug } from '../../lib/identityUtils';

type ClubPageAdminEditorProps = {
  club: ClubData;
};

const ClubPageAdminEditor: React.FC<ClubPageAdminEditorProps> = ({ club }) => {
  const { currentUser, addToast } = useAppStore();
  const { isEditing, isAdvancedEditorOpen, closeAdvancedEditor, markSaved } = useAdminEditMode();

  if (currentUser?.status !== 'Active' || currentUser.role !== 'Admin' || !isEditing || !isAdvancedEditorOpen) return null;

  const handleClose = () => closeAdvancedEditor();

  return (
    <AdminEntityEditorDrawer
      title={club.name}
      eyebrow="Admin club editor"
      subtitle="Changes save to the same club record used by the public page."
      ariaLabel={`Edit ${club.name}`}
      onClose={handleClose}
    >
      <ListingEditor
        mode="admin-edit"
        listingToEdit={club}
        onCancel={handleClose}
        onSaved={(saved) => {
          markSaved();
          addToast({ message: 'Club updated. Refreshing the public page…', type: 'success' });
          const currentSegment = window.location.pathname.split('/').filter(Boolean).at(-1) ?? '';
          const keySuffix = currentSegment.includes('--') ? `--${currentSegment.split('--').slice(1).join('--')}` : '';
          const nextPath = `/clubs/${nameSlug(saved.name)}${keySuffix}`;
          window.setTimeout(() => {
            if (window.location.pathname === nextPath) window.location.reload();
            else window.location.href = nextPath;
          }, 250);
        }}
      />
    </AdminEntityEditorDrawer>
  );
};

export default ClubPageAdminEditor;

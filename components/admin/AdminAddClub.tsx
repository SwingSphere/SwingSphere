import React from 'react';
import type { ClubData } from '../../types';
import ListingEditor from '../listing-editor/ListingEditor';

type AdminAddClubProps = {
  clubToEdit?: ClubData;
  onClubAction: (club?: ClubData) => void;
  onCancel: () => void;
};

const AdminAddClub: React.FC<AdminAddClubProps> = ({ clubToEdit, onClubAction, onCancel }) => (
  <ListingEditor
    mode={clubToEdit ? 'admin-edit' : 'admin-create'}
    initialKind="club"
    listingToEdit={clubToEdit}
    onSaved={(listing) => onClubAction(listing as ClubData)}
    onCancel={onCancel}
  />
);

export default AdminAddClub;

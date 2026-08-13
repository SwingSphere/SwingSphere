import React from 'react';
import type { EventData } from '../../types';
import ListingEditor from '../listing-editor/ListingEditor';

type AdminAddEventProps = {
  eventToEdit?: EventData;
  onEventAction: (event?: EventData) => void;
  onCancel: () => void;
};

const AdminAddEvent: React.FC<AdminAddEventProps> = ({ eventToEdit, onEventAction, onCancel }) => (
  <ListingEditor
    mode={eventToEdit ? 'admin-edit' : 'admin-create'}
    initialKind="event"
    listingToEdit={eventToEdit}
    onSaved={(listing) => onEventAction(listing as EventData)}
    onCancel={onCancel}
  />
);

export default AdminAddEvent;

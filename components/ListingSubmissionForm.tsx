import React from 'react';
import { useNavigate } from 'react-router-dom';
import ListingEditor from './listing-editor/ListingEditor';

const ListingSubmissionForm: React.FC = () => {
  const navigate = useNavigate();

  return (
    <ListingEditor
      mode="public"
      onSaved={() => navigate('/')}
      onCancel={() => navigate('/')}
    />
  );
};

export default ListingSubmissionForm;

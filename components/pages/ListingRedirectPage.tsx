import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEntityIndex } from '../../hooks/useEntityIndex';
import { getListingCanonicalPath } from '../../lib/entityUtils';

const ListingRedirectPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { index, listings, isLoading } = useEntityIndex();

  useEffect(() => {
    if (!id || !index) return;
    const listing = listings.find((item) => item.id === id);
    if (!listing) return;
    const target = getListingCanonicalPath(listing, index);
    if (target) {
      navigate(target, { replace: true });
    }
  }, [id, index, listings, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
        Redirecting...
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] text-gray-400">
      Listing not found.
    </div>
  );
};

export default ListingRedirectPage;

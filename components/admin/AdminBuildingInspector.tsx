import React, { useEffect, useState } from 'react';
import BuildingInspectorPage from '../dev/BuildingInspectorPage';
import * as api from '../../lib/api';
import type {
  BuildingAsset,
  Listing,
  OrganizationData,
  OrganizationVenueRelationship,
  VenueData,
} from '../../types';

type AdminBuildingInspectorProps = {
  listings: Listing[];
  venues: VenueData[];
  organizations: OrganizationData[];
  relationships: OrganizationVenueRelationship[];
  onUpdateListing: (listing: Listing) => void;
  onUpdateVenue: (venue: VenueData) => void;
};

const AdminBuildingInspector: React.FC<AdminBuildingInspectorProps> = ({
  listings,
  venues,
  organizations,
  relationships,
  onUpdateListing,
  onUpdateVenue,
}) => {
  const [buildingAssets, setBuildingAssets] = useState<BuildingAsset[]>([]);

  useEffect(() => {
    let cancelled = false;
    api.getBuildingAssets()
      .then((assets) => {
        if (!cancelled) setBuildingAssets(assets);
      })
      .catch(() => {
        if (!cancelled) setBuildingAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full">
      <BuildingInspectorPage
        embedded
        listings={listings}
        venues={venues}
        organizations={organizations}
        relationships={relationships}
        buildingAssets={buildingAssets}
        onListingLocationSaved={onUpdateListing}
        onVenueLocationSaved={onUpdateVenue}
        onBuildingAssetSaved={(asset, listing) => {
          setBuildingAssets((current) => {
            const index = current.findIndex((item) => item.id === asset.id);
            if (index < 0) return [...current, asset];
            const next = [...current];
            next[index] = asset;
            return next;
          });
          if (listing) onUpdateListing(listing);
        }}
      />
    </div>
  );
};

export default AdminBuildingInspector;

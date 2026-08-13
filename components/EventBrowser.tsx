import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/appStore';
import FlatWorldMap from './maps/FlatWorldMap';
import ClubSidebar from './sidebar/ClubSidebar';
import ExplorerDiscoveryRail from './explorer/ExplorerDiscoveryRail';
import { useEntityIndex } from '../hooks/useEntityIndex';
import { useExplorerState } from '../hooks/useExplorerState';
import * as api from '../lib/api';
import type { BuildingAsset } from '../types';

const EventBrowser: React.FC = () => {
  const { setDebugInfo, addToast } = useAppStore();
  const { listings: allListings, index: entityIndex } = useEntityIndex();
  const [buildingAssets, setBuildingAssets] = useState<BuildingAsset[]>([]);
  const {
    selectedListingId,
    setSelectedListingId,
    searchText,
    setSearchText,
    listingTypes,
    setListingTypes,
    selectedTags,
    setSelectedTags,
    filteredListings,
  } = useExplorerState(allListings);

  useEffect(() => {
    setDebugInfo({ label: 'Map View' });
  }, [setDebugInfo]);

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

  const handleListingSelect = (listingId: string) => {
    setSelectedListingId(listingId);
  };

  const handleCloseSidebar = () => {
    setSelectedListingId(null);
  };

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      addToast({ message: 'Geolocation is not supported by your browser.', type: 'error' });
      return;
    }
    addToast({ message: 'Finding your location...', type: 'info' });
    navigator.geolocation.getCurrentPosition(
      () => addToast({ message: 'Location found.', type: 'success' }),
      () => addToast({ message: 'Unable to retrieve your location.', type: 'error' }),
    );
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <FlatWorldMap
        listings={filteredListings}
        buildingAssets={buildingAssets}
        selectedId={selectedListingId}
        onSelect={handleListingSelect}
        className="absolute inset-0 h-full w-full"
      />

      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute bottom-6 left-6 top-6 w-[min(360px,calc(100vw-48px))]">
          <ExplorerDiscoveryRail
            variant="floating"
            listings={filteredListings}
            selectedListingId={selectedListingId}
            onSelectListing={handleListingSelect}
            searchText={searchText}
            onSearchTextChange={setSearchText}
            listingTypes={listingTypes}
            onListingTypesChange={setListingTypes}
            selectedTags={selectedTags}
            onSelectedTagsChange={setSelectedTags}
            onNearMe={handleNearMe}
          />
        </div>

        <aside className="pointer-events-auto absolute bottom-6 right-6 top-6 w-[min(420px,calc(100vw-48px))]" aria-label="Listing details">
          <ClubSidebar
            mode="floating"
            isOpen={selectedListingId !== null}
            onClose={handleCloseSidebar}
            selectedListingId={selectedListingId}
            listings={allListings}
            entityIndex={entityIndex ?? undefined}
          />
        </aside>
      </div>
    </div>
  );
};

export default EventBrowser;

import { useMemo } from 'react';
import type { Listing } from '../types';
import { useExplorerContext } from '../components/explorer/ExplorerProvider';
import { getListingPhysicalAddress } from '../lib/entityCompatibility';
import { useAppStore } from '../store/appStore';
import { eventOverlapsTimeLens, matchesExplorerAccessFilter } from '../lib/explorerFilters';

type ExplorerStateOptions = {
  idleLimit?: number;
};

export const useExplorerState = (
  listings: Listing[],
  { idleLimit }: ExplorerStateOptions = {},
) => {
  const explorer = useExplorerContext();
  const { timeLens } = useAppStore();
  const { searchText, listingTypes, selectedTags } = explorer;

  const filteredListings = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const filtered = listings.filter((listing) => {
      if (listingTypes.length && !listingTypes.includes(listing.type)) return false;
      const listingTags = listing.type === 'club' ? listing.generalAmenities : listing.tags;
      if (selectedTags.length && !selectedTags.every((filterId) => matchesExplorerAccessFilter(listing, filterId))) {
        return false;
      }
      if (!eventOverlapsTimeLens(listing, timeLens)) return false;
      if (!query) return true;
      const address = getListingPhysicalAddress(listing, { listings });
      return [
        listing.name,
        listing.location,
        address.city,
        address.region,
        address.country,
        ...listingTags,
      ].some((value) => value?.toLowerCase().includes(query));
    });

    const sorted = [...filtered].sort((a, b) => {
      if (a.type === 'event' && b.type === 'event') {
        return new Date(a.time.start).getTime() - new Date(b.time.start).getTime();
      }
      if (a.type === 'event') return -1;
      if (b.type === 'event') return 1;
      return 0;
    });

    const hasActiveControls = Boolean(query || listingTypes.length || selectedTags.length || timeLens.mode !== 'none');
    return idleLimit && !hasActiveControls ? sorted.slice(0, idleLimit) : sorted;
  }, [idleLimit, listingTypes, listings, searchText, selectedTags, timeLens]);

  return {
    ...explorer,
    filteredListings,
  };
};

import React, { useMemo, useState } from 'react';
import type { BuildingAsset, Listing, VenueData } from '../../types';
import type { AdminView } from './AdminPanel';
import AdminEntityIdentity from './AdminEntityIdentity';
import { brandMediaSourceLabel, resolveBrandLogo, type BrandMediaCatalog } from '../../lib/entityBrandMedia';
import * as api from '../../lib/api';
import { useAppStore } from '../../store/appStore';

type AdminManageVenuesProps = {
  venues: VenueData[];
  listings: Listing[];
  buildingAssets: BuildingAsset[];
  mediaCatalog: BrandMediaCatalog;
  setView: (view: AdminView) => void;
  onDataChange: () => void;
};

const formatFullAddress = (venue: VenueData) => [
  venue.address.addressLine1,
  venue.address.addressLine2,
  [venue.address.city, venue.address.region].filter(Boolean).join(', '),
  venue.address.postalCode,
  venue.address.country,
].filter(Boolean).join(', ');

const AdminManageVenues: React.FC<AdminManageVenuesProps> = ({ venues, listings, buildingAssets, mediaCatalog, setView, onDataChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { addToast } = useAppStore();
  const listingById = useMemo(() => new Map(listings.map((listing) => [listing.id, listing])), [listings]);
  const buildingByVenueId = useMemo(() => new Map(buildingAssets.filter((asset) => asset.venueId).map((asset) => [asset.venueId as string, asset])), [buildingAssets]);
  const buildingByListingId = useMemo(() => new Map(buildingAssets.map((asset) => [asset.listingId, asset])), [buildingAssets]);

  const getBuildingAsset = (venue: VenueData) => {
    if (venue.buildingAssetId) return buildingAssets.find((asset) => asset.id === venue.buildingAssetId) ?? null;
    const direct = buildingByVenueId.get(venue.id);
    if (direct) return direct;
    const sourceListingId = venue.id.startsWith('venue-') ? venue.id.slice('venue-'.length) : venue.id;
    const sourceListing = listingById.get(sourceListingId);
    if (sourceListing?.buildingAssetId) return buildingAssets.find((asset) => asset.id === sourceListing.buildingAssetId) ?? null;
    return buildingByListingId.get(sourceListingId) ?? null;
  };

  const filteredVenues = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return [...venues]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((venue) => {
        if (!query) return true;
        const haystack = [
          venue.name,
          venue.address.addressLine1,
          formatFullAddress(venue),
          venue.address.city,
          venue.address.region,
          venue.address.country,
          venue.visibility,
          venue.status,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      });
  }, [searchTerm, venues]);

  const handleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(filteredVenues.map((venue) => venue.id)) : new Set());
  };

  const handleBulkDelete = async () => {
    const venuesToDelete = venues.filter((venue) => selectedIds.has(venue.id));
    if (!venuesToDelete.length) return;

    const names = venuesToDelete.slice(0, 3).map((venue) => venue.name).join(', ');
    const suffix = venuesToDelete.length > 3 ? `, and ${venuesToDelete.length - 3} more` : '';
    if (!window.confirm(`Delete ${venuesToDelete.length} venue${venuesToDelete.length === 1 ? '' : 's'}? ${names}${suffix}. This cannot be undone.`)) return;

    try {
      await Promise.all(venuesToDelete.map((venue) => api.deleteVenue(venue.id)));
      setSelectedIds(new Set());
      addToast({ message: `${venuesToDelete.length} venue${venuesToDelete.length === 1 ? '' : 's'} deleted successfully.`, type: 'success' });
      onDataChange();
    } catch {
      addToast({ message: 'Failed to delete selected venues.', type: 'error' });
    }
  };

  const allFilteredSelected = filteredVenues.length > 0 && filteredVenues.every((venue) => selectedIds.has(venue.id));

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-4xl font-bold text-gray-800">Manage Venues</h1>
        <button
          type="button"
          onClick={() => setView('add-venue')}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          Add New Venue
        </button>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <input
          type="text"
          placeholder="Search venues..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-100 p-3">
          <span className="text-sm font-semibold text-blue-800">{selectedIds.size} selected</span>
          <button type="button" onClick={handleBulkDelete} className="text-sm font-semibold text-red-600 hover:text-red-800">
            Delete Selected
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-4">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={(event) => handleSelectAll(event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  aria-label="Select all visible venues"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Venue</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Location</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Visibility</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Building</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
              <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredVenues.map((venue) => {
              const buildingAsset = getBuildingAsset(venue);
              const fullAddress = formatFullAddress(venue);
              const media = resolveBrandLogo('venue', venue.id, mediaCatalog);
              return (
              <tr key={venue.id} className={`transition-colors duration-150 hover:bg-red-50/80 ${selectedIds.has(venue.id) ? 'bg-blue-50' : ''}`}>
                <td className="p-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(venue.id)}
                    onChange={() => handleSelect(venue.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    aria-label={`Select ${venue.name}`}
                  />
                </td>
                <td className="px-6 py-4"><AdminEntityIdentity name={venue.name} imageUrl={media.url} imageSourceLabel={brandMediaSourceLabel(media)} secondary={`/${venue.slug}`} /></td>
                <td className="min-w-[320px] px-6 py-4 text-sm text-gray-600">
                  {fullAddress || <span className="font-semibold text-red-600">No verified street address</span>}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${venue.visibility === 'private' ? 'bg-violet-100 text-violet-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {venue.visibility === 'private' ? 'Private' : 'Public exact'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm">
                  {buildingAsset ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">Linked</span> : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">None</span>}
                </td>
                <td className="whitespace-nowrap px-6 py-4"><span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold capitalize text-gray-700">{venue.status.replace('_', ' ')}</span></td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setView({ view: 'edit-venue', venueId: venue.id })}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    Edit
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {!filteredVenues.length && <p className="p-4 text-center text-gray-500">No venues found.</p>}
      </div>
    </div>
  );
};

export default AdminManageVenues;


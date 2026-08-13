// TODO: This component currently renders the 3D globe-style map.
// Later, we will split this into:
// - Globe3D.tsx (Mapbox globe projection)
// - Map2D.tsx (Mapbox mercator projection)
// For now, this remains a mock 3D-style map until the real globe is wired in.

import React, { useState, useEffect } from 'react';
import type { Listing } from '../types';
import { getListingPhysicalAddress } from '../lib/entityCompatibility';

type Region = 'WORLD' | 'USA' | 'EUROPE' | 'OCEANIA';
const REGIONS: Region[] = ['WORLD', 'USA', 'EUROPE', 'OCEANIA'];

// FIX: Corrected property access from `l.country` to `l.geopoint.address.country` to match the Listing type definition.
// Also updated country names to align with the provided mock data (e.g., 'USA' instead of 'United States').
const regionMatchers: Record<Region, (l: Listing) => boolean> = {
  WORLD: () => true,
  USA: (l) => (getListingPhysicalAddress(l).country ?? '').toLowerCase() === 'usa',
  EUROPE: (l) =>
    ['spain', 'united kingdom', 'france', 'germany', 'italy'].includes(
      (getListingPhysicalAddress(l).country ?? '').toLowerCase(),
    ),
  OCEANIA: (l) =>
    ['new zealand', 'australia'].includes((getListingPhysicalAddress(l).country ?? '').toLowerCase()),
};

export type Map3DProps = {
  listings: Listing[];
  selectedId?: string | null;
  hoveredId?: string | null;
  onSelect: (listing: Listing) => void;
  onHover?: (id: string | null) => void;
  onViewportChange: (inViewListings: Listing[]) => void;
  onMoveEnd?: () => void; // trigger “Redo search”
};

// --- Sub-components ---

const MockPin: React.FC<{
  listing: Listing;
  isHovered: boolean;
  isSelected: boolean;
  onHover?: (id: string | null) => void;
  onSelect: (listing: Listing) => void;
}> = ({ listing, isHovered, isSelected, onHover, onSelect }) => {
  if (!listing.mockXY) return null;

  const baseSize = isSelected ? 12 : 8;
  const glowOpacity = isHovered || isSelected ? 0.75 : 0.3;
  const color =
    isHovered || isSelected
      ? '#ff4d5e'
      : listing.type === 'club'
      ? '#ef4444'
      : '#3b82f6';

  const ringClass = isSelected
    ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-white'
    : isHovered
    ? 'ring-2 ring-offset-2 ring-offset-gray-900 ring-red-400'
    : '';

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-200"
      style={{
        left: `${listing.mockXY.x}%`,
        top: `${listing.mockXY.y}%`,
        zIndex: isHovered || isSelected ? 10 : 1,
      }}
      onPointerEnter={() => onHover?.(listing.id)}
      onPointerLeave={() => onHover?.(null)}
      onClick={() => onSelect(listing)}
      aria-label={`${listing.type}: ${listing.name}`}
    >
      <div
        className={`relative rounded-full transition-all duration-200 ${ringClass}`}
        style={{ width: `${baseSize}px`, height: `${baseSize}px`, backgroundColor: color }}
      >
        <div
          className="absolute inset-0 rounded-full blur-md transition-opacity duration-300"
          style={{ opacity: glowOpacity, backgroundColor: color, transform: 'scale(1.5)' }}
        />
      </div>
    </div>
  );
};

// FIX: Replaced the empty placeholder with an actual SVG world map for visual context.
const WorldMapSvg: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 2000 1001"
    className="absolute inset-0 w-full h-full object-contain opacity-20"
    aria-hidden="true"
    fill="#4a4a4a"
  >
    {/* FIX: Corrected a syntax error in the SVG path data which was causing a cascade of parsing errors. The string for the 'd' attribute was not properly closed. */}
    <path d="M1001.1 43.1l-1.2-1-3.6-2.9c-2-1.6-4.9-2.9-7.8-3.9-3.4-1.2-6.9-2-10.4-2.6-4.6-.7-9.3-1.1-14-1.1-4.7 0-9.3.3-13.8 1-4.5.6-8.9 1.5-13.2 2.6-4.3 1.1-8.4 2.5-12.4 4.2-4 1.7-7.8 3.7-11.4 5.9-3.6 2.3-7 4.8-10.1 7.6-3.1 2.8-6 5.8-8.6 9.1-2.6 3.3-5 6.8-6.9 10.5-2 3.7-3.5 7.6-4.6 11.6-1.1 4-1.8 8.1-2.1 12.2-.3 4.1-.3 8.2 0 12.3.3 4.1 1 8.2 2.1 12.2s2.6 7.8 4.6 11.5c1.9 3.7 4.3 7.2 6.9 10.5 2.6 3.3 5.5 6.3 8.6 9.1s6.5 5.3 10.1 7.6c3.6 2.3 7.4 4.2 11.4 5.9 4 1.7 8.1 3.1 12.4 4.2 4.3 1.1 8.7 2 13.2 2.6 4.5.7 9.1 1 13.8 1 4.7 0 9.4-.4 14-1.1 3.5-.6 7-1.4 10.4-2.6 2.9-1 5.8-2.3 7.8-3.9l3.6-2.9 1.2-1z M1781.9 1000.1l-1.3-1.8-1-1.2-1.8-1.4c-.6-.5-1.3-1-2-1.6-2-1.6-4.2-3.3-6.4-5.2-4.5-3.8-8.9-8-13.2-12.5-4.2-4.5-8.3-9.3-12.2-14.3-3.8-5-7.5-10.2-10.8-15.6-3.3-5.4-6.3-11-8.9-16.7-2.6-5.7-4.9-11.6-6.7-17.5-1.8-6-3.2-12-4.1-18.1-.9-6.1-1.4-12.2-1.4-18.4s.5-12.3 1.4-18.4c.9-6.1 2.3-12.1 4.1-18.1 1.8-6 3.9-11.8 6.7-17.5 2.6-5.7 5.3-11.3 8.9-16.7 3.3-5.4 6.9-10.6 10.8-15.6 3.8-5 7.9-9.8 12.2-14.3 4.2-4.5 8.7-8.7 13.2-12.5 2.2-1.9 4.4-3.6 6.4-5.2.7-.5 1.4-1.1 2-1.6l1.8-1.4 1-1.2 1.3-1.8z M500.9 990.1l-1.3.8-1.7.5-1.9.3c-.6 0-1.3.1-1.9.1-3.8.3-7.6.2-11.4-.2-7.6-.8-15.1-2.3-22.4-4.5-7.3-2.2-14.5-5.1-21.4-8.7-6.9-3.6-13.6-7.8-19.9-12.7-6.3-4.9-12.3-10.4-17.9-16.5-5.6-6.1-10.8-12.7-15.5-19.9-4.7-7.1-8.9-14.7-12.5-22.7-3.6-8-6.7-16.4-9.2-25-2.5-8.6-4.5-17.4-5.8-26.3-1.3-8.9-2-17.9-2" />
  </svg>
);

const Map3D: React.FC<Map3DProps> = ({
  listings,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onViewportChange,
  onMoveEnd,
}) => {
  const [currentRegion, setCurrentRegion] = useState<Region>('WORLD');

  useEffect(() => {
    const listingsInView = listings.filter(regionMatchers[currentRegion]);
    onViewportChange(listingsInView);
  }, [listings, currentRegion, onViewportChange]);

  return (
    <div className="relative w-full h-full bg-gray-900 overflow-hidden">
      <WorldMapSvg />
      {listings.filter(regionMatchers[currentRegion]).map((listing) => (
        <MockPin
          key={listing.id}
          listing={listing}
          isHovered={hoveredId === listing.id}
          isSelected={selectedId === listing.id}
          onHover={onHover}
          onSelect={onSelect}
        />
      ))}
      <div className="absolute bottom-4 left-4 z-10 bg-black/50 p-1.5 rounded-lg flex gap-1">
        {REGIONS.map((region) => (
          <button
            key={region}
            onClick={() => {
              setCurrentRegion(region);
              onMoveEnd?.();
            }}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
              currentRegion === region
                ? 'bg-red-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {region}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Map3D;

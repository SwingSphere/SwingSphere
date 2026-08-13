import React from 'react';
import type { Listing } from '../types';
import { ResultCard } from './ResultCard';
import Button from './Button';

type ResultsListProps = {
  listings: Listing[];
  onHover: (id: string | null) => void;
  onSelect: (listing: Listing) => void;
  hoveredId: string | null;
  selectedId: string | null;
  isLoading: boolean;
};

const SkeletonCard: React.FC = () => (
    <div className="bg-gray-900/50 rounded-lg border border-gray-800 flex gap-4 p-3 animate-pulse">
        <div className="w-24 h-24 md:w-32 md:h-32 bg-gray-800 rounded-md flex-shrink-0"></div>
        <div className="flex flex-col flex-grow min-w-0">
            <div className="h-4 bg-gray-800 rounded w-1/4"></div>
            <div className="h-6 bg-gray-700 rounded w-3/4 mt-2"></div>
            <div className="h-4 bg-gray-800 rounded w-1/2 mt-2"></div>
            <div className="mt-auto pt-2 flex gap-1.5">
                <div className="h-6 w-16 bg-gray-700 rounded-full"></div>
                <div className="h-6 w-16 bg-gray-700 rounded-full"></div>
            </div>
        </div>
    </div>
)

export const ResultsList: React.FC<ResultsListProps> = ({ listings, onHover, onSelect, hoveredId, selectedId, isLoading }) => {
  if (isLoading) {
    return (
        <div className="p-2 md:p-4 space-y-2 md:space-y-4">
            {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
    );
  }
  
  if (listings.length === 0) {
    return (
      <div className="text-center p-8">
        <h3 className="text-xl font-bold text-white mb-2">No Results Found</h3>
        <p className="text-gray-400 mb-4">
          Try moving the map or clearing your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="p-2 md:p-4 space-y-2 md:space-y-4">
      <div className="flex justify-between items-center mb-2 px-2 md:px-0">
        <p className="text-sm text-gray-400">{listings.length} results in view</p>
        <select className="bg-gray-800 border border-gray-700 text-sm rounded-md py-1 px-2 text-white focus:ring-2 focus:ring-red-500 focus:outline-none">
          <option>Sort by Distance</option>
          <option>Sort by Newest</option>
        </select>
      </div>
      {listings.map(listing => (
        <ResultCard 
            key={listing.id} 
            listing={listing} 
            onPointerEnter={() => onHover(listing.id)}
            onPointerLeave={() => onHover(null)}
            onClick={() => onSelect(listing)}
            isHovered={hoveredId === listing.id}
            isSelected={selectedId === listing.id}
        />
      ))}
    </div>
  );
};

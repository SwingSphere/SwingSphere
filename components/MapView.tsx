import React, { useState } from 'react';
import type { Listing } from '../types';
import { getListingImageUrl, handleListingImageError } from '../lib/listingImage';
import { getListingDisplayCoords } from '../lib/explorerMarkers';

type MapViewProps = {
  listings: Listing[];
  center: { lat: number; lng: number };
};

const MAP_BOUNDS = {
  minLat: 24, maxLat: 50, // Expanded US bounds
  minLng: -125, maxLng: -66,
};

const MapPin: React.FC<{ listing: Listing; x: number; y: number; onSelect: (l: Listing) => void; isSelected: boolean }> = ({ listing, x, y, onSelect, isSelected }) => {
    const color = listing.type === 'club' ? 'bg-red-600' : 'bg-blue-500';
    const zIndex = isSelected ? 10 : 1;
    return (
        <div 
            className="absolute -translate-x-1/2 -translate-y-full cursor-pointer" 
            style={{ left: `${x}%`, top: `${y}%`, zIndex }}
            onClick={() => onSelect(listing)}
        >
            <div className={`w-4 h-4 rounded-full ${color} border-2 border-white/80`}></div>
            <div className={`w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 ${color} mx-auto`}></div>
        </div>
    );
}

const InfoPopup: React.FC<{ listing: Listing, onClose: () => void }> = ({ listing, onClose }) => (
    <div className="absolute top-4 left-4 z-20 bg-gray-800/80 backdrop-blur-md rounded-lg shadow-lg p-3 w-64 border border-gray-700">
        <button onClick={onClose} className="absolute top-1 right-1 text-gray-400 hover:text-white">&times;</button>
        <img src={getListingImageUrl(listing)} onError={handleListingImageError} alt={listing.name} className="w-full h-24 object-cover rounded-md mb-2"/>
        <h3 className="font-bold text-white">{listing.name}</h3>
        <p className="text-sm text-gray-400">{listing.location}</p>
    </div>
);


export const MapView: React.FC<MapViewProps> = ({ listings, center }) => {
    const [selected, setSelected] = useState<Listing | null>(null);

    const convertGeoToPixels = (lat: number, lng: number) => {
        const x = ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * 100;
        const y = ((MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * 100;
        return { x, y };
    };

    return (
        <div className="w-full h-full bg-gray-900 relative overflow-hidden">
            {/* This is a decorative, non-interactive map background */}
            <div className="absolute inset-0 bg-map-pattern opacity-10" style={{
                backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
            }}></div>
            
            {selected && <InfoPopup listing={selected} onClose={() => setSelected(null)} />}

            {listings.map(listing => {
                const coords = getListingDisplayCoords(listing, { listings });
                if (!coords) return null;
                const { x, y } = convertGeoToPixels(coords.lat, coords.lng);
                // Simple check to only render pins within the viewport
                if (x < 0 || x > 100 || y < 0 || y > 100) return null;
                
                return (
                    <MapPin 
                        key={listing.id} 
                        listing={listing} 
                        x={x} y={y} 
                        onSelect={setSelected}
                        isSelected={selected?.id === listing.id}
                    />
                );
            })}
        </div>
    );
};

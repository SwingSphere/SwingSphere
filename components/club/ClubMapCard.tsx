import React, { useState } from 'react';
import { Copy, MapPinned } from 'lucide-react';
import MiniMapHybrid from '../maps/MiniMapHybrid';
import { getStreetViewPath, hasStreetViewForListing } from '../../lib/streetViewAvailability';

type ClubMapCardProps = {
  listingId: string;
  clubName: string;
  addressText?: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  isPrivateLocation?: boolean;
  showDirections?: boolean;
};

const formatCoord = (value: number) => Number(value.toFixed(2));

const ClubMapCard: React.FC<ClubMapCardProps> = ({
  listingId,
  clubName,
  addressText,
  city,
  region,
  lat,
  lng,
  isPrivateLocation = false,
  showDirections = true,
}) => {
  const [copied, setCopied] = useState(false);
  const mapLat = isPrivateLocation ? formatCoord(lat) : lat;
  const mapLng = isPrivateLocation ? formatCoord(lng) : lng;
  const mapLabel = [city, region].filter(Boolean).join(', ') || 'Location';
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${mapLat},${mapLng}`)}`;
  const appleUrl = `https://maps.apple.com/?ll=${mapLat},${mapLng}&q=${encodeURIComponent(clubName)}`;
  const geoUrl = `geo:${mapLat},${mapLng}?q=${encodeURIComponent(`${clubName} ${mapLabel}`)}`;
  const streetViewAvailable = !isPrivateLocation && hasStreetViewForListing(listingId);

  const copyAddress = async () => {
    if (!addressText || !navigator.clipboard) return;
    await navigator.clipboard.writeText(addressText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <h2 className="text-base font-semibold text-gray-100">Location & Directions</h2>
      <p className="mt-1 text-xs text-gray-500">
        {isPrivateLocation ? 'Approximate location shown.' : streetViewAvailable ? 'Explore the venue surroundings, then open directions when you are ready to go.' : 'Venue location and quick map links.'}
      </p>
      {!isPrivateLocation && addressText ? (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
          <p className="min-w-0 text-xs leading-5 text-gray-300">{addressText}</p>
          <button type="button" onClick={() => void copyAddress()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-gray-300 hover:border-white/[0.14] hover:text-white" aria-label={`Copy ${clubName} address`}>
            <Copy size={12} />{copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      ) : null}
      {isPrivateLocation ? (
        <p className="mt-2 text-xs leading-5 text-gray-400">
          Exact address is shared by the organizer, venue, or approved guests.
        </p>
      ) : null}

      <div className="mt-3 h-52 overflow-hidden rounded-xl border border-gray-800">
        <MiniMapHybrid
          center={{ lat: mapLat, lng: mapLng }}
          cityLabel={city || clubName}
          districtLabel={region}
          mapHref={googleUrl}
          isHidden={isPrivateLocation}
          showAttributionText={false}
        />
      </div>

      {streetViewAvailable ? (
        <a
          href={getStreetViewPath(listingId)}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-300/30 bg-red-500/90 px-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(197,29,52,0.18)] hover:bg-red-500"
        >
          <MapPinned size={16} />View on Map
        </a>
      ) : null}

      {showDirections ? (
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-gray-700 bg-black/30 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-600 hover:text-gray-200"
        >
          Google Maps
        </a>
        <a
          href={appleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-gray-700 bg-black/30 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-600 hover:text-gray-200"
        >
          Apple Maps
        </a>
        <a
          href={geoUrl}
          className="rounded-md border border-gray-700 bg-black/30 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-600 hover:text-gray-200"
        >
          Open in Maps
        </a>
      </div>
      ) : null}
    </section>
  );
};

export default ClubMapCard;

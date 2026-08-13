import React from 'react';
import MiniMapHybrid from '../maps/MiniMapHybrid';

type ClubMapCardProps = {
  clubName: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  isPrivateLocation?: boolean;
  showDirections?: boolean;
};

const formatCoord = (value: number) => Number(value.toFixed(2));

const ClubMapCard: React.FC<ClubMapCardProps> = ({
  clubName,
  city,
  region,
  lat,
  lng,
  isPrivateLocation = false,
  showDirections = true,
}) => {
  const mapLat = isPrivateLocation ? formatCoord(lat) : lat;
  const mapLng = isPrivateLocation ? formatCoord(lng) : lng;
  const mapLabel = [city, region].filter(Boolean).join(', ') || 'Location';
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${mapLat},${mapLng}`)}`;
  const appleUrl = `https://maps.apple.com/?ll=${mapLat},${mapLng}&q=${encodeURIComponent(clubName)}`;
  const geoUrl = `geo:${mapLat},${mapLng}?q=${encodeURIComponent(`${clubName} ${mapLabel}`)}`;

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <h2 className="text-base font-semibold text-gray-100">Location & Directions</h2>
      <p className="mt-1 text-xs text-gray-500">
        {isPrivateLocation ? 'Approximate location shown.' : 'Venue location and quick map links.'}
      </p>
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

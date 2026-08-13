import React from 'react';
import MiniMapHybrid from '../maps/MiniMapHybrid';
import TrackedExternalLink from '../analytics/TrackedExternalLink';
import { trackOutboundClick } from '../../lib/analytics/outboundTracking';

type EventMapCardProps = {
  eventId: string;
  eventName: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  isPrivateLocation: boolean;
  organizationId?: string;
  eventSeriesId?: string;
  placementPrefix: string;
};

const roundApprox = (value: number) => Number(value.toFixed(2));

const EventMapCard: React.FC<EventMapCardProps> = ({
  eventId,
  eventName,
  city,
  region,
  lat,
  lng,
  isPrivateLocation,
  organizationId,
  eventSeriesId,
  placementPrefix,
}) => {
  const mapLat = isPrivateLocation ? roundApprox(lat) : lat;
  const mapLng = isPrivateLocation ? roundApprox(lng) : lng;
  const mapLabel = [city, region].filter(Boolean).join(', ') || 'Location';
  const effectiveLabel = isPrivateLocation ? 'Private location / disclosed after RSVP' : mapLabel;

  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${mapLat},${mapLng}`)}`;
  const appleUrl = `https://maps.apple.com/?ll=${mapLat},${mapLng}&q=${encodeURIComponent(eventName)}`;
  const geoUrl = `geo:${mapLat},${mapLng}?q=${encodeURIComponent(`${eventName} ${mapLabel}`)}`;
  const trackingBase = {
    entityType: 'event' as const,
    entityId: eventId,
    organizationId,
    eventSeriesId,
    destinationType: 'directions' as const,
    surface: 'entity_page' as const,
  };

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <h2 className="text-base font-semibold text-gray-100">Location & Directions</h2>
      <p className="mt-1 text-xs text-gray-500">{effectiveLabel}</p>

      <div className="mt-3 h-52 overflow-hidden rounded-xl border border-gray-800">
        <MiniMapHybrid
          center={{ lat: mapLat, lng: mapLng }}
          cityLabel={city || eventName}
          districtLabel={region}
          mapHref={googleUrl}
          onMapLinkClick={(event) => {
            void trackOutboundClick(googleUrl, { ...trackingBase, placement: `${placementPrefix}_map` }, event.detail === 0 ? 'keyboard' : 'click');
          }}
          onMapLinkAuxClick={() => {
            void trackOutboundClick(googleUrl, { ...trackingBase, placement: `${placementPrefix}_map` }, 'auxclick');
          }}
          isHidden={isPrivateLocation}
          showAttributionText={false}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <TrackedExternalLink
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          tracking={{ ...trackingBase, placement: `${placementPrefix}_google` }}
          className="rounded-md border border-gray-700 bg-black/30 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-600 hover:text-gray-200"
        >
          Google Maps
        </TrackedExternalLink>
        <TrackedExternalLink
          href={appleUrl}
          target="_blank"
          rel="noopener noreferrer"
          tracking={{ ...trackingBase, placement: `${placementPrefix}_apple` }}
          className="rounded-md border border-gray-700 bg-black/30 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-600 hover:text-gray-200"
        >
          Apple Maps
        </TrackedExternalLink>
        <TrackedExternalLink
          href={geoUrl}
          tracking={{ ...trackingBase, destinationDomain: 'device-maps.local', placement: `${placementPrefix}_device` }}
          className="rounded-md border border-gray-700 bg-black/30 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-600 hover:text-gray-200"
        >
          Open in Maps
        </TrackedExternalLink>
      </div>
    </section>
  );
};

export default EventMapCard;

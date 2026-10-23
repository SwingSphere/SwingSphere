import React, { useState } from 'react';
import { Copy, MapPinned } from 'lucide-react';
import { getStreetViewPath } from '../../lib/streetViewAvailability';
import TrackedExternalLink from '../analytics/TrackedExternalLink';
import { trackOutboundClick } from '../../lib/analytics/outboundTracking';

const MiniMapHybrid = React.lazy(() => import('../maps/MiniMapHybrid'));

type EventMapCardProps = {
  eventId: string;
  eventName: string;
  addressText?: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  isPrivateLocation: boolean;
  streetViewListingId?: string | null;
  organizationId?: string;
  eventSeriesId?: string;
  placementPrefix: string;
};

const roundApprox = (value: number) => Number(value.toFixed(2));

const EventMapCard: React.FC<EventMapCardProps> = ({
  eventId,
  eventName,
  addressText,
  city,
  region,
  lat,
  lng,
  isPrivateLocation,
  streetViewListingId,
  organizationId,
  eventSeriesId,
  placementPrefix,
}) => {
  const [copied, setCopied] = useState(false);
  const mapLat = isPrivateLocation ? roundApprox(lat) : lat;
  const mapLng = isPrivateLocation ? roundApprox(lng) : lng;
  const mapLabel = [city, region].filter(Boolean).join(', ') || 'Location';
  const effectiveLabel = isPrivateLocation
    ? `${mapLabel} · Approximate area shown`
    : mapLabel;

  const queryTarget = !isPrivateLocation && addressText ? addressText : `${mapLat},${mapLng}`;
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryTarget)}`;
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

  const copyAddress = async () => {
    if (!addressText || !navigator.clipboard) return;
    await navigator.clipboard.writeText(addressText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <h2 className="text-base font-semibold text-gray-100">Location & Directions</h2>
      <p className="mt-1 text-xs text-gray-500">{effectiveLabel}</p>

      {!isPrivateLocation && addressText ? (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
          <p className="min-w-0 text-xs leading-5 text-gray-300">{addressText}</p>
          <button
            type="button"
            onClick={() => void copyAddress()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-gray-300 hover:border-white/[0.14] hover:text-white"
            aria-label={`Copy ${eventName} address`}
          >
            <Copy size={12} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      ) : null}
      {isPrivateLocation ? (
        <p className="mt-2 text-xs leading-5 text-gray-400">
          Exact address is shared with approved or ticketed guests after RSVP.
        </p>
      ) : null}

      <div className="mt-3 h-52 overflow-hidden rounded-xl border border-gray-800">
        <React.Suspense fallback={<div className="h-full w-full bg-gray-950/60" />}>
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
        </React.Suspense>
      </div>

      {!isPrivateLocation && streetViewListingId ? (
        <a
          href={getStreetViewPath(streetViewListingId)}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-300/30 bg-red-500/90 px-4 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(197,29,52,0.18)] hover:bg-red-500"
        >
          <MapPinned size={16} />Street View
        </a>
      ) : null}

      {!isPrivateLocation ? (
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
      ) : null}
    </section>
  );
};

export default EventMapCard;

import type { GlobeV1RuntimeEvent } from '../data/globeV1MockData';
import type { CruiseSailingData, CruiseSeriesData, ResortData } from '../types';
import type { DiscoveryPoint } from './discoveryPointAdapter';
import { resolveCountryIsoCodes } from './globeEntityAdapter';
import { buildCruiseMarkers, buildResortMarkers } from './travelMarkerModel';

export const adaptTravelToGlobeEvents = (
  resorts: ResortData[],
  series: CruiseSeriesData[],
  sailings: CruiseSailingData[],
): GlobeV1RuntimeEvent[] => {
  const resortEvents = buildResortMarkers(resorts).map((marker) => {
    const country = marker.resort?.geopoint.address.country;
    const codes = resolveCountryIsoCodes(country);
    return {
      id: `travel:${marker.id}`,
      name: marker.name,
      entityType: 'resort' as const,
      lat: marker.latitude,
      lon: marker.longitude,
      countryIso2: codes.iso2,
      countryIso3: codes.iso3,
      listingId: marker.id,
      travelSlug: marker.resort?.slug,
      travelSubtitle: marker.subtitle,
    } satisfies GlobeV1RuntimeEvent;
  });

  const cruiseEvents = buildCruiseMarkers(series, sailings).map((marker) => {
    const country = marker.sailing?.departurePort.country;
    const codes = resolveCountryIsoCodes(country);
    return {
      id: `travel:${marker.id}`,
      name: marker.name,
      entityType: 'cruise' as const,
      lat: marker.latitude,
      lon: marker.longitude,
      countryIso2: codes.iso2,
      countryIso3: codes.iso3,
      listingId: marker.id,
      travelSlug: marker.cruiseSeries?.slug,
      travelSubtitle: marker.subtitle,
    } satisfies GlobeV1RuntimeEvent;
  });

  return [...resortEvents, ...cruiseEvents];
};

export const adaptTravelToDiscoveryPoints = (
  resorts: ResortData[],
  series: CruiseSeriesData[],
  sailings: CruiseSailingData[],
): DiscoveryPoint[] => {
  const resortPoints: DiscoveryPoint[] = buildResortMarkers(resorts).map((marker) => ({
    id: `travel:${marker.id}`,
    latitude: marker.latitude,
    longitude: marker.longitude,
    listingIds: [marker.id],
    clubIds: [],
    eventIds: [],
    hostIds: [],
    city: marker.resort?.geopoint.address.city ?? '',
    region: marker.resort?.geopoint.address.region ?? '',
    country: marker.resort?.geopoint.address.country ?? '',
    listingName: marker.name,
    logoImageUrl: marker.resort?.logoImageUrl,
  }));

  const cruisePoints: DiscoveryPoint[] = buildCruiseMarkers(series, sailings).map((marker) => ({
    id: `travel:${marker.id}`,
    latitude: marker.latitude,
    longitude: marker.longitude,
    listingIds: [marker.id],
    clubIds: [],
    eventIds: [],
    hostIds: [],
    city: marker.sailing?.departurePort.city ?? marker.sailing?.departurePort.portName ?? '',
    region: '',
    country: marker.sailing?.departurePort.country ?? '',
    listingName: marker.name,
    logoImageUrl: marker.sailing?.logoImageUrl ?? marker.cruiseSeries?.logoImageUrl,
  }));

  return [...resortPoints, ...cruisePoints];
};

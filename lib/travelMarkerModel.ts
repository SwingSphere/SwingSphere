import type { CruiseSailingData, CruiseSeriesData, ResortData } from '../types';

export type TravelMarker = {
  id: string;
  entityType: 'resort' | 'cruise';
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  color: 'emerald' | 'violet';
  geometry: 'palm' | 'ship';
  resort?: ResortData;
  cruiseSeries?: CruiseSeriesData;
  sailing?: CruiseSailingData;
};

export const VERIFIED_RESORT_PUBLIC_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  'resort-hedonism-ii-negril': { latitude: 18.33796, longitude: -78.34086 },
  'resort-paradise-lakes-resort': { latitude: 28.1839, longitude: -82.4637 },
  'resort-the-kraken-resort': { latitude: 30.9416, longitude: -95.3789 },
  'resort-desire-riviera-maya': { latitude: 20.9168, longitude: -86.8475 },
  'resort-desire-pearl-riviera-maya': { latitude: 20.8581, longitude: -86.8719 },
  'resort-hidden-beach-au-naturel': { latitude: 20.4283, longitude: -87.2886 },
};

export const resolveResortPublicCoordinates = (
  resort: ResortData,
): { latitude: number; longitude: number } | null => {
  if (resort.locationVisibility === 'private' || resort.locationVisibility === 'approximate') {
    return null;
  }
  const directLat = resort.geopoint?.latitude;
  const directLng = resort.geopoint?.longitude;
  if (
    typeof directLat === 'number'
    && Number.isFinite(directLat)
    && typeof directLng === 'number'
    && Number.isFinite(directLng)
    && !(directLat === 0 && directLng === 0)
  ) {
    return { latitude: directLat, longitude: directLng };
  }
  return VERIFIED_RESORT_PUBLIC_COORDINATES[resort.id] ?? null;
};

export const buildResortMarkers = (resorts: ResortData[]): TravelMarker[] => resorts
  .filter((resort) => resort.status === 'approved' || resort.status === 'active')
  .flatMap((resort) => {
    const coords = resolveResortPublicCoordinates(resort);
    if (!coords) return [];
    const hydratedResort: ResortData = (
      resort.geopoint?.latitude === coords.latitude
      && resort.geopoint?.longitude === coords.longitude
    )
      ? resort
      : {
          ...resort,
          geopoint: {
            ...resort.geopoint,
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
        };
    return [{
      id: resort.id,
      entityType: 'resort' as const,
      name: resort.name,
      subtitle: resort.accommodationSummary,
      latitude: coords.latitude,
      longitude: coords.longitude,
      color: 'emerald' as const,
      geometry: 'palm' as const,
      resort: hydratedResort,
    }];
  });

export const buildCruiseMarkers = (
  series: CruiseSeriesData[],
  sailings: CruiseSailingData[],
): TravelMarker[] => {
  const seriesById = new Map(series.map((entry) => [entry.id, entry]));
  const nextBySeries = new Map<string, CruiseSailingData>();
  [...sailings]
    .filter((sailing) => sailing.status === 'approved' || sailing.status === 'active')
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .forEach((sailing) => {
      if (!nextBySeries.has(sailing.cruiseSeriesId) && Date.parse(sailing.endsAt) >= Date.now()) {
        nextBySeries.set(sailing.cruiseSeriesId, sailing);
      }
    });

  return [...nextBySeries.values()].flatMap((sailing) => {
    const cruiseSeries = seriesById.get(sailing.cruiseSeriesId);
    const latitude = sailing.departurePort.latitude;
    const longitude = sailing.departurePort.longitude;
    if (!cruiseSeries || latitude === undefined || longitude === undefined) return [];

    const nextPort = sailing.itinerary.find((port) =>
      port.id !== sailing.departurePort.id
      && Number.isFinite(port.latitude)
      && Number.isFinite(port.longitude),
    );
    const deltaLat = nextPort ? (nextPort.latitude! - latitude) : 0;
    const deltaLon = nextPort ? (nextPort.longitude! - longitude) : 1;
    const vectorLength = Math.hypot(deltaLat, deltaLon) || 1;
    const offshoreDistanceDeg = 0.085;
    const markerLatitude = latitude + (deltaLat / vectorLength) * offshoreDistanceDeg;
    const markerLongitude = longitude + (deltaLon / vectorLength) * offshoreDistanceDeg;

    return [{
      id: sailing.id,
      entityType: 'cruise' as const,
      name: cruiseSeries.name,
      subtitle: `${sailing.durationNights} nights · ${sailing.departurePort.city ?? sailing.departurePort.portName}`,
      latitude: markerLatitude,
      longitude: markerLongitude,
      color: 'violet' as const,
      geometry: 'ship' as const,
      cruiseSeries,
      sailing,
    }];
  });
};

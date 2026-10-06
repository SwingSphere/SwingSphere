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

export const buildResortMarkers = (resorts: ResortData[]): TravelMarker[] => resorts
  .filter((resort) => resort.status === 'approved' || resort.status === 'active')
  .map((resort) => ({
    id: resort.id,
    entityType: 'resort',
    name: resort.name,
    subtitle: resort.accommodationSummary,
    latitude: resort.geopoint.latitude,
    longitude: resort.geopoint.longitude,
    color: 'emerald',
    geometry: 'palm',
    resort,
  }));

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

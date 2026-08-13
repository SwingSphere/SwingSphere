import type { CruiseSailingData, CruiseSeriesData, ResortData } from '../types';

export type TravelMarker = {
  id: string;
  entityType: 'resort' | 'cruise';
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  color: 'violet' | 'cyan';
  geometry: 'pavilion' | 'ship';
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
    color: 'violet',
    geometry: 'pavilion',
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
    return [{
      id: sailing.id,
      entityType: 'cruise' as const,
      name: cruiseSeries.name,
      subtitle: `${sailing.durationNights} nights · ${sailing.departurePort.city ?? sailing.departurePort.portName}`,
      latitude,
      longitude,
      color: 'cyan' as const,
      geometry: 'ship' as const,
      cruiseSeries,
      sailing,
    }];
  });
};

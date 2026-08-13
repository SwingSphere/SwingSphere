import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import type { Listing } from '../../types';
import { getListingPhysicalCityLabel, type EntityCollections } from '../../lib/entityCompatibility';
import { buildExplorerMarkers, getListingDisplayCoords } from '../../lib/explorerMarkers';
import {
  getApproximateLocationCenter,
  getApproximateRadiusMeters,
  getPublicLocationLabel,
  isApproximateLocation,
} from '../../lib/publicLocation';

type ListingProperties = {
  listingId: string;
  labelTitle: string;
  labelSubtitle: string;
};

type ApproximateListingProperties = ListingProperties & {
  radiusMeters: number;
};

export const listingsToGeoJson = (
  listings: Listing[],
  collections: EntityCollections = {},
): FeatureCollection<Point, ListingProperties> => ({
  type: 'FeatureCollection',
  features: buildExplorerMarkers(listings.filter((listing) => !isApproximateLocation(listing)), collections).map((marker): Feature<Point, ListingProperties> => {
    const listing = listings.find((candidate) => candidate.id === marker.listingId);
    return {
      type: 'Feature',
      id: marker.listingId,
      properties: {
        listingId: marker.listingId,
        labelTitle: listing?.name ?? marker.listingId,
        labelSubtitle: listing ? getListingPhysicalCityLabel(listing, collections) : '',
      },
      geometry: { type: 'Point', coordinates: [marker.lng, marker.lat] },
    };
  }),
});

const makeCirclePolygon = (
  center: { longitude: number; latitude: number },
  radiusMeters: number,
  steps = 96,
): Polygon => {
  const earthRadiusMeters = 6371008.8;
  const lat = (center.latitude * Math.PI) / 180;
  const lng = (center.longitude * Math.PI) / 180;
  const angularDistance = radiusMeters / earthRadiusMeters;
  const coordinates: number[][] = [];

  for (let i = 0; i <= steps; i += 1) {
    const bearing = (2 * Math.PI * i) / steps;
    const pointLat = Math.asin(
      Math.sin(lat) * Math.cos(angularDistance) +
        Math.cos(lat) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLng =
      lng +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat),
        Math.cos(angularDistance) - Math.sin(lat) * Math.sin(pointLat),
      );
    coordinates.push([(pointLng * 180) / Math.PI, (pointLat * 180) / Math.PI]);
  }

  return {
    type: 'Polygon',
    coordinates: [coordinates],
  };
};

export const approximateListingsToGeoJson = (
  listings: Listing[],
  collections: EntityCollections = {},
): FeatureCollection<Polygon, ApproximateListingProperties> => ({
  type: 'FeatureCollection',
  features: listings.flatMap((listing): Array<Feature<Polygon, ApproximateListingProperties>> => {
    if (!isApproximateLocation(listing)) return [];
    const center = getApproximateLocationCenter(listing, collections);
    if (!center) return [];
    const radiusMeters = getApproximateRadiusMeters(listing);
    return [{
      type: 'Feature',
      id: listing.id,
      properties: {
        listingId: listing.id,
        labelTitle: listing.name,
        labelSubtitle: getPublicLocationLabel(listing, collections),
        radiusMeters,
      },
      geometry: makeCirclePolygon(center, radiusMeters),
    }];
  }),
});

export { getListingDisplayCoords };

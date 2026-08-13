import type { Listing, VenueData } from '../types';
import type { EntityIndex } from './entityIndex';
import { nameSlug } from './identityUtils';

export const buildPrettyKeySlug = (name: string, key: string): string => {
  const pretty = nameSlug(name);
  return `${pretty}--${key}`;
};

export const getClubCanonicalPath = (
  club: Extract<Listing, { type: 'club' }>,
  index?: EntityIndex,
): string => {
  const key = index?.clubKeyById.get(club.id) ?? '';
  const slug = key ? buildPrettyKeySlug(club.name, key) : nameSlug(club.name);
  return `/clubs/${slug}`;
};

export const getEventCanonicalPath = (
  event: Extract<Listing, { type: 'event' }>,
  index?: EntityIndex,
): string => {
  const key = index?.eventKeyById.get(event.id) ?? '';
  const slug = key ? buildPrettyKeySlug(event.name, key) : nameSlug(event.name);
  return `/events/${slug}`;
};

export const getListingCanonicalPath = (
  listing: Listing,
  index?: EntityIndex,
): string => {
  return listing.type === 'event'
    ? getEventCanonicalPath(listing, index)
    : getClubCanonicalPath(listing, index);
};

export const getHostCanonicalPath = (hostSlug: string): string => `/hosts/${hostSlug}`;

export const getVenueCanonicalPath = (venue: VenueData): string => `/venues/${venue.slug}`;

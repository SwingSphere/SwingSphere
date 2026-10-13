import type { ClubData, EventData, Listing, VenueData } from '../types';
import type { EntityIndex } from './entityIndex';
import {
  clubKey,
  eventKey,
  hasExplicitKeyParam,
  nameSlug,
  parsePrettyKeyParam,
} from './identityUtils';

export const buildPrettyKeySlug = (name: string, key: string): string => {
  const pretty = nameSlug(name);
  return `${pretty}--${key}`;
};

export const getClubCanonicalPath = (
  club: Extract<Listing, { type: 'club' }>,
  index?: EntityIndex,
): string => {
  const key = index?.clubKeyById.get(club.id) || clubKey(club);
  const slug = key ? buildPrettyKeySlug(club.name, key) : nameSlug(club.name);
  return `/clubs/${slug}`;
};

export const getEventCanonicalPath = (
  event: Extract<Listing, { type: 'event' }>,
  index?: EntityIndex,
): string => {
  const key = index?.eventKeyById.get(event.id) || eventKey(event, event.hostName ?? '');
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

export const resolveClubFromParam = (
  slugParam: string | undefined,
  index: EntityIndex | null | undefined,
): { club: ClubData; canonicalPath: string; isCanonical: boolean } | null => {
  const trimmed = (slugParam ?? '').trim();
  if (!trimmed || !index) return null;
  const key = parsePrettyKeyParam(trimmed);
  const hasKey = hasExplicitKeyParam(trimmed);
  const club =
    index.clubsByKey.get(key)
    ?? index.clubRedirectByKey.get(key)
    ?? (!hasKey ? index.unambiguousClubBySlug.get(trimmed.toLowerCase()) ?? index.clubRedirectByKey.get(trimmed) : null);
  if (!club) return null;
  const canonicalPath = getClubCanonicalPath(club, index);
  const expectedSlug = canonicalPath.slice('/clubs/'.length);
  return {
    club,
    canonicalPath,
    isCanonical: trimmed === expectedSlug,
  };
};

export const resolveEventFromParam = (
  slugParam: string | undefined,
  index: EntityIndex | null | undefined,
): { event: EventData; canonicalPath: string; isCanonical: boolean } | null => {
  const trimmed = (slugParam ?? '').trim();
  if (!trimmed || !index) return null;
  const key = parsePrettyKeyParam(trimmed);
  const hasKey = hasExplicitKeyParam(trimmed);
  const event =
    index.eventsByKey.get(key)
    ?? index.eventRedirectByKey.get(key)
    ?? (!hasKey ? index.unambiguousEventBySlug.get(trimmed.toLowerCase()) ?? index.eventRedirectByKey.get(trimmed) : null);
  if (!event) return null;
  const canonicalPath = getEventCanonicalPath(event, index);
  const expectedSlug = canonicalPath.slice('/events/'.length);
  return {
    event,
    canonicalPath,
    isCanonical: trimmed === expectedSlug,
  };
};


import type { EventData, Listing } from '../types';
import { getListingCanonicalCoords } from './explorerMarkers';

export type SpatialEventAggregation = {
  listings: Listing[];
  representativeByListingId: Map<string, string>;
  memberIdsByRepresentativeId: Map<string, string[]>;
};

const eventLocationKey = (event: EventData): string => {
  // Physical coordinates are the most stable cross-generation identity for
  // spatial display. Legacy event records inconsistently use venueId,
  // venueKey, or only a geopoint for the same venue, so prioritizing those
  // relationship fields can incorrectly create several pins at one place.
  const coords = getListingCanonicalCoords(event);
  if (coords) return `coords:${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
  if (event.venueId) return `venue:${event.venueId}`;
  if (event.venueKey) return `venue-key:${event.venueKey}`;
  return `event:${event.id}`;
};

const eventStartMs = (event: EventData): number => {
  const value = Date.parse(event.time.start);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
};

const chooseRepresentative = (events: EventData[], nowMs: number): EventData => {
  const ordered = [...events].sort((a, b) => eventStartMs(a) - eventStartMs(b));
  return ordered.find((event) => eventStartMs(event) >= nowMs) ?? ordered.at(-1) ?? events[0];
};

/**
 * Collapses dated event occurrences into one spatial marker per physical place.
 * The underlying occurrences remain separate records and continue to appear in
 * rails, series pages, calendars, and admin tools.
 */
export const aggregateEventsForSpatialDisplay = (
  listings: Listing[],
  nowMs = Date.now(),
): SpatialEventAggregation => {
  const nonEvents = listings.filter((listing) => listing.type !== 'event');
  const events = listings.filter((listing): listing is EventData => listing.type === 'event');
  const groups = new Map<string, EventData[]>();

  for (const event of events) {
    const key = eventLocationKey(event);
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  const representatives: EventData[] = [];
  const representativeByListingId = new Map<string, string>();
  const memberIdsByRepresentativeId = new Map<string, string[]>();

  groups.forEach((group) => {
    const representative = chooseRepresentative(group, nowMs);
    const memberIds = group.map((event) => event.id);
    representatives.push(representative);
    memberIdsByRepresentativeId.set(representative.id, memberIds);
    memberIds.forEach((id) => representativeByListingId.set(id, representative.id));
  });

  return {
    listings: [...nonEvents, ...representatives],
    representativeByListingId,
    memberIdsByRepresentativeId,
  };
};

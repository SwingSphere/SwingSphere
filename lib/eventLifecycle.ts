import type { EventData, Listing } from '../types';

export type EventTemporalState = 'upcoming' | 'happening_now' | 'past';

const toTimestamp = (value?: string): number | null => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const getEventTemporalState = (event: EventData, now = Date.now()): EventTemporalState => {
  const startsAt = toTimestamp(event.time?.start);
  const endsAt = toTimestamp(event.time?.end) ?? startsAt;

  if (endsAt !== null && endsAt < now) return 'past';
  if (startsAt !== null && startsAt <= now && (endsAt === null || endsAt >= now)) return 'happening_now';
  return 'upcoming';
};

export const isPastEvent = (event: EventData, now = Date.now()): boolean => getEventTemporalState(event, now) === 'past';

export const isActiveDiscoveryListing = (listing: Listing, now = Date.now()): boolean => {
  if (listing.type !== 'event') return true;
  return !isPastEvent(listing, now);
};

import type { EventData } from '../types';
import { eventKey, nameSlug } from './identityUtils';

/** Public slugs are saved on new events only; legacy events keep their original URLs. */
export const eventPublicSlug = (event: EventData): string | undefined => {
  const slug = event.publicSlug?.trim().toLowerCase();
  return slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : undefined;
};

export const eventCanonicalSlug = (event: EventData, hostName = event.hostName ?? ''): string =>
  eventPublicSlug(event) ?? `${nameSlug(event.name)}--${eventKey(event, hostName)}`;

export const makeEventPublicSlug = (event: EventData, otherEvents: EventData[]): string | undefined => {
  const city = event.geopoint?.address?.city?.trim();
  const date = /^\d{4}-\d{2}-\d{2}/.exec(event.time?.start ?? '')?.[0];
  if (!city || !date) return undefined; // Never fabricate location or date.
  const base = `${nameSlug(event.name)}-${nameSlug(city)}-${date}`;
  const occupied = new Set(otherEvents.filter(e => e.id !== event.id).map(e => eventCanonicalSlug(e)));
  if (!occupied.has(base)) return base;
  const suffix = eventKey(event, event.hostName ?? '');
  const candidate = `${base}-${suffix}`;
  return occupied.has(candidate) ? undefined : candidate;
};

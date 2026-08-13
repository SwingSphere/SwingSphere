import type { ClubData, EventData } from '../types';

export const normalizeIdentityString = (value: string): string => {
  if (!value) return '';
  const ascii = value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '');
  return ascii
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const stableHash = (input: string): string => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
  }
  const normalized = (hash >>> 0).toString(36);
  return normalized.padStart(8, '0');
};

export const nameSlug = (name: string): string => {
  const normalized = normalizeIdentityString(name);
  return normalized ? normalized.replace(/\s+/g, '-') : 'listing';
};

const roundedCoords = (lat?: number, lng?: number): string => {
  if (typeof lat !== 'number' || typeof lng !== 'number') return '';
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
};

export const clubKey = (club: ClubData): string => {
  const name = normalizeIdentityString(club.name);
  const address = club.geopoint?.address;
  const city = normalizeIdentityString(address?.city ?? '');
  const region = normalizeIdentityString(address?.region ?? '');
  const country = normalizeIdentityString(address?.country ?? '');
  const locationBits = [city, region, country].filter(Boolean);
  let identity = [name, ...locationBits].filter(Boolean).join('|');
  if (!identity) {
    const coords = roundedCoords(club.geopoint?.latitude, club.geopoint?.longitude);
    identity = coords || name;
  } else if (locationBits.length === 0) {
    const coords = roundedCoords(club.geopoint?.latitude, club.geopoint?.longitude);
    if (coords) identity = `${identity}|${coords}`;
  }
  return stableHash(identity);
};

export const normalizeHostName = (hostName: string): string => {
  return normalizeIdentityString(hostName);
};

export const hostSlug = (hostName: string): string => {
  return nameSlug(normalizeHostName(hostName));
};

export const eventKey = (
  event: EventData,
  hostName: string,
): string => {
  const name = normalizeIdentityString(event.name);
  const startIso = event.time?.start ?? '';
  const host = normalizeHostName(hostName);
  const venue = event.venueKey ?? '';
  const identity = [name, startIso, venue, host].filter(Boolean).join('|');
  return stableHash(identity);
};

export const parsePrettyKeyParam = (param: string): string => {
  if (!param) return '';
  const trimmed = param.trim();
  const parts = trimmed.split('--').filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : trimmed;
};

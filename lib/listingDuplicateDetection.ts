import type { EventData, Listing } from '../types';
import { normalizeIdentityString, normalizeHostName } from './identityUtils';
import { formatListingAddress, type ListingAddress } from './listingLocationValidation';

export type ListingDuplicateMatch = {
  listing: Listing;
  score: number;
  reasons: string[];
};

export type DuplicateDetectionInput = {
  draft: Partial<Listing> & { type: 'club' | 'event' };
  listings: Listing[];
  excludeId?: string;
};

const normalizeAddress = (address?: ListingAddress | Listing['geopoint']['address']) => {
  if (!address) return '';
  return normalizeIdentityString(formatListingAddress({
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    city: address.city,
    region: address.region,
    postalCode: address.postalCode,
    country: address.country,
  }));
};

const listingAddressKey = (listing: Listing) => normalizeAddress(listing.geopoint.address);

const listingLocalKey = (listing: Listing) =>
  normalizeIdentityString([
    listing.geopoint.address.city,
    listing.geopoint.address.region,
    listing.geopoint.address.country,
  ].filter(Boolean).join(' '));

const commonNameScore = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (a.includes(b) || b.includes(a)) return 2;
  return 0;
};

const getDraftName = (draft: Partial<Listing> & { type: 'club' | 'event' }) =>
  normalizeIdentityString(draft.name ?? '');

const getDraftAddressKey = (draft: Partial<Listing> & { type: 'club' | 'event' }) =>
  normalizeAddress(draft.geopoint?.address);

const getDraftLocalKey = (draft: Partial<Listing> & { type: 'club' | 'event' }) =>
  normalizeIdentityString([
    draft.geopoint?.address.city,
    draft.geopoint?.address.region,
    draft.geopoint?.address.country,
  ].filter(Boolean).join(' '));

export const findPotentialListingDuplicates = (
  input: DuplicateDetectionInput,
): ListingDuplicateMatch[] => {
  const draftName = getDraftName(input.draft);
  const draftAddressKey = getDraftAddressKey(input.draft);
  const draftLocalKey = getDraftLocalKey(input.draft);
  const eventDraft = input.draft.type === 'event' ? (input.draft as Partial<EventData>) : null;
  const draftVenueKey = eventDraft?.venueKey?.trim() ?? '';
  const draftStart = eventDraft?.time?.start ?? '';
  const draftHost = normalizeHostName(eventDraft?.hostName ?? '');

  return input.listings
    .filter((listing) => listing.id !== input.excludeId)
    .map((listing) => {
      const reasons: string[] = [];
      let score = 0;
      const listingName = normalizeIdentityString(listing.name);
      const nameScore = commonNameScore(draftName, listingName);
      if (nameScore) {
        score += nameScore;
        reasons.push(nameScore === 3 ? 'matching name' : 'similar name');
      }

      const matchedAddressKey = listingAddressKey(listing);
      if (draftAddressKey && matchedAddressKey && draftAddressKey === matchedAddressKey) {
        score += 3;
        reasons.push('same address');
      }

      const listingLocal = listingLocalKey(listing);
      if (draftLocalKey && listingLocal && draftLocalKey === listingLocal) {
        score += 1;
        reasons.push('same city / region');
      }

      if (input.draft.type === 'event' && listing.type === 'event') {
        if (draftVenueKey && listing.venueKey && draftVenueKey === listing.venueKey) {
          score += 2;
          reasons.push('same venue');
        }
        if (draftStart && listing.time?.start && draftStart === listing.time.start) {
          score += 2;
          reasons.push('same start time');
        }
        const listingHost = normalizeHostName(listing.hostName ?? '');
        if (draftHost && listingHost && draftHost === listingHost) {
          score += 1;
          reasons.push('same host');
        }
      }

      return {
        listing,
        score,
        reasons,
      };
    })
    .filter((match) => match.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
};

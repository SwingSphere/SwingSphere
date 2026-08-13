import type { ClubData, Listing, OrganizationVenueRelationship } from '../types';
import { mockData } from './mockData';
import { communityHostVenueRelationships } from './communityHostSeed';

const isClub = (listing: Listing): listing is ClubData => listing.type === 'club';

export const mockOrganizationVenueRelationships: OrganizationVenueRelationship[] = [
  ...mockData.filter(isClub).map((club) => ({
    // SEMv2 Phase 1 compatibility ID. Replace with persisted relationship IDs when relationships are stored independently.
    id: `rel-${club.id}-primary-venue`,
    organizationId: `org-${club.id}`,
    venueId: club.primaryVenueId ?? `venue-${club.id}`,
    relationshipType: 'owner_operator',
    label: 'Primary club venue',
    isPrimary: true,
    confidence: 0.85,
  })),
  ...communityHostVenueRelationships,
];

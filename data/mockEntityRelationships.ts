import type { OrganizationVenueRelationship } from '../types';

export const mockOrganizationVenueRelationships: OrganizationVenueRelationship[] = [
  {
    id: 'rel-club-twist-sf-primary-venue',
    organizationId: 'org-club-twist-sf',
    venueId: 'venue-club-twist-sf',
    relationshipType: 'owner_operator',
    label: 'Primary club venue',
    isPrimary: true,
    confidence: 0.85,
  },
  {
    id: 'rel-club-power-exchange-sf-primary-venue',
    organizationId: 'org-club-power-exchange-sf',
    venueId: 'venue-club-power-exchange-sf',
    relationshipType: 'owner_operator',
    label: 'Primary club venue',
    isPrimary: true,
    confidence: 0.85,
  },
  {
    id: 'rel-club-club-joi-la-primary-venue',
    organizationId: 'org-club-club-joi-la',
    venueId: 'venue-club-club-joi-la',
    relationshipType: 'owner_operator',
    label: 'Primary club venue',
    isPrimary: true,
    confidence: 0.85,
  },
];


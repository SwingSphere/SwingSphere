import type { OrganizationRelationship } from '../types';

export const organizationRelationships: OrganizationRelationship[] = [
  {
    id: '',
    sourceOrganizationId: 'org-operator-modern-lifestyle-events',
    targetOrganizationId: 'org-promoter-bronze-party',
    relationshipType: 'operates',
    label: 'Operator',
    isPrimary: true,
    notes: 'Bronze Party remains a distinct public-facing brand.',
  },
  {
    id: '',
    sourceOrganizationId: 'org-operator-modern-lifestyle-events',
    targetOrganizationId: 'org-promoter-her-fantasy-party',
    relationshipType: 'operates',
    label: 'Operator',
    isPrimary: true,
    notes: 'Her Fantasy Party remains a distinct public-facing brand separate from Bronze Party.',
  },
];

export default organizationRelationships;

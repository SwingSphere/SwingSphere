export interface FlaggedContent {
  id: string;
  type: 'Event' | 'Club' | 'Review' | 'User';
  summary: string;
  contentId: string;
  date: string; // ISO
}

export const mockFlaggedContent: FlaggedContent[] = [
    {
        id: 'flag-1',
        type: 'Review',
        summary: 'Review for "The Velvet Chamber": "This place was disgusting, not clean at all..."',
        contentId: 'review-abc',
        date: '2024-10-25T10:00:00Z',
    },
    {
        id: 'flag-2',
        type: 'Event',
        summary: 'Event "Neon Nights Pool Party": Age restriction may be misleading.',
        contentId: 'event2',
        date: '2024-10-24T15:30:00Z',
    },
    {
        id: 'flag-3',
        type: 'User',
        summary: 'User profile "KinkyPromoter" has an inappropriate avatar.',
        contentId: 'user-003',
        date: '2024-10-23T09:00:00Z',
    }
];
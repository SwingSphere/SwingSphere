import type { Review } from '../types';

export const mockReviews: Review[] = [
  {
    id: 'rev1',
    listingId: 'club1',
    userId: 'user-004',
    userName: 'RegularExplorer',
    userAvatarUrl: 'https://i.pravatar.cc/150?u=user-004',
    rating: 'up',
    text: 'Absolutely fantastic atmosphere! The crowd was respectful and the venue was clean. A must-visit if you are in SF.',
    timestamp: '2024-05-10T22:30:00Z',
  },
  {
    id: 'rev2',
    listingId: 'club1',
    userId: 'user-005',
    userName: 'TroubleMaker',
    userAvatarUrl: 'https://i.pravatar.cc/150?u=user-005',
    rating: 'down',
    text: 'Overpriced drinks and the music was too loud. Not the vibe I was expecting at all.',
    timestamp: '2024-05-09T21:00:00Z',
  },
    {
    id: 'rev3',
    listingId: 'event1',
    userId: 'user-002',
    userName: 'VelvetHost',
    userAvatarUrl: 'https://i.pravatar.cc/150?u=user-002',
    rating: 'up',
    text: 'An incredibly well-organized event. The mansion was stunning and the hosts were gracious. Will definitely attend again next year!',
    timestamp: '2024-01-02T11:00:00Z',
  },
   {
    id: 'rev4',
    listingId: 'club2',
    userId: 'user-004',
    userName: 'RegularExplorer',
    userAvatarUrl: 'https://i.pravatar.cc/150?u=user-004',
    rating: 'up',
    text: 'Great for newbies! The staff were very helpful in explaining the rules and making sure everyone felt safe. Highly recommended for those curious about the scene.',
    timestamp: '2024-04-15T19:45:00Z',
  },
];

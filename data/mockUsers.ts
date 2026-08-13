
export interface User {
  id: string;
  displayName: string;
  email: string;
  role: 'User' | 'Host' | 'Admin';
  joinDate: string; // ISO string
  submissionCount: number;
  status: 'Active' | 'Suspended' | 'Deleted';
  handle?: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  isAvatarNsfw?: boolean;
  badges?: string[];
}

export const mockUsers: User[] = [
  {
    id: 'user-001',
    displayName: 'AdminUser',
    email: 'admin@swingsphere.co',
    role: 'Admin',
    joinDate: '2023-01-15T10:00:00Z',
    submissionCount: 5,
    status: 'Active',
    avatarUrl: 'https://i.pravatar.cc/150?u=user-001',
    isAvatarNsfw: false,
    badges: ['Star User'],
  },
  {
    id: 'user-002',
    displayName: 'VelvetHost',
    email: 'host@velvetchamber.com',
    role: 'Host',
    joinDate: '2023-03-22T14:30:00Z',
    submissionCount: 12,
    status: 'Active',
    avatarUrl: 'https://i.pravatar.cc/150?u=user-002',
    isAvatarNsfw: false,
    badges: [],
  },
    {
    id: 'user-003',
    displayName: 'KinkyPromoter',
    email: 'promo@thekinkdungeon.com',
    role: 'Host',
    joinDate: '2023-05-10T18:45:00Z',
    submissionCount: 8,
    status: 'Active',
    avatarUrl: 'https://i.pravatar.cc/150?u=user-003',
    isAvatarNsfw: true,
    badges: [],
  },
  {
    id: 'user-004',
    displayName: 'RegularExplorer',
    email: 'explorer@email.com',
    role: 'User',
    joinDate: '2023-08-01T20:00:00Z',
    submissionCount: 0,
    status: 'Active',
    avatarUrl: 'https://i.pravatar.cc/150?u=user-004',
    isAvatarNsfw: false,
    badges: [],
  },
  {
    id: 'user-005',
    displayName: 'TroubleMaker',
    email: 'banned@email.com',
    role: 'User',
    joinDate: '2023-09-15T11:20:00Z',
    submissionCount: 1,
    status: 'Suspended',
    avatarUrl: 'https://i.pravatar.cc/150?u=user-005',
    isAvatarNsfw: false,
    badges: [],
  },
  {
    id: 'user-006',
    displayName: 'NewbieUser',
    email: 'newbie@email.com',
    role: 'User',
    joinDate: '2024-02-28T16:05:00Z',
    submissionCount: 0,
    status: 'Active',
    avatarUrl: 'https://i.pravatar.cc/150?u=user-006',
    isAvatarNsfw: false,
    badges: ['Star User'],
  },
    {
    id: 'user-007',
    displayName: 'MiamiPartyHost',
    email: 'miami@neonnights.com',
    role: 'Host',
    joinDate: '2024-04-11T09:15:00Z',
    submissionCount: 3,
    status: 'Active',
    avatarUrl: 'https://i.pravatar.cc/150?u=user-007',
    isAvatarNsfw: false,
    badges: [],
  },
];
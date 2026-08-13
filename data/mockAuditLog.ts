export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO string
  adminId: string;
  adminName: string;
  // FIX: Added 'ACCOUNT_DELETED_BY_USER' to the action type union to allow for this action.
  action: 'USER_PROMOTED' | 'USER_SUSPENDED' | 'CONTENT_DELETED' | 'CONTENT_APPROVED' | 'TAG_CREATED' | 'SETTINGS_UPDATED' | 'USER_UPDATED' | 'ACCOUNT_DELETED_BY_USER';
  targetType: 'User' | 'Club' | 'Event' | 'Tag' | 'System';
  targetId: string;
  targetName: string;
  details?: string;
}

export const mockAuditLog: AuditLogEntry[] = [
  {
    id: 'log-001',
    timestamp: '2024-10-26T14:48:00Z',
    adminId: 'user-001',
    adminName: 'AdminUser',
    action: 'USER_PROMOTED',
    targetType: 'User',
    targetId: 'user-002',
    targetName: 'VelvetHost',
    details: 'Role changed from User to Host.'
  },
  {
    id: 'log-002',
    timestamp: '2024-10-26T11:30:00Z',
    adminId: 'user-001',
    adminName: 'AdminUser',
    action: 'CONTENT_DELETED',
    targetType: 'Event',
    targetId: 'event2',
    targetName: 'Neon Nights Pool Party',
    details: 'Reason: Inappropriate content reported.'
  },
  {
    id: 'log-003',
    timestamp: '2024-10-25T18:05:00Z',
    adminId: 'user-001',
    adminName: 'AdminUser',
    action: 'USER_SUSPENDED',
    targetType: 'User',
    targetId: 'user-005',
    targetName: 'TroubleMaker',
    details: 'User suspended for 30 days due to spam.'
  },
  {
    id: 'log-004',
    timestamp: '2024-10-25T09:15:00Z',
    adminId: 'user-001',
    adminName: 'AdminUser',
    action: 'CONTENT_APPROVED',
    targetType: 'Club',
    targetId: 'club3',
    targetName: 'The Hidden Gem',
    details: 'User submission approved.'
  },
  {
    id: 'log-005',
    timestamp: '2024-10-24T16:20:00Z',
    adminId: 'user-001',
    adminName: 'AdminUser',
    action: 'TAG_CREATED',
    targetType: 'Tag',
    targetId: 'tag-206',
    targetName: 'Outdoor Event',
    details: 'New tag created in Theme category.'
  },
  {
    id: 'log-006',
    timestamp: '2024-10-24T10:00:00Z',
    adminId: 'user-001',
    adminName: 'AdminUser',
    action: 'SETTINGS_UPDATED',
    targetType: 'System',
    targetId: 'platformConfig',
    targetName: 'Platform Configuration',
    details: 'Set maxTagsPerListing to 15.'
  },
    {
    id: 'log-007',
    timestamp: '2024-10-23T15:00:00Z',
    adminId: 'user-001',
    adminName: 'AdminUser',
    action: 'USER_UPDATED',
    targetType: 'User',
    targetId: 'user-003',
    targetName: 'KinkyPromoter',
    details: 'Avatar flagged as NSFW.'
  }
];

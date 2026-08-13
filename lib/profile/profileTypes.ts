export type ProfileVisibility = 'private' | 'visible';

export type ProfilePrivacySettings = {
  userId: string;
  profileVisibility: ProfileVisibility;
  createdAt: string;
  updatedAt: string;
};

export type PublicMemberProfile = {
  id: string;
  displayName: string;
  handle: string;
  bio?: string;
  avatarUrl?: string;
  createdAt: string;
  profileVisibility: 'visible';
};

export type ProfileAssociationKind = 'relationship' | 'friend' | 'other';
export type ProfileAssociationStatus = 'pending' | 'accepted' | 'declined' | 'removed';

export type ProfileAssociation = {
  id: string;
  requesterUserId: string;
  recipientUserId: string;
  associationKind: ProfileAssociationKind;
  status: ProfileAssociationStatus;
  publicLabel?: string;
  createdAt: string;
  updatedAt: string;
  respondedAt?: string;
};

export type SavedEntityType =
  | 'club'
  | 'event'
  | 'venue'
  | 'organization'
  | 'resort'
  | 'cruise_series'
  | 'cruise_sailing';

export type SavedEntity = {
  id: string;
  userId: string;
  entityType: SavedEntityType;
  entityId: string;
  privateNote?: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedCollection = {
  id: string;
  userId: string;
  title: string;
  description?: string;
  visibility: ProfileVisibility;
  createdAt: string;
  updatedAt: string;
};

export type SavedCollectionItem = {
  collectionId: string;
  savedEntityId: string;
  addedAt: string;
};

import { supabase } from '../supabase';
import type {
  ProfilePrivacySettings,
  ProfileVisibility,
  PublicMemberProfile,
  SavedCollection,
  SavedCollectionItem,
  SavedEntity,
  SavedEntityType,
} from './profileTypes';

type StoredProfileVisibility = ProfileVisibility | 'unlisted' | 'public';

type ProfilePrivacyRow = {
  user_id: string;
  profile_visibility: StoredProfileVisibility;
  created_at: string;
  updated_at: string;
};

type PublicMemberProfileRow = {
  id: string;
  display_name: string;
  handle: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
  profile_visibility: Exclude<StoredProfileVisibility, 'private'>;
};

type SavedEntityRow = {
  id: string;
  user_id: string;
  entity_type: SavedEntityType;
  entity_id: string;
  private_note: string | null;
  created_at: string;
  updated_at: string;
};

type SavedCollectionRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  visibility: ProfileVisibility;
  created_at: string;
  updated_at: string;
};

type SavedCollectionItemRow = {
  collection_id: string;
  saved_entity_id: string;
  added_at: string;
};

const toProfileVisibility = (value: StoredProfileVisibility): ProfileVisibility => (
  value === 'private' ? 'private' : 'visible'
);

const mapPrivacy = (row: ProfilePrivacyRow): ProfilePrivacySettings => ({
  userId: row.user_id,
  profileVisibility: toProfileVisibility(row.profile_visibility),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapPublicProfile = (row: PublicMemberProfileRow): PublicMemberProfile => ({
  id: row.id,
  displayName: row.display_name,
  handle: row.handle,
  bio: row.bio ?? undefined,
  avatarUrl: row.avatar_url ?? undefined,
  createdAt: row.created_at,
  profileVisibility: 'visible',
});

const mapSavedEntity = (row: SavedEntityRow): SavedEntity => ({
  id: row.id,
  userId: row.user_id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  privateNote: row.private_note ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSavedCollection = (row: SavedCollectionRow): SavedCollection => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  description: row.description ?? undefined,
  visibility: row.visibility,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapSavedCollectionItem = (row: SavedCollectionItemRow): SavedCollectionItem => ({
  collectionId: row.collection_id,
  savedEntityId: row.saved_entity_id,
  addedAt: row.added_at,
});

export const getProfilePrivacy = async (userId: string): Promise<ProfilePrivacySettings> => {
  const { data, error } = await supabase
    .from('profile_privacy_settings')
    .select('user_id, profile_visibility, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle<ProfilePrivacyRow>();

  if (error) throw error;
  if (data) return mapPrivacy(data);

  const { data: created, error: createError } = await supabase
    .from('profile_privacy_settings')
    .insert({ user_id: userId, profile_visibility: 'private' })
    .select('user_id, profile_visibility, created_at, updated_at')
    .single<ProfilePrivacyRow>();

  if (createError) throw createError;
  return mapPrivacy(created);
};

const isLegacyVisibilityEnumError = (error: { code?: string; message?: string } | null) => Boolean(
  error
  && (
    error.code === '22P02'
    || error.message?.includes('invalid input value for enum')
    || error.message?.includes('profile_visibility')
  )
);

const notifyProfileVisibilityChanged = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('swingsphere:profile-visibility-revision', Date.now().toString());
  window.dispatchEvent(new CustomEvent('swingsphere:profile-visibility-changed'));
};

export const updateProfilePrivacy = async (
  userId: string,
  profileVisibility: ProfileVisibility,
): Promise<ProfilePrivacySettings> => {
  const saveVisibility = async (storedVisibility: StoredProfileVisibility) => supabase
    .from('profile_privacy_settings')
    .upsert({
      user_id: userId,
      profile_visibility: storedVisibility,
    }, { onConflict: 'user_id' })
    .select('user_id, profile_visibility, created_at, updated_at')
    .single<ProfilePrivacyRow>();

  let result = await saveVisibility(profileVisibility);

  // Compatibility bridge for a Supabase project that still has the earlier
  // private/unlisted/public enum while the two-state migration is pending.
  if (profileVisibility === 'visible' && isLegacyVisibilityEnumError(result.error)) {
    result = await saveVisibility('public');
  }

  if (result.error) throw result.error;
  notifyProfileVisibilityChanged();
  return mapPrivacy(result.data);
};

export const getPublicProfileByHandle = async (handle: string): Promise<PublicMemberProfile | null> => {
  const { data, error } = await supabase.rpc('get_public_profile_by_handle', {
    p_handle: handle,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? mapPublicProfile(row as PublicMemberProfileRow) : null;
};

export const listSavedEntities = async (userId: string): Promise<SavedEntity[]> => {
  const { data, error } = await supabase
    .from('saved_entities')
    .select('id, user_id, entity_type, entity_id, private_note, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as SavedEntityRow[]).map(mapSavedEntity);
};

export const getSavedEntity = async (
  userId: string,
  entityType: SavedEntityType,
  entityId: string,
): Promise<SavedEntity | null> => {
  const { data, error } = await supabase
    .from('saved_entities')
    .select('id, user_id, entity_type, entity_id, private_note, created_at, updated_at')
    .eq('user_id', userId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle<SavedEntityRow>();

  if (error) throw error;
  return data ? mapSavedEntity(data) : null;
};

export const saveEntity = async (
  userId: string,
  entityType: SavedEntityType,
  entityId: string,
): Promise<SavedEntity> => {
  const { data, error } = await supabase
    .from('saved_entities')
    .upsert({ user_id: userId, entity_type: entityType, entity_id: entityId }, {
      onConflict: 'user_id,entity_type,entity_id',
    })
    .select('id, user_id, entity_type, entity_id, private_note, created_at, updated_at')
    .single<SavedEntityRow>();

  if (error) throw error;
  return mapSavedEntity(data);
};

export const removeSavedEntity = async (userId: string, savedEntityId: string): Promise<void> => {
  const { error } = await supabase
    .from('saved_entities')
    .delete()
    .eq('id', savedEntityId)
    .eq('user_id', userId);
  if (error) throw error;
};

export const listSavedCollections = async (userId: string): Promise<SavedCollection[]> => {
  const { data, error } = await supabase
    .from('saved_collections')
    .select('id, user_id, title, description, visibility, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as SavedCollectionRow[]).map(mapSavedCollection);
};

export const listSavedCollectionItems = async (): Promise<SavedCollectionItem[]> => {
  const { data, error } = await supabase
    .from('saved_collection_items')
    .select('collection_id, saved_entity_id, added_at')
    .order('added_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as SavedCollectionItemRow[]).map(mapSavedCollectionItem);
};

export const addSavedEntityToCollection = async (
  collectionId: string,
  savedEntityId: string,
): Promise<SavedCollectionItem> => {
  const { data, error } = await supabase
    .from('saved_collection_items')
    .upsert({ collection_id: collectionId, saved_entity_id: savedEntityId }, {
      onConflict: 'collection_id,saved_entity_id',
    })
    .select('collection_id, saved_entity_id, added_at')
    .single<SavedCollectionItemRow>();

  if (error) throw error;
  return mapSavedCollectionItem(data);
};

export const removeSavedEntityFromCollection = async (
  collectionId: string,
  savedEntityId: string,
): Promise<void> => {
  const { error } = await supabase
    .from('saved_collection_items')
    .delete()
    .eq('collection_id', collectionId)
    .eq('saved_entity_id', savedEntityId);
  if (error) throw error;
};

export const createSavedCollection = async (
  userId: string,
  input: { title: string; description?: string },
): Promise<SavedCollection> => {
  const { data, error } = await supabase
    .from('saved_collections')
    .insert({
      user_id: userId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      visibility: 'private',
    })
    .select('id, user_id, title, description, visibility, created_at, updated_at')
    .single<SavedCollectionRow>();

  if (error) throw error;
  return mapSavedCollection(data);
};

export const deleteSavedCollection = async (userId: string, collectionId: string): Promise<void> => {
  const { error } = await supabase
    .from('saved_collections')
    .delete()
    .eq('id', collectionId)
    .eq('user_id', userId);
  if (error) throw error;
};

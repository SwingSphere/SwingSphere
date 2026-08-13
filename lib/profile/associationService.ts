import { supabase } from '../supabase';
import type {
  ProfileAssociation,
  ProfileAssociationKind,
  ProfileAssociationStatus,
} from './profileTypes';

type ProfileAssociationRow = {
  id: string;
  requester_user_id: string;
  recipient_user_id: string;
  association_kind: ProfileAssociationKind;
  status: ProfileAssociationStatus;
  public_label: string | null;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
};

const mapAssociation = (row: ProfileAssociationRow): ProfileAssociation => ({
  id: row.id,
  requesterUserId: row.requester_user_id,
  recipientUserId: row.recipient_user_id,
  associationKind: row.association_kind,
  status: row.status,
  publicLabel: row.public_label ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  respondedAt: row.responded_at ?? undefined,
});

export const listMyProfileAssociations = async (): Promise<ProfileAssociation[]> => {
  const { data, error } = await supabase
    .from('profile_associations')
    .select('id, requester_user_id, recipient_user_id, association_kind, status, public_label, created_at, updated_at, responded_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ProfileAssociationRow[]).map(mapAssociation);
};

export const requestProfileAssociation = async (input: {
  recipientHandle: string;
  kind: ProfileAssociationKind;
  publicLabel?: string;
}): Promise<string> => {
  const { data, error } = await supabase.rpc('request_profile_association', {
    p_recipient_handle: input.recipientHandle,
    p_kind: input.kind,
    p_public_label: input.publicLabel?.trim() || null,
  });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('SwingSphere did not return an association ID.');
  return data;
};

export const respondProfileAssociation = async (
  associationId: string,
  status: Extract<ProfileAssociationStatus, 'accepted' | 'declined'>,
): Promise<void> => {
  const { error } = await supabase.rpc('respond_profile_association', {
    p_association_id: associationId,
    p_status: status,
  });
  if (error) throw error;
};

export const removeProfileAssociation = async (associationId: string): Promise<void> => {
  const { error } = await supabase.rpc('remove_profile_association', {
    p_association_id: associationId,
  });
  if (error) throw error;
};

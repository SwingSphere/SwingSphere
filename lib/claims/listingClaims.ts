import { supabase } from '../supabase';

export type ListingClaimEntityType =
  | 'club'
  | 'event'
  | 'event_series'
  | 'venue'
  | 'organization'
  | 'resort'
  | 'cruise_series'
  | 'cruise_sailing';

export type ListingClaimRole = 'owner' | 'manager' | 'editor';

export type ListingClaimStatus =
  | 'pending'
  | 'information_requested'
  | 'under_review'
  | 'verified'
  | 'denied'
  | 'withdrawn'
  | 'revoked'
  | 'superseded';

export type ListingClaimVerificationMethod =
  | 'official_domain_email'
  | 'official_public_email'
  | 'public_phone_callback'
  | 'official_social_account'
  | 'website_challenge'
  | 'existing_owner_invitation'
  | 'live_call'
  | 'business_document'
  | 'combined_manual_review';

export type ListingClaim = {
  id: string;
  claimantUserId: string;
  entityType: ListingClaimEntityType;
  entityId: string;
  organizationId?: string;
  requestedRole: ListingClaimRole;
  claimantNote?: string;
  status: ListingClaimStatus;
  verificationMethod?: ListingClaimVerificationMethod;
  verificationSummary?: string;
  decisionReason?: string;
  evidenceReceivedAt?: string;
  evidenceDeletedAt?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  expiresAt?: string;
  revokedAt?: string;
  updatedAt: string;
};

type ListingClaimRow = {
  id: string;
  claimant_user_id: string;
  entity_type: ListingClaimEntityType;
  entity_id: string;
  organization_id: string | null;
  requested_role: ListingClaimRole;
  claimant_note: string | null;
  status: ListingClaimStatus;
  verification_method: ListingClaimVerificationMethod | null;
  verification_summary: string | null;
  decision_reason: string | null;
  evidence_received_at: string | null;
  evidence_deleted_at: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  updated_at: string;
};

const mapListingClaim = (row: ListingClaimRow): ListingClaim => ({
  id: row.id,
  claimantUserId: row.claimant_user_id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  organizationId: row.organization_id ?? undefined,
  requestedRole: row.requested_role,
  claimantNote: row.claimant_note ?? undefined,
  status: row.status,
  verificationMethod: row.verification_method ?? undefined,
  verificationSummary: row.verification_summary ?? undefined,
  decisionReason: row.decision_reason ?? undefined,
  evidenceReceivedAt: row.evidence_received_at ?? undefined,
  evidenceDeletedAt: row.evidence_deleted_at ?? undefined,
  submittedAt: row.submitted_at,
  reviewedAt: row.reviewed_at ?? undefined,
  reviewedBy: row.reviewed_by ?? undefined,
  expiresAt: row.expires_at ?? undefined,
  revokedAt: row.revoked_at ?? undefined,
  updatedAt: row.updated_at,
});

export const createListingClaim = async (input: {
  entityType: ListingClaimEntityType;
  entityId: string;
  organizationId?: string;
  requestedRole?: ListingClaimRole;
  claimantNote?: string;
}): Promise<ListingClaim> => {
  const { data, error } = await supabase.rpc('create_listing_claim', {
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_organization_id: input.organizationId ?? null,
    p_requested_role: input.requestedRole ?? 'manager',
    p_claimant_note: input.claimantNote ?? null,
  });
  if (error) throw error;
  return mapListingClaim(data as ListingClaimRow);
};

export const listOwnListingClaims = async (): Promise<ListingClaim[]> => {
  const { data, error } = await supabase
    .from('listing_claims')
    .select('*')
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ListingClaimRow[]).map(mapListingClaim);
};

export type AdminListingClaim = ListingClaim & {
  claimantDisplayName?: string;
  claimantHandle?: string;
};

export const listListingClaimsForAdmin = async (): Promise<AdminListingClaim[]> => {
  const { data: claimRows, error: claimsError } = await supabase
    .from('listing_claims')
    .select('*')
    .order('submitted_at', { ascending: false });
  if (claimsError) throw claimsError;

  const claims = ((claimRows ?? []) as ListingClaimRow[]).map(mapListingClaim);
  const claimantIds = Array.from(new Set(claims.map((claim) => claim.claimantUserId)));
  if (!claimantIds.length) return claims;

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name, handle')
    .in('id', claimantIds);
  if (profilesError) throw profilesError;

  const profileById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile] as const),
  );

  return claims.map((claim) => {
    const profile = profileById.get(claim.claimantUserId);
    return {
      ...claim,
      claimantDisplayName: profile?.display_name,
      claimantHandle: profile?.handle,
    };
  });
};

export const getOwnListingClaimForEntity = async (
  entityType: ListingClaimEntityType,
  entityId: string,
): Promise<ListingClaim | null> => {
  const { data, error } = await supabase
    .from('listing_claims')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapListingClaim(data as ListingClaimRow) : null;
};

export const withdrawListingClaim = async (claimId: string): Promise<ListingClaim> => {
  const { data, error } = await supabase.rpc('withdraw_listing_claim', {
    p_claim_id: claimId,
  });
  if (error) throw error;
  return mapListingClaim(data as ListingClaimRow);
};

export const reviewListingClaimAsAdmin = async (input: {
  claimId: string;
  status: Exclude<ListingClaimStatus, 'pending' | 'withdrawn'>;
  verificationMethod?: ListingClaimVerificationMethod;
  verificationSummary?: string;
  decisionReason?: string;
  publicNote?: string;
  privateNote?: string;
  evidenceReceivedAt?: string;
  evidenceDeletedAt?: string;
  expiresAt?: string;
}): Promise<ListingClaim> => {
  const { data, error } = await supabase.rpc('admin_review_listing_claim', {
    p_claim_id: input.claimId,
    p_status: input.status,
    p_verification_method: input.verificationMethod ?? null,
    p_verification_summary: input.verificationSummary ?? null,
    p_decision_reason: input.decisionReason ?? null,
    p_public_note: input.publicNote ?? null,
    p_private_note: input.privateNote ?? null,
    p_evidence_received_at: input.evidenceReceivedAt ?? null,
    p_evidence_deleted_at: input.evidenceDeletedAt ?? null,
    p_expires_at: input.expiresAt ?? null,
  });
  if (error) throw error;
  return mapListingClaim(data as ListingClaimRow);
};

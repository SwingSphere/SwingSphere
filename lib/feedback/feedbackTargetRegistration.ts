import type { ClubData, EventData, Listing } from '../../types';
import { supabase } from '../supabase';
import { FeedbackRepositoryError, toFeedbackRepositoryError } from './errors';

export type RegisterableFeedbackListing = Pick<Listing, 'id' | 'name' | 'type' | 'status'>;

export const isFeedbackTargetEligibleListing = (
  listing: RegisterableFeedbackListing,
): listing is Pick<ClubData | EventData, 'id' | 'name' | 'type' | 'status'> => (
  listing.status === 'approved' && (listing.type === 'event' || listing.type === 'club')
);

export const registerApprovedListingFeedbackTarget = async (
  listing: RegisterableFeedbackListing,
): Promise<void> => {
  if (!isFeedbackTargetEligibleListing(listing)) return;

  const { error } = await supabase.rpc('feedback_register_target', {
    p_target_type: listing.type,
    p_source_ref: listing.id,
    p_name: listing.name,
    p_status: 'active',
  });

  if (error) {
    const mapped = toFeedbackRepositoryError(error);
    if (mapped.code === 'permission_denied') {
      throw new FeedbackRepositoryError(
        'permission_denied',
        'The listing was not published because its feedback target could not be registered by this account.',
        mapped,
      );
    }
    throw new FeedbackRepositoryError(
      mapped.code,
      'The listing was not published because its feedback target registration failed.',
      mapped,
    );
  }
};

export const syncApprovedListingFeedbackTargets = async (
  listings: RegisterableFeedbackListing[],
): Promise<{ eligible: number; registered: number }> => {
  const eligibleListings = listings.filter(isFeedbackTargetEligibleListing);
  let registered = 0;
  for (const listing of eligibleListings) {
    await registerApprovedListingFeedbackTarget(listing);
    registered += 1;
  }
  return { eligible: eligibleListings.length, registered };
};

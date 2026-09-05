export type MobileListingHandoffState = {
  travelPhase: string;
  travelDestination: { type: string; listingId?: string | null } | null;
};

export const canScheduleMobileListingHandoff = (
  state: MobileListingHandoffState,
  listingId: string,
): boolean => (
  state.travelPhase === 'globe-arrived'
  && state.travelDestination?.type === 'listing'
  && state.travelDestination.listingId === listingId
);

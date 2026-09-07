import type { BuildingAddressCandidate, BuildingVerificationDecision } from './buildingVerification';

export type BuildingProviderEvaluationStatus =
  | 'completed'
  | 'provider_unavailable'
  | 'tile_timeout'
  | 'no_building_footprints'
  | 'footprints_address_unresolved'
  | 'geometry_processing_error';

export type BuildingReviewDisposition =
  | 'accept_recommended_building'
  | 'keep_existing_building'
  | 'move_pin_to_recommended_building'
  | 'mark_location_for_research';

export type BuildingCandidateEvidence = {
  footprintFingerprint: string;
  providerFeatureIds: string[];
  providerSource: string | null;
  reverseAddressStatus: 'resolved' | 'no_address' | 'provider_error';
  candidateAddress: string | null;
  addressComponents: BuildingAddressCandidate | null;
  pinIntersects: boolean;
  minimumPinToFootprintMeters: number;
  pinToCentroidMeters: number;
  score: number;
  confidence: number;
  reasons: string[];
};

export type BuildingVerificationEvidenceRecord = {
  version: 1;
  listingId: string;
  venueId: string | null;
  /** Immutable snapshot of the physical-location inputs used for this run. */
  inputSnapshotHash?: string;
  verificationEngineVersion?: string;
  runId?: string;
  listingName: string;
  normalizedAddress: string;
  canonicalCoordinate: { lat: number; lng: number };
  coordinateProvenance: string | null;
  coordinateConfidence: number | null;
  evaluatedAt: string;
  providerSnapshot: {
    source: string;
    status: BuildingProviderEvaluationStatus;
    searchRadiusMeters: number;
    tileFeatureCount: number;
    individualFootprintCount: number;
  };
  outcome: BuildingVerificationDecision['outcome'] | 'provider_unavailable' | 'tile_timeout' | 'footprints_address_unresolved' | 'geometry_processing_error';
  autoAccept: boolean;
  autoAcceptMethod: BuildingVerificationDecision['autoAcceptMethod'];
  bestCandidate: BuildingCandidateEvidence | null;
  runnerUp: BuildingCandidateEvidence | null;
  scoreMargin: number | null;
  acceptanceReasons: string[];
  rejectionReasons: string[];
  /** Legacy inline review field. New reviews are append-only review events. */
  review?: {
    disposition: BuildingReviewDisposition;
    reviewedAt: string;
    note?: string;
  };
};

export type BuildingVerificationReviewEvent = {
  version: 1;
  id: string;
  listingId: string;
  evidenceEvaluatedAt: string;
  evidenceSnapshotHash?: string;
  disposition: BuildingReviewDisposition;
  reviewedAt: string;
  reviewedBy?: string;
  note?: string;
};

export const latestBuildingEvidenceByListing = (
  records: BuildingVerificationEvidenceRecord[],
): Map<string, BuildingVerificationEvidenceRecord> => {
  const result = new Map<string, BuildingVerificationEvidenceRecord>();
  for (const record of records) {
    const current = result.get(record.listingId);
    if (!current || current.evaluatedAt < record.evaluatedAt) result.set(record.listingId, record);
  }
  return result;
};


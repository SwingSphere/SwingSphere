import type { BuildingAsset } from '../types';
import type { BuildingVerificationInputSnapshot } from './buildingPersistenceGuard';

export type BuildingAssetHistoryEvent = {
  version: 1;
  id: string;
  listingId: string;
  venueId: string | null;
  action: 'create' | 'replace' | 'rollback';
  occurredAt: string;
  actorUserId: string | null;
  persistenceMode: 'manual' | 'automatic';
  policyVersion: string;
  inputSnapshot: BuildingVerificationInputSnapshot | null;
  evidenceEvaluatedAt?: string;
  previousAsset: BuildingAsset | null;
  nextAsset: BuildingAsset | null;
  note?: string;
};

export const latestRestorableBuildingAsset = (
  events: BuildingAssetHistoryEvent[],
  listingId: string,
): BuildingAssetHistoryEvent | null => {
  const sorted = events
    .filter((event) => event.listingId === listingId && event.previousAsset)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return sorted[0] ?? null;
};

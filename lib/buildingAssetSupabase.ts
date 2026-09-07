import type { BuildingAsset } from '../types';
import { supabase } from './supabase';
import { auditBuildingGeometry, haversineMeters } from './buildingGeometry';
import { normalizeAddressText } from './buildingVerification';
import type { BuildingVerificationEvidenceRecord } from './buildingVerificationEvidence';
import type { BuildingAssetHistoryEvent } from './buildingAssetHistory';
import {
  createBuildingAssetRevision,
  type BuildingAssetRevision,
  type BuildingPersistenceMode,
  type BuildingVerificationInputSnapshot,
} from './buildingPersistenceGuard';

type DurableLocationContext = {
  listingId: string;
  venueId: string | null;
  address: Record<string, unknown>;
  latitude: number;
  longitude: number;
  visibility: 'public_exact' | 'not_public_exact';
  locationMeta?: Record<string, unknown> | null;
};

type DurableBuildingContext = {
  location: DurableLocationContext;
  revisionToken: string;
  asset: BuildingAsset | null;
  assetRevisionToken: string | null;
  automaticEnabled: boolean;
};

const rpc = async <T>(name: string, args: Record<string, unknown> = {}): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
};

const normalizeContextAddress = (address: Record<string, unknown> | undefined | null): string => normalizeAddressText([
  address?.addressLine1,
  address?.addressLine2,
  address?.city,
  address?.region,
  address?.postalCode,
  address?.country,
].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join(', '));

const locationMetaValue = (meta: Record<string, unknown> | null | undefined, key: string): unknown => meta?.[key];

const assertSnapshotMatchesDurableContext = (
  expected: BuildingVerificationInputSnapshot,
  context: DurableBuildingContext,
): void => {
  const current = context.location;
  const reasons: string[] = [];
  if (expected.listingId !== current.listingId) reasons.push('listing identity changed');
  if ((expected.venueId ?? null) !== (current.venueId ?? null)) reasons.push('Venue identity changed');
  if (expected.visibility !== current.visibility) reasons.push('location visibility changed');
  if (normalizeContextAddress(current.address) !== expected.normalizedAddress) reasons.push('physical address changed');
  if (haversineMeters(
    { lat: expected.latitude, lng: expected.longitude },
    { lat: Number(current.latitude), lng: Number(current.longitude) },
  ) > 1.5) reasons.push('canonical coordinate changed');

  const meta = current.locationMeta ?? {};
  const currentSource = String(
    locationMetaValue(meta, 'geocoderSource')
      ?? locationMetaValue(meta, 'source')
      ?? (locationMetaValue(meta, 'manualAdjustment') ? 'manual-adjustment' : ''),
  ) || null;
  const currentConfidence = Number.isFinite(Number(locationMetaValue(meta, 'confidence')))
    ? Number(locationMetaValue(meta, 'confidence'))
    : null;
  const currentValidatedAt = typeof locationMetaValue(meta, 'validatedAt') === 'string'
    ? String(locationMetaValue(meta, 'validatedAt'))
    : null;
  if ((expected.coordinateProvenance ?? null) !== currentSource) reasons.push('coordinate provenance changed');
  if ((expected.coordinateConfidence ?? null) !== currentConfidence) reasons.push('coordinate confidence changed');
  if ((expected.validatedAt ?? null) !== currentValidatedAt) reasons.push('coordinate validation timestamp changed');

  if (reasons.length) throw new Error(`Building save is stale: ${reasons.join(', ')}. Reload Building Inspector before saving.`);
};

const assertAssetRevisionMatchesDurableContext = (
  expected: BuildingAssetRevision | null | undefined,
  context: DurableBuildingContext,
): void => {
  const current = createBuildingAssetRevision(context.asset);
  if (expected === undefined) throw new Error('Building save is missing the expected BuildingAsset revision.');
  if (!expected && current) throw new Error('A BuildingAsset was created after this Inspector session loaded. Reload before saving.');
  if (expected && !current) throw new Error('The BuildingAsset was removed after this Inspector session loaded. Reload before saving.');
  if (expected && current && (
    expected.id !== current.id
    || expected.updatedAt !== current.updatedAt
    || expected.fingerprint !== current.fingerprint
  )) throw new Error('The BuildingAsset changed after this Inspector session loaded. Reload before saving.');
};

export const getDurableBuildingPersistenceContext = async (listingId: string): Promise<DurableBuildingContext> =>
  rpc<DurableBuildingContext>('admin_get_building_persistence_context', { p_listing_id: listingId });

export const getBuildingAssetsFromSupabase = async (): Promise<BuildingAsset[]> => {
  const assets = await rpc<BuildingAsset[]>('admin_list_building_assets');
  return Array.isArray(assets) ? assets : [];
};

export const saveBuildingAssetToSupabase = async (args: {
  listingId: string;
  asset: BuildingAsset;
  expectedSnapshot: BuildingVerificationInputSnapshot;
  expectedExistingAsset?: BuildingAssetRevision | null;
  evidence?: BuildingVerificationEvidenceRecord | null;
  mode: BuildingPersistenceMode;
  note?: string;
}): Promise<{ asset: BuildingAsset; listing: null; historyEventId?: string }> => {
  const context = await getDurableBuildingPersistenceContext(args.listingId);
  assertSnapshotMatchesDurableContext(args.expectedSnapshot, context);
  assertAssetRevisionMatchesDurableContext(args.expectedExistingAsset, context);

  const geometryAudit = auditBuildingGeometry(args.asset.geometry);
  if (!geometryAudit.valid || !geometryAudit.fingerprint) {
    throw new Error(`Building geometry failed durable validation: ${geometryAudit.failures.join(', ') || 'invalid geometry'}.`);
  }

  let evidenceId: number | null = null;
  if (args.mode === 'automatic') {
    if (!args.evidence) throw new Error('Automatic BuildingAsset persistence requires verification evidence.');
    evidenceId = await rpc<number>('admin_record_building_verification_evidence', {
      p_listing_id: args.listingId,
      p_input_snapshot: args.expectedSnapshot,
      p_evidence: args.evidence,
    });
  }

  const result = await rpc<{
    asset: BuildingAsset;
    historyEventId?: number | string;
  }>('admin_commit_building_asset', {
    p_listing_id: args.listingId,
    p_asset: args.asset,
    p_expected_revision_token: context.revisionToken,
    p_input_snapshot: args.expectedSnapshot,
    p_expected_asset_revision_token: context.assetRevisionToken,
    p_persistence_method: args.mode,
    p_geometry_fingerprint: geometryAudit.fingerprint,
    p_evidence_id: evidenceId,
    p_note: args.note ?? null,
  });

  return {
    asset: result.asset,
    listing: null,
    historyEventId: result.historyEventId === undefined ? undefined : String(result.historyEventId),
  };
};

export const getBuildingAssetHistoryFromSupabase = async (listingId: string): Promise<BuildingAssetHistoryEvent[]> => {
  const history = await rpc<BuildingAssetHistoryEvent[]>('admin_list_building_asset_history', { p_listing_id: listingId });
  return Array.isArray(history) ? history : [];
};

export const rollbackBuildingAssetInSupabase = async (args: {
  listingId: string;
  expectedSnapshot: BuildingVerificationInputSnapshot;
  expectedExistingAsset: BuildingAssetRevision;
  historyEventId: string;
}): Promise<{ asset: BuildingAsset; listing: null; historyEventId?: string }> => {
  const context = await getDurableBuildingPersistenceContext(args.listingId);
  assertSnapshotMatchesDurableContext(args.expectedSnapshot, context);
  assertAssetRevisionMatchesDurableContext(args.expectedExistingAsset, context);
  const historyId = Number(args.historyEventId);
  if (!Number.isSafeInteger(historyId) || historyId <= 0) throw new Error('Invalid BuildingAsset history revision.');

  const result = await rpc<{ asset: BuildingAsset; historyEventId?: number | string }>('admin_rollback_building_asset', {
    p_listing_id: args.listingId,
    p_history_id: historyId,
    p_expected_revision_token: context.revisionToken,
    p_input_snapshot: args.expectedSnapshot,
    p_expected_asset_revision_token: context.assetRevisionToken,
  });
  return {
    asset: result.asset,
    listing: null,
    historyEventId: result.historyEventId === undefined ? undefined : String(result.historyEventId),
  };
};

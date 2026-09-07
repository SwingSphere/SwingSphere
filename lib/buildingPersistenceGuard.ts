import type { BuildingAsset, Listing } from '../types';
import { auditBuildingGeometry, haversineMeters } from './buildingGeometry';
import { normalizeAddressText } from './buildingVerification';
import type { BuildingVerificationEvidenceRecord } from './buildingVerificationEvidence';
import { getListingPhysicalAddress, getListingPhysicalCoords, getVenueForListing, type EntityCollections } from './entityCompatibility';
import { isApproximateLocation } from './publicLocation';

export const BUILDING_PERSISTENCE_POLICY_VERSION = 'building-persistence-v1';

export type BuildingVerificationInputSnapshot = {
  version: 1;
  listingId: string;
  venueId: string | null;
  normalizedAddress: string;
  latitude: number;
  longitude: number;
  visibility: 'public_exact' | 'not_public_exact';
  coordinateProvenance: string | null;
  coordinateConfidence: number | null;
  validatedAt: string | null;
  hash: string;
};

export type BuildingPersistenceMode = 'manual' | 'automatic';

export type BuildingAssetRevision = {
  id: string;
  updatedAt: string;
  fingerprint: string;
};

export type BuildingPersistenceGuardResult = {
  ok: boolean;
  reasons: string[];
  geometryFingerprint: string | null;
  currentSnapshot: BuildingVerificationInputSnapshot | null;
};

const stableHash = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `bvs-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const normalizedSnapshotPayload = (snapshot: Omit<BuildingVerificationInputSnapshot, 'hash'>) => JSON.stringify({
  version: snapshot.version,
  listingId: snapshot.listingId,
  venueId: snapshot.venueId,
  normalizedAddress: snapshot.normalizedAddress,
  latitude: Number(snapshot.latitude.toFixed(7)),
  longitude: Number(snapshot.longitude.toFixed(7)),
  visibility: snapshot.visibility,
  coordinateProvenance: snapshot.coordinateProvenance,
  coordinateConfidence: snapshot.coordinateConfidence,
  validatedAt: snapshot.validatedAt,
});

export const createBuildingAssetRevision = (asset: BuildingAsset | null | undefined): BuildingAssetRevision | null => {
  if (!asset) return null;
  const audit = auditBuildingGeometry(asset.geometry);
  if (!audit.valid || !audit.fingerprint) return null;
  return { id: asset.id, updatedAt: asset.capture.updatedAt, fingerprint: audit.fingerprint };
};

export const createBuildingVerificationInputSnapshot = (
  listing: Listing,
  collections: EntityCollections = {},
): BuildingVerificationInputSnapshot | null => {
  const coords = getListingPhysicalCoords(listing, collections);
  if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null;
  const venue = getVenueForListing(listing, collections);
  const locationMeta = venue?.locationMeta ?? listing.locationMeta;
  const address = getListingPhysicalAddress(listing, collections);
  const visibility: BuildingVerificationInputSnapshot['visibility'] = !isApproximateLocation(listing) && (!venue || venue.visibility === 'public_exact')
    ? 'public_exact'
    : 'not_public_exact';
  const base = {
    version: 1 as const,
    listingId: listing.id,
    venueId: venue?.id ?? null,
    normalizedAddress: normalizeAddressText([
      address.addressLine1,
      address.addressLine2,
      address.city,
      address.region,
      address.postalCode,
      address.country,
    ].filter(Boolean).join(', ')),
    latitude: coords.lat,
    longitude: coords.lng,
    visibility,
    coordinateProvenance: locationMeta?.geocoderSource ?? locationMeta?.source ?? (locationMeta?.manualAdjustment ? 'manual-adjustment' : null),
    coordinateConfidence: locationMeta?.confidence ?? null,
    validatedAt: locationMeta?.validatedAt ?? null,
  };
  return { ...base, hash: stableHash(normalizedSnapshotPayload(base)) };
};

const evidenceMatchesSnapshot = (
  evidence: BuildingVerificationEvidenceRecord,
  snapshot: BuildingVerificationInputSnapshot,
): string[] => {
  const reasons: string[] = [];
  if (evidence.listingId !== snapshot.listingId) reasons.push('verification evidence belongs to a different listing');
  if (evidence.venueId && snapshot.venueId && evidence.venueId !== snapshot.venueId) reasons.push('verification evidence belongs to a different Venue');

  // The snapshot hash is the canonical identity of the evaluated location. When
  // present, do not independently re-derive address equality from evidence text:
  // legacy evidence can contain a more verbose display address (district/suburb)
  // than the normalized geopoint fields even though it was produced from this
  // exact snapshot. Falling back to field comparisons is only for older evidence
  // records that predate inputSnapshotHash.
  if (evidence.inputSnapshotHash) {
    if (evidence.inputSnapshotHash !== snapshot.hash) reasons.push('verification input snapshot is stale');
    return reasons;
  }

  if (normalizeAddressText(evidence.normalizedAddress) !== snapshot.normalizedAddress) reasons.push('listing address changed after verification');
  if (haversineMeters(evidence.canonicalCoordinate, { lat: snapshot.latitude, lng: snapshot.longitude }) > 1.5) reasons.push('canonical coordinate changed after verification');
  return reasons;
};

export const guardBuildingAssetPersistence = (args: {
  listing: Listing;
  collections?: EntityCollections;
  asset: BuildingAsset;
  expectedSnapshot?: BuildingVerificationInputSnapshot | null;
  evidence?: BuildingVerificationEvidenceRecord | null;
  existingAsset?: BuildingAsset | null;
  expectedExistingAsset?: BuildingAssetRevision | null;
  mode: BuildingPersistenceMode;
  allowReplaceExisting?: boolean;
}): BuildingPersistenceGuardResult => {
  const reasons: string[] = [];
  const snapshot = createBuildingVerificationInputSnapshot(args.listing, args.collections ?? {});
  if (!snapshot) reasons.push('listing has no valid canonical coordinate');
  else {
    if (snapshot.visibility !== 'public_exact') reasons.push('precise building persistence is disabled for private or approximate locations');
    if (!args.expectedSnapshot) reasons.push('missing expected location snapshot');
    else if (args.expectedSnapshot.hash !== snapshot.hash) reasons.push('listing or Venue location changed since the editor loaded');
  }

  const audit = auditBuildingGeometry(args.asset.geometry);
  if (!audit.valid || !audit.geometry || !audit.fingerprint) {
    reasons.push(`invalid building geometry${audit.failures.length ? `: ${audit.failures.join(', ')}` : ''}`);
  }
  if (args.asset.capture.vertexCount > 20_000 || audit.vertexCount > 20_000) reasons.push('building geometry exceeds the safe vertex limit');
  if (args.asset.capture.polygonCount !== audit.polygonCount || args.asset.capture.ringCount !== audit.ringCount || args.asset.capture.vertexCount !== audit.vertexCount) {
    reasons.push('building capture metadata does not match the submitted geometry');
  }
  const height = args.asset.renderHeightMeters;
  const minHeight = args.asset.renderMinHeightMeters;
  if (height !== undefined && (!Number.isFinite(height) || height < 0 || height > 1_000)) reasons.push('render height is outside the allowed range');
  if (minHeight !== undefined && (!Number.isFinite(minHeight) || minHeight < 0 || minHeight > 1_000)) reasons.push('render minimum height is outside the allowed range');
  if (height !== undefined && minHeight !== undefined && minHeight > height) reasons.push('render minimum height exceeds render height');

  const currentAssetRevision = createBuildingAssetRevision(args.existingAsset);
  if (args.existingAsset) {
    if (args.expectedExistingAsset === undefined) reasons.push('missing expected BuildingAsset revision');
    else if (!args.expectedExistingAsset) reasons.push('BuildingAsset was created after the editor loaded');
    else if (!currentAssetRevision) reasons.push('current BuildingAsset revision could not be verified');
    else if (
      currentAssetRevision.id !== args.expectedExistingAsset.id
      || currentAssetRevision.updatedAt !== args.expectedExistingAsset.updatedAt
      || currentAssetRevision.fingerprint !== args.expectedExistingAsset.fingerprint
    ) reasons.push('BuildingAsset changed after the editor loaded');
  } else if (args.expectedExistingAsset) {
    reasons.push('BuildingAsset was removed after the editor loaded');
  }

  if (args.existingAsset && args.mode === 'automatic') reasons.push('automatic persistence cannot replace an existing authored BuildingAsset');
  if (args.existingAsset && args.mode === 'manual' && !args.allowReplaceExisting) reasons.push('replacing an existing BuildingAsset requires an explicit manual overwrite');

  if (args.mode === 'automatic') {
    if (!args.evidence) reasons.push('automatic persistence requires verification evidence');
    else if (snapshot) {
      reasons.push(...evidenceMatchesSnapshot(args.evidence, snapshot));
      if (!args.evidence.autoAccept || args.evidence.outcome !== 'verified') reasons.push('verification evidence is not in the definitive automatic tier');
      if (!['exact_address_and_pin', 'authoritative_unique_pin'].includes(String(args.evidence.autoAcceptMethod))) reasons.push('verification method is not approved for automatic persistence');
      if (args.evidence.providerSnapshot.status !== 'completed') reasons.push('provider evaluation was incomplete');
      if (!args.evidence.bestCandidate?.footprintFingerprint) reasons.push('verification evidence has no definitive footprint fingerprint');
      else if (audit.fingerprint && args.evidence.bestCandidate.footprintFingerprint !== audit.fingerprint) reasons.push('submitted geometry no longer matches the verified candidate fingerprint');
    }
  } else if (args.evidence && snapshot) {
    // Manual saves can resolve ambiguous cases, but stale evidence is still
    // rejected so an older venue load cannot overwrite newer geography.
    reasons.push(...evidenceMatchesSnapshot(args.evidence, snapshot));
  }

  return { ok: reasons.length === 0, reasons, geometryFingerprint: audit.fingerprint, currentSnapshot: snapshot };
};

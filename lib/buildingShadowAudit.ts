import type { BuildingAsset, Listing } from '../types';
import {
  formatListingPhysicalAddress,
  getBuildingAssetForListing,
  getListingPhysicalCoords,
  getVenueForListing,
  type EntityCollections,
} from './entityCompatibility';
import { auditBuildingGeometry, haversineMeters, pointIntersectsBuildingGeometry, pointToBuildingDistanceMeters } from './buildingGeometry';
import { getBuildingVerificationForListing, listingHasExactBuildingAddress } from './buildingVerification';
import { isApproximateLocation } from './publicLocation';
import { latestBuildingEvidenceByListing, type BuildingVerificationEvidenceRecord } from './buildingVerificationEvidence';

export type BuildingAuditCategory =
  | 'automatic_verification_candidate'
  | 'probable_quick_review'
  | 'ambiguous_buildings'
  | 'address_mismatch'
  | 'pin_location_review'
  | 'no_provider_footprint'
  | 'needs_provider_evaluation'
  | 'private_approximate_skipped'
  | 'has_verified_shared_asset';

export type BuildingCatalogAuditEntry = {
  listingId: string;
  listingName: string;
  listingType: Listing['type'];
  address: string;
  coordinate: { lat: number; lng: number } | null;
  category: BuildingAuditCategory;
  reason: string;
  assetId: string | null;
  assetOwnerListingId: string | null;
  inheritedAsset: boolean;
  ignoredDuplicateAssetId: string | null;
  footprintFingerprint: string | null;
  providerSource: string | null;
  providerFeatureIds: string[];
  pinIntersects: boolean | null;
  pinToFootprintMeters: number | null;
  warnings: string[];
  evidence: BuildingVerificationEvidenceRecord | null;
};

export type BuildingCatalogShadowReport = {
  mode: 'shadow';
  generatedAt: string;
  totals: {
    publicListings: number;
    publicExactAddressListingsEvaluated: number;
    automaticVerificationCandidates: number;
    probable: number;
    ambiguous: number;
    addressConflicts: number;
    pinLocationReview: number;
    noUsableProviderFootprint: number;
    needsProviderEvaluation: number;
    privateApproximateSkipped: number;
    hasVerifiedOrSharedAsset: number;
    existingAssetsPreserved: number;
  };
  categories: Record<BuildingAuditCategory, number>;
  entries: BuildingCatalogAuditEntry[];
};

export const BUILDING_AUDIT_CATEGORY_LABELS: Record<BuildingAuditCategory, string> = {
  automatic_verification_candidate: 'Automatic verification candidate',
  probable_quick_review: 'Probable — quick review',
  ambiguous_buildings: 'Ambiguous buildings',
  address_mismatch: 'Address mismatch',
  pin_location_review: 'Pin / location review',
  no_provider_footprint: 'No usable provider footprint',
  needs_provider_evaluation: 'Needs provider evaluation',
  private_approximate_skipped: 'Private / approximate — skipped',
  has_verified_shared_asset: 'Has verified / shared asset',
};

const CATEGORIES = Object.keys(BUILDING_AUDIT_CATEGORY_LABELS) as BuildingAuditCategory[];

const categoryFromStoredVerification = (
  outcome: string | undefined,
): BuildingAuditCategory | null => {
  if (outcome === 'verified') return 'automatic_verification_candidate';
  if (outcome === 'probable') return 'probable_quick_review';
  if (outcome === 'ambiguous') return 'ambiguous_buildings';
  if (outcome === 'address_mismatch') return 'address_mismatch';
  if (outcome === 'pin_mismatch' || outcome === 'needs_location_review') return 'pin_location_review';
  if (outcome === 'no_building_data') return 'no_provider_footprint';
  return null;
};

const categoryFromEvidence = (evidence: BuildingVerificationEvidenceRecord): BuildingAuditCategory => {
  if (evidence.outcome === 'verified' && evidence.autoAccept) return 'automatic_verification_candidate';
  if (evidence.outcome === 'probable') return 'probable_quick_review';
  if (evidence.outcome === 'ambiguous') return 'ambiguous_buildings';
  if (evidence.outcome === 'address_mismatch') return 'address_mismatch';
  if (evidence.outcome === 'pin_mismatch' || evidence.outcome === 'needs_location_review') return 'pin_location_review';
  if (evidence.providerSnapshot.status === 'no_building_footprints') return 'no_provider_footprint';
  return 'needs_provider_evaluation';
};

const finiteCoordinate = (coords: { lat: number; lng: number } | null): boolean => Boolean(
  coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
  && coords.lat >= -90 && coords.lat <= 90 && coords.lng >= -180 && coords.lng <= 180,
);

export const buildBuildingCatalogShadowReport = (
  listings: Listing[],
  buildingAssets: BuildingAsset[],
  collections: EntityCollections = {},
  generatedAt = new Date().toISOString(),
  evidenceRecords: BuildingVerificationEvidenceRecord[] = [],
): BuildingCatalogShadowReport => {
  const entries: BuildingCatalogAuditEntry[] = [];
  const evidenceByListing = latestBuildingEvidenceByListing(evidenceRecords);
  const catalogCollections = { ...collections, listings };
  for (const listing of listings) {
    if (listing.status !== 'approved') continue;
    const address = formatListingPhysicalAddress(listing, catalogCollections);
    const storedCoordinate = getListingPhysicalCoords(listing, catalogCollections);
    let coordinate = storedCoordinate;
    const verification = getBuildingVerificationForListing(listing, catalogCollections);
    const physicalVenue = getVenueForListing(listing, catalogCollections);
    const approximate = isApproximateLocation(listing)
      || physicalVenue?.visibility === 'private'
      || physicalVenue?.visibility === 'public_approximate';
    const exactAddress = listingHasExactBuildingAddress(listing, catalogCollections);
    const resolvedAsset = getBuildingAssetForListing(listing, buildingAssets, catalogCollections);
    const explicitAsset = listing.buildingAssetId
      ? buildingAssets.find((asset) => asset.id === listing.buildingAssetId) ?? null
      : null;
    const inheritedAsset = Boolean(resolvedAsset && resolvedAsset.listingId !== listing.id);
    const assetOwnerListing = inheritedAsset
      ? listings.find((candidate) => candidate.id === resolvedAsset?.listingId) ?? null
      : null;
    const linkedVenueId = 'venueId' in listing ? listing.venueId : undefined;
    const hasCanonicalVenueRecord = Boolean(
      linkedVenueId && collections.venues?.some((venue) => venue.id === linkedVenueId),
    );
    if (inheritedAsset && !hasCanonicalVenueRecord && assetOwnerListing) {
      coordinate = getListingPhysicalCoords(assetOwnerListing, catalogCollections);
    }
    const ignoredDuplicateAssetId = explicitAsset && resolvedAsset && explicitAsset.id !== resolvedAsset.id
      ? explicitAsset.id
      : null;
    const warnings: string[] = [];
    const evidence = evidenceByListing.get(listing.id) ?? null;
    const evidenceCoordinate = evidence?.canonicalCoordinate ?? null;
    const legacyCoordinateDriftMeters = storedCoordinate && evidenceCoordinate
      ? haversineMeters(storedCoordinate, evidenceCoordinate)
      : null;
    if (resolvedAsset && evidenceCoordinate) coordinate = evidenceCoordinate;
    if (ignoredDuplicateAssetId) warnings.push(`duplicate listing-owned asset ${ignoredDuplicateAssetId} is ignored in favor of the Venue asset`);
    if (resolvedAsset && !resolvedAsset.provider.featureIds.length) warnings.push('asset has no provider feature ID; geometry remains usable and provenance is incomplete');

    let category: BuildingAuditCategory;
    let reason: string;
    let fingerprint: string | null = null;
    let pinIntersects: boolean | null = null;
    let pinToFootprintMeters: number | null = null;

    if (approximate) {
      category = 'private_approximate_skipped';
      reason = 'Precise building verification is intentionally skipped for private or approximate public locations.';
    } else if (!finiteCoordinate(coordinate)) {
      category = 'pin_location_review';
      reason = 'The canonical coordinate is missing, invalid, or outside geographic bounds.';
    } else if (!exactAddress) {
      category = 'pin_location_review';
      reason = 'The public listing does not contain a building-level street number.';
    } else if (resolvedAsset) {
      const geometryAudit = auditBuildingGeometry(resolvedAsset.geometry);
      fingerprint = geometryAudit.fingerprint;
      if (!geometryAudit.valid || !geometryAudit.geometry) {
        category = 'no_provider_footprint';
        reason = `The saved asset is not renderable: ${geometryAudit.failures.join(', ') || 'empty geometry'}.`;
      } else {
        pinIntersects = pointIntersectsBuildingGeometry({ lng: coordinate!.lng, lat: coordinate!.lat }, geometryAudit.geometry);
        pinToFootprintMeters = pointToBuildingDistanceMeters({ lng: coordinate!.lng, lat: coordinate!.lat }, geometryAudit.geometry);
        if (legacyCoordinateDriftMeters !== null && legacyCoordinateDriftMeters >= 60 && pinToFootprintMeters < 60) {
          category = 'pin_location_review';
          reason = `The legacy listing pin is ${legacyCoordinateDriftMeters.toFixed(1)}m from the evaluated runtime Venue coordinate; the preserved asset agrees with the runtime coordinate.`;
          warnings.push('reconcile the legacy listing coordinate with the canonical Venue record');
        } else if (pinToFootprintMeters >= 60) {
          category = 'pin_location_review';
          reason = `The canonical pin is ${pinToFootprintMeters.toFixed(1)}m from the preserved building asset.`;
        } else {
          category = 'has_verified_shared_asset';
          reason = inheritedAsset
            ? `Inherits preserved physical Venue asset ${resolvedAsset.id}.`
            : `Preserves existing authored asset ${resolvedAsset.id}; automatic replacement is disabled.`;
        }
      }
    } else {
      const storedCategory = evidence ? categoryFromEvidence(evidence) : categoryFromStoredVerification(verification?.outcome);
      category = storedCategory ?? 'needs_provider_evaluation';
      reason = evidence
        ? evidence.providerSnapshot.status === 'provider_unavailable'
          ? 'The live provider was unavailable; this remains retryable and is not no-building data.'
          : evidence.providerSnapshot.status === 'tile_timeout'
            ? 'Provider tiles timed out; this remains retryable and is not no-building data.'
            : evidence.providerSnapshot.status === 'footprints_address_unresolved'
              ? `Found ${evidence.providerSnapshot.individualFootprintCount} individual footprint(s), but mapped addresses could not be resolved.`
              : evidence.rejectionReasons.join('; ') || evidence.acceptanceReasons.join('; ') || `Live provider evaluation completed with ${evidence.outcome}.`
        : storedCategory
        ? verification?.notes?.join('; ') || 'Stored shadow verification evidence is available.'
        : 'No saved asset or provider-evaluation evidence exists yet; this is not treated as proof that provider data is absent.';
    }

    entries.push({
      listingId: listing.id,
      listingName: listing.name,
      listingType: listing.type,
      address,
      coordinate,
      category,
      reason,
      assetId: resolvedAsset?.id ?? null,
      assetOwnerListingId: resolvedAsset?.listingId ?? null,
      inheritedAsset,
      ignoredDuplicateAssetId,
      footprintFingerprint: fingerprint,
      providerSource: resolvedAsset?.provider.source ?? null,
      providerFeatureIds: resolvedAsset?.provider.featureIds ?? [],
      pinIntersects,
      pinToFootprintMeters,
      warnings,
      evidence,
    });
  }

  const categories = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<BuildingAuditCategory, number>;
  entries.forEach((entry) => { categories[entry.category] += 1; });
  const publicExactAddressListingsEvaluated = entries.filter((entry) => entry.category !== 'private_approximate_skipped' && Boolean(entry.address.match(/\d/))).length;
  return {
    mode: 'shadow',
    generatedAt,
    totals: {
      publicListings: entries.length,
      publicExactAddressListingsEvaluated,
      automaticVerificationCandidates: categories.automatic_verification_candidate,
      probable: categories.probable_quick_review,
      ambiguous: categories.ambiguous_buildings,
      addressConflicts: categories.address_mismatch,
      pinLocationReview: categories.pin_location_review,
      noUsableProviderFootprint: categories.no_provider_footprint,
      needsProviderEvaluation: categories.needs_provider_evaluation,
      privateApproximateSkipped: categories.private_approximate_skipped,
      hasVerifiedOrSharedAsset: categories.has_verified_shared_asset,
      existingAssetsPreserved: entries.filter((entry) => Boolean(entry.assetId)).length,
    },
    categories,
    entries: entries.sort((a, b) => a.category.localeCompare(b.category) || a.listingName.localeCompare(b.listingName)),
  };
};

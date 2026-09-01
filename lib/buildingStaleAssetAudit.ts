import type { BuildingAsset, Listing } from '../types';
import { auditBuildingGeometry, haversineMeters, pointIntersectsBuildingGeometry, pointToBuildingDistanceMeters } from './buildingGeometry';
import { latestBuildingEvidenceByListing, type BuildingVerificationEvidenceRecord } from './buildingVerificationEvidence';

export type StaleAssetRecommendation =
  | 'keep_asset'
  | 'keep_asset_fix_legacy_pin'
  | 'keep_pin_replace_asset'
  | 'replace_both'
  | 'valid_multi_part_geometry'
  | 'needs_human_research';

export type StaleBuildingAssetAudit = {
  listingId: string;
  listingName: string;
  assetId: string;
  legacyListingCoordinate: { lat: number; lng: number };
  evaluatedCanonicalCoordinate: { lat: number; lng: number } | null;
  legacyToCanonicalMeters: number | null;
  legacyPinToAssetMeters: number;
  canonicalPinToAssetMeters: number | null;
  canonicalPinIntersectsAsset: boolean | null;
  canonicalPinToLiveFootprintMeters: number | null;
  canonicalPinIntersectsLiveFootprint: boolean | null;
  assetFingerprint: string | null;
  liveFootprintFingerprint: string | null;
  sharedProviderFeatureIds: string[];
  recommendation: StaleAssetRecommendation;
  reasons: string[];
};

const finiteListingCoordinate = (listing: Listing) => ({
  lat: Number(listing.geopoint.latitude),
  lng: Number(listing.geopoint.longitude),
});

export const auditStaleBuildingAssets = (
  listingIds: string[],
  listings: Listing[],
  assets: BuildingAsset[],
  evidenceRecords: BuildingVerificationEvidenceRecord[],
): StaleBuildingAssetAudit[] => {
  const evidenceByListing = latestBuildingEvidenceByListing(evidenceRecords);
  return listingIds.flatMap((listingId) => {
    const listing = listings.find((item) => item.id === listingId);
    const asset = assets.find((item) => item.listingId === listingId || item.id === listing?.buildingAssetId);
    if (!listing || !asset) return [];
    const geometryAudit = auditBuildingGeometry(asset.geometry);
    if (!geometryAudit.valid || !geometryAudit.geometry) return [];
    const legacyListingCoordinate = finiteListingCoordinate(listing);
    const evidence = evidenceByListing.get(listingId) ?? null;
    const canonical = evidence?.canonicalCoordinate ?? null;
    const legacyPinToAssetMeters = pointToBuildingDistanceMeters(legacyListingCoordinate, geometryAudit.geometry);
    const canonicalPinToAssetMeters = canonical ? pointToBuildingDistanceMeters(canonical, geometryAudit.geometry) : null;
    const canonicalPinIntersectsAsset = canonical ? pointIntersectsBuildingGeometry(canonical, geometryAudit.geometry) : null;
    const liveDistance = evidence?.bestCandidate?.minimumPinToFootprintMeters ?? null;
    const liveIntersects = evidence?.bestCandidate?.pinIntersects ?? null;
    const legacyToCanonicalMeters = canonical ? haversineMeters(legacyListingCoordinate, canonical) : null;
    const sharedProviderFeatureIds = asset.provider.featureIds.filter((id) => evidence?.bestCandidate?.providerFeatureIds.includes(id));
    const reasons: string[] = [];
    let recommendation: StaleAssetRecommendation = 'needs_human_research';

    if (canonicalPinToAssetMeters !== null && canonicalPinToAssetMeters <= 6) {
      if (legacyToCanonicalMeters !== null && legacyToCanonicalMeters >= 60 && legacyPinToAssetMeters >= 60) {
        recommendation = 'keep_asset_fix_legacy_pin';
        reasons.push('runtime canonical coordinate reaches the saved asset while the legacy listing coordinate does not');
      } else {
        recommendation = 'keep_asset';
        reasons.push('canonical coordinate reaches the saved footprint');
      }
      if (liveDistance !== null && liveDistance <= 6) reasons.push('current provider also returns a footprint at the canonical coordinate');
    } else if (canonicalPinToAssetMeters !== null && canonicalPinToAssetMeters >= 60 && liveDistance !== null && liveDistance <= 35) {
      recommendation = 'keep_pin_replace_asset';
      reasons.push('saved geometry is stale relative to the pin while current provider geometry is materially closer');
    } else if (canonicalPinToAssetMeters !== null && canonicalPinToAssetMeters >= 60 && liveDistance !== null && liveDistance > 35) {
      recommendation = 'needs_human_research';
      reasons.push('neither the saved geometry nor current provider footprint adequately agrees with the canonical pin');
      reasons.push('human address research is required before either replacement');
    } else {
      reasons.push('evidence does not yet isolate the pin or asset as the single root cause');
    }
    if (sharedProviderFeatureIds.length && geometryAudit.fingerprint !== evidence?.bestCandidate?.footprintFingerprint) {
      reasons.push('saved and live geometry disagree despite shared provider feature provenance');
    }

    return [{
      listingId,
      listingName: listing.name,
      assetId: asset.id,
      legacyListingCoordinate,
      evaluatedCanonicalCoordinate: canonical,
      legacyToCanonicalMeters,
      legacyPinToAssetMeters,
      canonicalPinToAssetMeters,
      canonicalPinIntersectsAsset,
      canonicalPinToLiveFootprintMeters: liveDistance,
      canonicalPinIntersectsLiveFootprint: liveIntersects,
      assetFingerprint: geometryAudit.fingerprint,
      liveFootprintFingerprint: evidence?.bestCandidate?.footprintFingerprint ?? null,
      sharedProviderFeatureIds,
      recommendation,
      reasons,
    }];
  });
};

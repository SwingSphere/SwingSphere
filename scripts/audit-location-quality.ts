import fs from 'node:fs';
import path from 'node:path';
import type { BuildingAsset, Listing } from '../types.ts';
import { pointToBuildingDistanceMeters, haversineMeters } from '../lib/buildingGeometry.ts';
import { latestBuildingEvidenceByListing, type BuildingVerificationEvidenceRecord } from '../lib/buildingVerificationEvidence.ts';
import { getBuildingAssetForListing, getListingPhysicalCoords } from '../lib/entityCompatibility.ts';
import { assessListingCoordinateQuality } from '../lib/listingLocationQuality.ts';

const root = process.cwd();
const listings = JSON.parse(fs.readFileSync(path.join(root, 'data/listings.local.json'), 'utf8')) as Listing[];
const assets = JSON.parse(fs.readFileSync(path.join(root, 'data/building-assets.local.json'), 'utf8')) as BuildingAsset[];
const evidencePath = path.join(root, 'data/building-verification-evidence.local.json');
const evidence = fs.existsSync(evidencePath)
  ? JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as BuildingVerificationEvidenceRecord[]
  : [];
const latestEvidence = latestBuildingEvidenceByListing(evidence);

export type LaunchLocationAuditCategory =
  | 'pass'
  | 'review_coordinate'
  | 'review_asset'
  | 'review_provider'
  | 'private_approximate'
  | 'invalid';

type AuditRow = {
  id: string;
  name: string;
  type: Listing['type'];
  category: LaunchLocationAuditCategory;
  location: string;
  coordinateQuality: ReturnType<typeof assessListingCoordinateQuality>['level'];
  source: string | null;
  confidence: number | null;
  assetId: string | null;
  pinToAssetMeters: number | null;
  evidenceOutcome: string | null;
  evidenceAgeMeters: number | null;
  reasons: string[];
};

const rows: AuditRow[] = [];
for (const listing of listings.filter((item) => item.status === 'approved')) {
  const collections = { listings };
  const quality = assessListingCoordinateQuality(listing, collections);
  const coords = getListingPhysicalCoords(listing, collections);
  const asset = getBuildingAssetForListing(listing, assets, collections);
  const pinToAssetMeters = asset && coords ? pointToBuildingDistanceMeters(coords, asset.geometry) : null;
  const record = latestEvidence.get(listing.id) ?? null;
  const evidenceAgeMeters = record && coords
    ? haversineMeters(coords, record.canonicalCoordinate)
    : null;
  const currentEvidence = record && (evidenceAgeMeters ?? 0) <= 5 ? record : null;
  const reasons: string[] = [];
  let category: LaunchLocationAuditCategory = 'pass';

  if (quality.level === 'approximate_private') {
    category = 'private_approximate';
    reasons.push('precise building inference intentionally skipped');
  } else if (quality.level === 'invalid') {
    category = 'invalid';
    reasons.push(...quality.reasons);
  } else {
    const assetStronglyAgrees = pinToAssetMeters !== null && pinToAssetMeters <= 6;
    const inheritedVenueAsset = listing.type === 'event' && Boolean(asset) && pinToAssetMeters !== null && pinToAssetMeters <= 15;
    if (quality.weakForBuildingSelection && quality.exactBuildingAddress) {
      const legacyMetadataOnly = quality.level === 'legacy_untyped' && assetStronglyAgrees;
      if (!legacyMetadataOnly && !inheritedVenueAsset) {
        category = 'review_coordinate';
        reasons.push(...quality.reasons);
      } else {
        reasons.push(...quality.reasons.map((reason) => `metadata hygiene: ${reason}`));
      }
    }
    if (pinToAssetMeters !== null && pinToAssetMeters > 60) {
      category = 'review_asset';
      reasons.push(`canonical pin is ${pinToAssetMeters.toFixed(1)}m from the preserved asset`);
      if (!quality.canPreferPinOverSavedAsset) reasons.push('pin provenance is not strong enough to assume the asset is the bad side');
    } else if (pinToAssetMeters !== null && pinToAssetMeters > 15 && category === 'pass') {
      category = 'review_asset';
      reasons.push(`canonical pin is ${pinToAssetMeters.toFixed(1)}m from the preserved asset`);
    }
    if (!asset && quality.exactBuildingAddress && category === 'pass') {
      category = 'review_provider';
      reasons.push('exact public location has no saved BuildingAsset yet');
    }
    if (record && !currentEvidence) {
      reasons.push(`stored verification evidence is stale by ${(evidenceAgeMeters ?? 0).toFixed(1)}m`);
    }
    if (currentEvidence && ['address_mismatch', 'pin_mismatch', 'ambiguous', 'needs_location_review', 'provider_unavailable', 'tile_timeout', 'geometry_processing_error'].includes(currentEvidence.outcome)) {
      const verifiedPhysicalAssetWins = assetStronglyAgrees && !['street_level', 'uncertain'].includes(quality.level);
      if (!verifiedPhysicalAssetWins) {
        if (category === 'pass') category = 'review_provider';
        reasons.push(`latest building verification outcome: ${currentEvidence.outcome}`);
      } else {
        reasons.push(`provider note: ${currentEvidence.outcome} did not override the pin-aligned preserved asset`);
      }
    }
  }

  rows.push({
    id: listing.id,
    name: listing.name,
    type: listing.type,
    category,
    location: listing.location,
    coordinateQuality: quality.level,
    source: quality.source,
    confidence: quality.confidence,
    assetId: asset?.id ?? null,
    pinToAssetMeters,
    evidenceOutcome: currentEvidence?.outcome ?? null,
    evidenceAgeMeters,
    reasons: Array.from(new Set(reasons)),
  });
}

const categories = rows.reduce<Record<LaunchLocationAuditCategory, number>>((counts, row) => {
  counts[row.category] += 1;
  return counts;
}, { pass: 0, review_coordinate: 0, review_asset: 0, review_provider: 0, private_approximate: 0, invalid: 0 });
const report = { generatedAt: new Date().toISOString(), totals: { listings: rows.length, clubs: rows.filter((row) => row.type === 'club').length, events: rows.filter((row) => row.type === 'event').length }, categories, rows };

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write('SwingSphere prelaunch location quality audit\n');
  process.stdout.write(`Approved listings: ${report.totals.listings} (${report.totals.clubs} clubs, ${report.totals.events} events)\n`);
  process.stdout.write(`Pass: ${categories.pass}\nCoordinate review: ${categories.review_coordinate}\nAsset review: ${categories.review_asset}\nProvider/building review: ${categories.review_provider}\nPrivate/approximate: ${categories.private_approximate}\nInvalid: ${categories.invalid}\n\n`);
  for (const row of rows.filter((item) => !['pass', 'private_approximate'].includes(item.category))) {
    process.stdout.write(`- [${row.category}] ${row.name} — ${row.location}\n`);
    process.stdout.write(`  Coordinate: ${row.coordinateQuality} | ${row.source ?? 'no provenance'} | ${row.confidence ?? 'n/a'}\n`);
    if (row.pinToAssetMeters !== null) process.stdout.write(`  Pin -> asset: ${row.pinToAssetMeters.toFixed(1)}m\n`);
    row.reasons.forEach((reason) => process.stdout.write(`  ${reason}\n`));
  }
}

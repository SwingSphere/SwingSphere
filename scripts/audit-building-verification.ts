import fs from 'node:fs';
import path from 'node:path';
import type { BuildingAsset, Listing } from '../types.ts';
import { buildBuildingCatalogShadowReport, BUILDING_AUDIT_CATEGORY_LABELS } from '../lib/buildingShadowAudit.ts';
import type { BuildingVerificationEvidenceRecord } from '../lib/buildingVerificationEvidence.ts';
import { auditStaleBuildingAssets } from '../lib/buildingStaleAssetAudit.ts';

const root = process.cwd();
const listings = JSON.parse(fs.readFileSync(path.join(root, 'data/listings.local.json'), 'utf8')) as Listing[];
const assets = JSON.parse(fs.readFileSync(path.join(root, 'data/building-assets.local.json'), 'utf8')) as BuildingAsset[];
const evidencePath = path.join(root, 'data/building-verification-evidence.local.json');
const evidence = fs.existsSync(evidencePath)
  ? JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as BuildingVerificationEvidenceRecord[]
  : [];
const report = buildBuildingCatalogShadowReport(listings, assets, { listings }, new Date().toISOString(), evidence);
const staleAssetAudits = auditStaleBuildingAssets([
  'club-club-joi-la',
  'club-dalliance-columbia',
  'club-coliseum-mexico-city',
  'club-twist-sf',
  'club-colette-houston',
], listings, assets, evidence);

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write('SwingSphere building verification — SHADOW MODE\n');
  process.stdout.write(`Generated: ${report.generatedAt}\n`);
  process.stdout.write(`Public listings: ${report.totals.publicListings}\n`);
  process.stdout.write(`Public exact-address listings evaluated: ${report.totals.publicExactAddressListingsEvaluated}\n`);
  process.stdout.write(`Existing assets preserved: ${report.totals.existingAssetsPreserved}\n\n`);
  for (const [category, count] of Object.entries(report.categories)) {
    process.stdout.write(`${BUILDING_AUDIT_CATEGORY_LABELS[category as keyof typeof BUILDING_AUDIT_CATEGORY_LABELS]}: ${count}\n`);
  }
  const attention = report.entries.filter((entry) => !['has_verified_shared_asset', 'private_approximate_skipped'].includes(entry.category));
  process.stdout.write(`\nException cohort (${attention.length})\n`);
  for (const entry of attention) {
    process.stdout.write(`- [${BUILDING_AUDIT_CATEGORY_LABELS[entry.category]}] ${entry.listingName}: ${entry.reason}\n`);
  }
  const duplicatePointers = report.entries.filter((entry) => entry.ignoredDuplicateAssetId);
  process.stdout.write(`\nDuplicate listing-owned asset pointers ignored by Venue inheritance: ${duplicatePointers.length}\n`);
  duplicatePointers.forEach((entry) => process.stdout.write(`- ${entry.listingName}: ${entry.ignoredDuplicateAssetId} -> ${entry.assetId}\n`));
  const definitive = report.entries.filter((entry) => entry.category === 'automatic_verification_candidate' && entry.evidence?.autoAccept);
  process.stdout.write(`\nDefinitive automatic-persistence candidates (${definitive.length})\n`);
  for (const entry of definitive) {
    const candidate = entry.evidence?.bestCandidate;
    process.stdout.write(`- ${entry.listingName} | ${entry.address}\n`);
    process.stdout.write(`  Candidate: ${candidate?.candidateAddress ?? 'address unavailable'} | ${candidate?.pinIntersects ? 'pin inside footprint' : `${candidate?.minimumPinToFootprintMeters.toFixed(1)}m from footprint`}\n`);
    process.stdout.write(`  Confidence: ${Math.round((candidate?.confidence ?? 0) * 100)}% | score ${candidate?.score ?? 0} | margin ${entry.evidence?.scoreMargin ?? 'n/a'}\n`);
    process.stdout.write(`  Provenance: ${candidate?.providerSource ?? entry.evidence?.providerSnapshot.source ?? 'unknown'} | ${(candidate?.providerFeatureIds ?? []).join(', ') || 'no feature ids'}\n`);
    process.stdout.write(`  Rule: ${entry.evidence?.autoAcceptMethod ?? 'none'} | ${entry.evidence?.acceptanceReasons.join('; ') ?? ''}\n`);
  }
  process.stdout.write(`\nStale existing-asset reconciliation (${staleAssetAudits.length})\n`);
  for (const item of staleAssetAudits) {
    process.stdout.write(`- ${item.listingName}: ${item.recommendation}\n`);
    process.stdout.write(`  Legacy pin -> asset: ${item.legacyPinToAssetMeters.toFixed(1)}m | evaluated canonical -> asset: ${item.canonicalPinToAssetMeters?.toFixed(1) ?? 'n/a'}m | canonical -> live footprint: ${item.canonicalPinToLiveFootprintMeters?.toFixed(1) ?? 'n/a'}m\n`);
    process.stdout.write(`  Asset/live fingerprint: ${item.assetFingerprint ?? 'n/a'} / ${item.liveFootprintFingerprint ?? 'n/a'} | shared provider IDs: ${item.sharedProviderFeatureIds.join(', ') || 'none'}\n`);
    process.stdout.write(`  Reason: ${item.reasons.join('; ')}\n`);
  }
}

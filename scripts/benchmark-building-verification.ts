import fs from 'node:fs';
import path from 'node:path';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import type { BuildingAsset, Listing } from '../types';
import { runBuildingVerificationPipeline, type BuildingNeighborhoodSource } from '../lib/buildingVerificationPipeline';
import { createCachedBuildingAddressResolver, createNominatimBuildingAddressResolver, type BuildingAddressResolution } from '../lib/buildingAddressResolver';
import { fetchOsOpenMapLocalBuildingAtPoint } from '../lib/buildingFootprintSources';
import { fuseBuildingNeighborhood } from '../lib/buildingNeighborhoodFusion';
import { geometryFingerprint, getBuildingGeometryCenter, haversineMeters, pointIntersectsBuildingGeometry, pointToBuildingDistanceMeters, type ProviderFootprintFeature } from '../lib/buildingGeometry';
import { getBuildingAssetForListing, getListingPhysicalCoords } from '../lib/entityCompatibility';
import { queryMicrosoftBuildingFootprints } from '../lib/microsoftBuildingFootprintsServer';

// Ground truth is only read by the evaluator below, never the source or verifier.
const listings = JSON.parse(fs.readFileSync('data/listings.local.json', 'utf8')) as Listing[];
const assets = JSON.parse(fs.readFileSync('data/building-assets.local.json', 'utf8')) as BuildingAsset[];
const outputDirectory = path.resolve('docs/audits/building-verification-2026-09-05');
fs.mkdirSync(outputDirectory, { recursive: true });
const cacheDirectory = path.resolve('.codex-temp/building-benchmark');
fs.mkdirSync(cacheDirectory, { recursive: true });
const cachePath = path.join(cacheDirectory, 'addresses-v3.json');
const addressCache = new Map<string, BuildingAddressResolution>(fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : []);
const upstream = createNominatimBuildingAddressResolver({ maximumAttempts: 1, timeoutMs: 8000, userAgent: 'SwingSphere-Engineering-Audit/1.0', minimumIntervalMs: 1100 });
const addresses = createCachedBuildingAddressResolver({
  resolve: upstream.resolve,
  async resolveDetailed(lat, lng, context) {
    const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    if (addressCache.has(key)) return addressCache.get(key)!;
    const result = await upstream.resolveDetailed(lat, lng, context);
    if (result.status !== 'provider_error') {
      addressCache.set(key, result);
      fs.writeFileSync(cachePath, JSON.stringify([...addressCache]));
    }
    return result;
  },
});
const metadataResponse = await fetch('https://tiles.openfreemap.org/planet', { signal: AbortSignal.timeout(20_000) });
if (!metadataResponse.ok) throw new Error(`Tile metadata: ${metadataResponse.status}`);
const metadata = await metadataResponse.json() as { tiles: string[]; maxzoom: number };
const tileCache = new Map<string, ProviderFootprintFeature[]>();
const source: BuildingNeighborhoodSource = {
  async load(center, radius, signal) {
    const snapshotKey = `v2_${center.lat.toFixed(7)}_${center.lng.toFixed(7)}_${radius}`;
    const snapshotPath = path.join(cacheDirectory, `${snapshotKey}.json`);
    if (fs.existsSync(snapshotPath)) return JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const z = metadata.maxzoom;
    const n = 2 ** z;
    const tile = (lng: number, lat: number) => ({ x: Math.floor((lng + 180) / 360 * n), y: Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n) });
    const dx = radius / (111320 * Math.cos(center.lat * Math.PI / 180));
    const dy = radius / 110540;
    const northwest = tile(center.lng - dx, center.lat + dy);
    const southeast = tile(center.lng + dx, center.lat - dy);
    const features: ProviderFootprintFeature[] = [];
    const warnings: string[] = [];
    for (let x = northwest.x; x <= southeast.x; x++) for (let y = northwest.y; y <= southeast.y; y++) {
      signal.throwIfAborted();
      const url = metadata.tiles[0].replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
      if (!tileCache.has(url)) {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`OpenFreeMap tile ${response.status}`);
        const decoded = new VectorTile(new Pbf(new Uint8Array(await response.arrayBuffer())));
        const layer = decoded.layers.building;
        const items: ProviderFootprintFeature[] = [];
        for (let i = 0; i < (layer?.length ?? 0); i++) items.push({ ...layer.feature(i).toGeoJSON(x, y, z), source: 'OpenFreeMap', sourceLayer: 'building' });
        tileCache.set(url, items);
      }
      features.push(...tileCache.get(url)!);
    }
    const listing = currentListing!;
    const fused = await fuseBuildingNeighborhood({
      mode: 'auto',
      listingId: listing.id,
      country: listing.geopoint.address.country,
      center,
      radiusMeters: radius,
      primaryFeatures: features,
      signal,
      minimumContextFootprints: 6,
      minimumContextCells: 4,
      loadOsAtPoint: (point, requestSignal) => fetchOsOpenMapLocalBuildingAtPoint(point, { signal: requestSignal }),
      loadSupplemental: async () => {
        const supplemental = await queryMicrosoftBuildingFootprints({
          lat: center.lat,
          lng: center.lng,
          radiusMeters: radius,
          maxFeatures: 1200,
          cacheDirectory: path.resolve('.codex-temp/microsoft-building-footprints'),
        });
        return { features: supplemental.features, provider: supplemental.provider, truncated: supplemental.truncated };
      },
    });
    warnings.push(...fused.warnings);
    const snapshot = { features: fused.features, source: fused.sourceLabel || metadata.tiles[0], complete: fused.complete, warnings };
    if (fused.complete) fs.writeFileSync(snapshotPath, JSON.stringify(snapshot));
    return snapshot;
  },
};
let currentListing: Listing | null = null;
const filter = process.argv.find((arg) => arg.startsWith('--listing='))?.slice(10);
const resume = !filter && process.argv.includes('--resume');
const quiet = process.argv.includes('--quiet');
const outputPath = path.join(outputDirectory, filter ? 'single-runtime.json' : 'live-catalog.json');
const resumedResults = resume && fs.existsSync(outputPath)
  ? (JSON.parse(fs.readFileSync(outputPath, 'utf8')) as { results?: unknown[] }).results ?? []
  : [];
const results: any[] = [...resumedResults];
const completedListingIds = new Set(results.map((row) => row?.listingId).filter(Boolean));
for (const listing of listings.filter((item) => item.status === 'approved' && (!filter || item.id === filter) && !completedListingIds.has(item.id))) {
  currentListing = listing;
  const result = await runBuildingVerificationPipeline({ listing, collections: { listings }, source, addresses, timeoutMs: 60_000 });
  const skipped = result.status === 'skipped';
  // No saved geometry or saved decisions enter the pipeline above.
  const groundTruth = skipped ? null : getBuildingAssetForListing(listing, assets, { listings });
  const center = skipped ? null : getListingPhysicalCoords(listing, { listings });
  const assetDistance = groundTruth && center ? pointToBuildingDistanceMeters(center, groundTruth.geometry) : null;
  const fingerprints = groundTruth ? (groundTruth.geometry.type === 'Polygon' ? [geometryFingerprint(groundTruth.geometry)] : groundTruth.geometry.coordinates.map((coordinates) => geometryFingerprint({ type: 'Polygon', coordinates }))) : [];
  const best = result.decision?.candidate;
  const exactRediscovery = Boolean(best && fingerprints.includes(best.fingerprint));
  let geometryEquivalentRediscovery = false;
  let candidateToAssetCenterMeters: number | null = null;
  if (best && groundTruth && center) {
    const [candidateLng, candidateLat] = getBuildingGeometryCenter(best.geometry);
    const [assetLng, assetLat] = getBuildingGeometryCenter(groundTruth.geometry);
    candidateToAssetCenterMeters = haversineMeters({ lng: candidateLng, lat: candidateLat }, { lng: assetLng, lat: assetLat });
    const candidateContainsAssetCenter = pointIntersectsBuildingGeometry({ lng: assetLng, lat: assetLat }, best.geometry);
    const assetContainsCandidateCenter = pointIntersectsBuildingGeometry({ lng: candidateLng, lat: candidateLat }, groundTruth.geometry);
    const bothContainCanonicalPin = pointIntersectsBuildingGeometry(center, best.geometry) && pointIntersectsBuildingGeometry(center, groundTruth.geometry);
    geometryEquivalentRediscovery = (candidateContainsAssetCenter && assetContainsCandidateCenter)
      || (bothContainCanonicalPin && candidateToAssetCenterMeters <= 12);
  }
  const rediscoveredGroundTruth = exactRediscovery || geometryEquivalentRediscovery;
  // Assets with material coordinate drift are controls, not positive ground truth.
  const validControl = groundTruth && assetDistance !== null && assetDistance <= 6;
  const verdict = result.decision?.autoAccept
    ? (validControl && rediscoveredGroundTruth ? 'true_positive' : validControl ? 'false_positive' : 'unvalidated_acceptance')
    : validControl ? 'false_negative' : 'refused_or_unlabelled';
  const row = { listingId: listing.id, name: listing.name, status: result.status, outcome: result.decision?.outcome, autoAccept: result.decision?.autoAccept ?? false, verdict, exactRediscovery, geometryEquivalentRediscovery, rediscoveredGroundTruth, candidateToAssetCenterMeters, assetDistance, candidateCount: result.candidates.length, best: best ? { fingerprint: best.fingerprint, address: best.addressLabel, distance: best.pinToFootprintMeters, score: best.score } : null, reasons: result.reasons };
  results.push(row);
  fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), source: metadata.tiles[0], groundTruthLimit: 'Saved assets are provisional labels; exact fingerprint equality is conservative across provider versions. Unlabelled cases are not true negatives.', results }, null, 2));
  if (!quiet) console.log(`${listing.name}: ${row.outcome ?? row.status} | ${verdict} | ${row.candidateCount} footprints | ${row.reasons.join('; ')}`);
}

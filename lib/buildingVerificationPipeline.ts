import type { Listing } from '../types';
import { getListingPhysicalAddress, getListingPhysicalCoords, getVenueForListing, type EntityCollections } from './entityCompatibility';
import { isApproximateLocation } from './publicLocation';
import { extractIndividualBuildingFootprints, getBuildingGeometryCenter, type LngLat, type ProviderFootprintFeature } from './buildingGeometry';
import { evaluateBuildingVerification, listingHasExactBuildingAddress, type BuildingVerificationDecision, type VerificationCandidateInput } from './buildingVerification';
import { buildingAddressBelongsToFootprint, type BuildingAddressResolver } from './buildingAddressResolver';

export type NeighborhoodSnapshot = { features: ProviderFootprintFeature[]; source: string; complete: boolean; warnings: string[] };
export interface BuildingNeighborhoodSource {
  load(center: LngLat, radiusMeters: number, signal: AbortSignal): Promise<NeighborhoodSnapshot>;
}
export type BuildingPipelineResult = {
  status: 'completed' | 'skipped' | 'provider_failure' | 'cancelled';
  decision: BuildingVerificationDecision | null;
  candidates: VerificationCandidateInput[];
  neighborhood: NeighborhoodSnapshot | null;
  reasons: string[];
};

/** Read-only orchestration. No assets are accepted as input: rediscovery cannot
 * accidentally learn the answer from saved geometry. Privacy precedes I/O. */
export const runBuildingVerificationPipeline = async (args: {
  listing: Listing;
  collections: EntityCollections;
  source: BuildingNeighborhoodSource;
  addresses: BuildingAddressResolver;
  signal?: AbortSignal;
  timeoutMs?: number;
  radiusMeters?: number;
}): Promise<BuildingPipelineResult> => {
  const empty = (status: BuildingPipelineResult['status'], reason: string): BuildingPipelineResult => ({ status, decision: null, candidates: [], neighborhood: null, reasons: [reason] });
  const venue = getVenueForListing(args.listing, args.collections);
  if (isApproximateLocation(args.listing) || (venue && venue.visibility !== 'public_exact')) return empty('skipped', 'Private, hidden, or approximate location: no provider requests made.');
  if (!listingHasExactBuildingAddress(args.listing, args.collections)) return empty('skipped', 'Needs address research: no street number.');
  const center = getListingPhysicalCoords(args.listing, args.collections);
  if (!center || Math.abs(center.lat) > 90 || Math.abs(center.lng) > 180 || (center.lat === 0 && center.lng === 0)) return empty('skipped', 'Needs coordinate research: missing, invalid, or placeholder pin.');
  const controller = new AbortController();
  const abort = () => controller.abort(args.signal?.reason);
  args.signal?.addEventListener('abort', abort, { once: true });
  if (args.signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(new Error('Verification deadline exceeded')), args.timeoutMs ?? 90_000);
  const signal = controller.signal;
  // Bound even adapters that cannot yet cancel their underlying request.
  const bounded = <T>(work: () => Promise<T>): Promise<T> => new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason ?? new Error('Cancelled'));
    if (signal.aborted) { stop(); return; }
    signal.addEventListener('abort', stop, { once: true });
    Promise.resolve().then(work).then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
  try {
    const radius = args.radiusMeters ?? 250;
    const neighborhood = await bounded(() => args.source.load(center, radius, signal));
    const workspace = extractIndividualBuildingFootprints(neighborhood.features, center, { radiusMeters: radius, maxFootprints: 1000 });
    const ordered = [...workspace.footprints].sort((a, b) => a.pinToFootprintMeters - b.pinToFootprintMeters);
    const candidates: VerificationCandidateInput[] = [];
    let addressFailures = 0;
    // Preserve all competitors. Only nearby footprints receive expensive address
    // lookups; unchecked footprints still participate in geometric uniqueness.
    for (let index = 0; index < ordered.length; index += 1) {
      const footprint = ordered[index];
      let address: VerificationCandidateInput['address'] = null;
      let addressLabel: string | null = null;
      let addressScope: VerificationCandidateInput['addressScope'];
      if (index < 5) {
        const [lng, lat] = getBuildingGeometryCenter(footprint.geometry);
        const resolution = await bounded(() => args.addresses.resolveDetailed(lat, lng, { listingId: args.listing.id, footprintFingerprint: footprint.fingerprint, signal }));
        if (resolution.status === 'resolved') {
          address = resolution.address.candidate;
          addressLabel = resolution.address.displayName;
          addressScope = buildingAddressBelongsToFootprint(resolution.address, footprint.geometry) ? 'footprint' : 'nearby_object';
        } else if (resolution.status === 'provider_error') addressFailures += 1;
      }
      candidates.push({ ...footprint, address, addressLabel, addressScope });
    }
    const meta = venue?.locationMeta ?? args.listing.locationMeta;
    const decision = evaluateBuildingVerification(candidates, {
      listingAddress: getListingPhysicalAddress(args.listing, args.collections),
      locationConfidence: meta?.confidence,
      geocoderSource: meta?.geocoderSource ?? meta?.source,
      manuallyAdjusted: meta?.manualAdjustment,
      coordinateIsValid: true,
    });
    const geometryIncomplete = !neighborhood.complete || workspace.diagnostics.truncated;
    const addressEvidenceIncomplete = addressFailures > 0;
    const addressFailuresMatter = decision.autoAcceptMethod !== 'authoritative_unique_pin';
    if ((geometryIncomplete || (addressEvidenceIncomplete && addressFailuresMatter)) && decision.autoAccept) {
      decision.autoAccept = false;
      decision.autoAcceptMethod = null;
      decision.outcome = 'probable';
      decision.reasons.push(geometryIncomplete
        ? 'Incomplete footprint coverage prevents definitive acceptance.'
        : 'Incomplete address evaluation prevents the address-based definitive tier.');
    }
    return { status: 'completed', decision, candidates, neighborhood, reasons: [...decision.reasons, ...neighborhood.warnings, ...(addressFailures ? [`${addressFailures} address provider failures; missing evidence is not contradiction.`] : [])] };
  } catch (error) {
    return empty(args.signal?.aborted ? 'cancelled' : 'provider_failure', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
    args.signal?.removeEventListener('abort', abort);
  }
};

import type { LngLat, ProviderFootprintFeature } from './buildingGeometry';
import {
  filterSupplementalBuildingFeatures,
  isUnitedKingdomCountry,
  primaryCoverageNeedsSupplement,
  type SupplementalFusionStats,
} from './buildingFootprintSources';

export type BuildingNeighborhoodMode = 'auto' | 'openfreemap' | 'microsoft';

export type BuildingNeighborhoodSupplement = {
  features: ProviderFootprintFeature[];
  provider: string;
  truncated?: boolean;
};

export type BuildingNeighborhoodFusionResult = {
  features: ProviderFootprintFeature[];
  complete: boolean;
  sourceLabel: string;
  warnings: string[];
  usedOsOpenMapLocal: boolean;
  usedSupplemental: boolean;
  supplementalStats: SupplementalFusionStats | null;
};

export const fuseBuildingNeighborhood = async (args: {
  mode: BuildingNeighborhoodMode;
  listingId: string;
  country?: string | null;
  center: LngLat;
  radiusMeters: number;
  primaryFeatures: ProviderFootprintFeature[];
  signal?: AbortSignal;
  loadOsAtPoint?: (point: LngLat, signal?: AbortSignal) => Promise<ProviderFootprintFeature[]>;
  loadSupplemental: (signal?: AbortSignal) => Promise<BuildingNeighborhoodSupplement>;
  minimumContextFootprints?: number;
  minimumContextCells?: number;
}): Promise<BuildingNeighborhoodFusionResult> => {
  const warnings: string[] = [];
  const signal = args.signal;
  const checkAbort = () => {
    if (signal?.aborted) throw signal.reason ?? new Error('Building neighborhood load cancelled.');
  };
  checkAbort();

  if (args.mode === 'openfreemap') {
    return {
      features: args.primaryFeatures,
      complete: true,
      sourceLabel: 'OSM · OpenFreeMap',
      warnings,
      usedOsOpenMapLocal: false,
      usedSupplemental: false,
      supplementalStats: null,
    };
  }

  if (args.mode === 'microsoft') {
    const supplemental = await args.loadSupplemental(signal);
    checkAbort();
    return {
      features: supplemental.features,
      complete: !supplemental.truncated,
      sourceLabel: supplemental.provider || 'Microsoft ML',
      warnings,
      usedOsOpenMapLocal: false,
      usedSupplemental: supplemental.features.length > 0,
      supplementalStats: null,
    };
  }

  let features = [...args.primaryFeatures];
  let complete = true;
  let usedOsOpenMapLocal = false;
  let usedSupplemental = false;
  let supplementalStats: SupplementalFusionStats | null = null;
  let coverage = primaryCoverageNeedsSupplement(features, args.center, {
    radiusMeters: args.radiusMeters,
    minimumContextFootprints: args.minimumContextFootprints ?? 6,
    minimumContextCells: args.minimumContextCells ?? 0,
  });

  if (coverage.reason === 'missing-target' && isUnitedKingdomCountry(args.country) && args.loadOsAtPoint) {
    try {
      const osFeatures = await args.loadOsAtPoint(args.center, signal);
      checkAbort();
      if (osFeatures.length) {
        features.push(...osFeatures);
        usedOsOpenMapLocal = true;
        warnings.push(`Target footprint supplemented from Ordnance Survey OpenMap Local (${osFeatures.length}).`);
        coverage = primaryCoverageNeedsSupplement(features, args.center, {
          radiusMeters: args.radiusMeters,
          minimumContextFootprints: args.minimumContextFootprints ?? 6,
          minimumContextCells: args.minimumContextCells ?? 0,
        });
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      complete = false;
      warnings.push(`OS OpenMap Local unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (coverage.needed) {
    try {
      const supplemental = await args.loadSupplemental(signal);
      checkAbort();
      const fused = filterSupplementalBuildingFeatures(features, supplemental.features, args.center, args.radiusMeters);
      features.push(...fused.features);
      supplementalStats = fused.stats;
      usedSupplemental = fused.stats.accepted > 0;
      complete = complete && !supplemental.truncated;
      warnings.push(`Supplementation ${coverage.reason}: accepted ${fused.stats.accepted}, suppressed ${fused.stats.suppressedExact + fused.stats.suppressedOverlap} duplicate/overlap footprint(s).`);
    } catch (error) {
      if (signal?.aborted) throw error;
      complete = false;
      warnings.push(`Supplemental building coverage unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    features,
    complete,
    sourceLabel: usedSupplemental
      ? usedOsOpenMapLocal ? 'Hybrid · OSM + OS + Microsoft' : 'Hybrid · OSM + Microsoft'
      : usedOsOpenMapLocal ? 'Hybrid · OSM + OS' : 'OSM · OpenFreeMap',
    warnings,
    usedOsOpenMapLocal,
    usedSupplemental,
    supplementalStats,
  };
};

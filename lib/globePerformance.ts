import type { GraphicsCapability } from './graphicsCapability';

export type GlobeQualityTier = 'high' | 'balanced' | 'low';
export type GlobeFramePolicy = 'interactive' | 'ambient' | 'long-idle' | 'suspended';
export type ExplorerPerformanceMode = 'globe' | 'globe-to-map' | 'map' | 'map-to-globe';

export type GlobePerformanceSnapshot = {
  capturedAt: number;
  sampleWindowMs: number;
  loopRunning: boolean;
  requestedRunning: boolean;
  framePolicy: GlobeFramePolicy;
  targetFps: number;
  renderedFrames: number;
  skippedFrames: number;
  pixelRatio: number;
  qualityTier: GlobeQualityTier;
  averageFps: number | null;
  averageFrameTimeMs: number | null;
  recentWorstFrameTimeMs: number | null;
  approximateOnePercentLowFps: number | null;
  averageRenderCostMs: number | null;
  interactiveAverageFps: number | null;
  interactiveLowestFps: number | null;
  interactiveSampleCount: number;
  transitionAverageFps: number | null;
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
  sourceEventCount: number;
  constructedPinCount: number;
  retainedPinMeshCount: number;
  retainedLabelNodeCount: number;
  retainedAnchorCount: number;
  estimatedSurfaceRaycastCount: number;
  pinRebuildCount: number;
  disposedPinCount: number;
  lastPinBuildDurationMs: number;
  lastPinDisposeDurationMs: number;
  sourceRegionCount: number;
  constructedRegionCount: number;
  retainedRegionMeshCount: number;
  estimatedRegionSurfaceRaycastCount: number;
  regionRebuildCount: number;
  disposedRegionCount: number;
  lastRegionBuildDurationMs: number;
  lastRegionDisposeDurationMs: number;
  visibleRegionCount: number;
  visiblePinCount: number;
  animatedRippleCount: number;
  pinMeshCount: number;
  contextLossCount: number;
  activeListenerCount: number;
  cameraTravelActive: boolean;
  hoverActive: boolean;
  selectionAnimationActive: boolean;
  transitionActive: boolean;
};

export type ExplorerPerformanceSnapshot = GlobePerformanceSnapshot & {
  explorerMode: ExplorerPerformanceMode;
  mapMounted: boolean;
  graphicsCapability: GraphicsCapability;
  lastGlobeToMapDurationMs: number | null;
  lastMapToGlobeDurationMs: number | null;
  roundTrips: number;
};

export const GLOBE_QUALITY_STORAGE_KEY = 'swingsphere.globe.autoQuality.v1';

const TIER_ORDER: GlobeQualityTier[] = ['low', 'balanced', 'high'];
const POOR_INTERACTIVE_FPS = 44;
const RECOVERY_INTERACTIVE_FPS = 56;
const DOWNGRADE_SAMPLE_MS = 6_000;
const DOWNGRADE_COOLDOWN_MS = 20_000;
const UPGRADE_SAMPLE_MS = 90_000;
const UPGRADE_COOLDOWN_MS = 120_000;

const capabilityDefaultTier = (capability: GraphicsCapability): GlobeQualityTier =>
  capability === 'webgl2-hardware' ? 'high' : 'low';

const readStoredTier = (): GlobeQualityTier | null => {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(GLOBE_QUALITY_STORAGE_KEY);
  return TIER_ORDER.includes(stored as GlobeQualityTier) ? stored as GlobeQualityTier : null;
};

export class GlobeQualityController {
  readonly capability: GraphicsCapability;
  tier: GlobeQualityTier;
  private poorInteractiveMs = 0;
  private stableInteractiveMs = 0;
  private lastObservedAt = 0;
  private lastTierChangeAt = -Infinity;

  constructor(capability: GraphicsCapability) {
    this.capability = capability;
    this.tier = capability === 'webgl2-hardware'
      ? readStoredTier() ?? capabilityDefaultTier(capability)
      : capabilityDefaultTier(capability);
  }

  observe(snapshot: GlobePerformanceSnapshot): GlobeQualityTier | null {
    if (
      this.capability === 'unsupported' ||
      snapshot.framePolicy !== 'interactive' ||
      snapshot.interactiveAverageFps === null ||
      snapshot.interactiveSampleCount < 20 ||
      snapshot.transitionActive
    ) {
      this.lastObservedAt = snapshot.capturedAt;
      return null;
    }

    const elapsed = this.lastObservedAt > 0
      ? Math.min(1_250, Math.max(0, snapshot.capturedAt - this.lastObservedAt))
      : 0;
    this.lastObservedAt = snapshot.capturedAt;
    const fps = snapshot.interactiveAverageFps;

    if (fps < POOR_INTERACTIVE_FPS) {
      this.poorInteractiveMs += elapsed;
      this.stableInteractiveMs = 0;
    } else {
      this.poorInteractiveMs = Math.max(0, this.poorInteractiveMs - elapsed * 2);
      this.stableInteractiveMs = fps >= RECOVERY_INTERACTIVE_FPS
        ? this.stableInteractiveMs + elapsed
        : 0;
    }

    const sinceChange = snapshot.capturedAt - this.lastTierChangeAt;
    if (this.poorInteractiveMs >= DOWNGRADE_SAMPLE_MS && sinceChange >= DOWNGRADE_COOLDOWN_MS) {
      return this.changeTier(-1, snapshot.capturedAt);
    }

    if (this.stableInteractiveMs >= UPGRADE_SAMPLE_MS && sinceChange >= UPGRADE_COOLDOWN_MS) {
      return this.changeTier(1, snapshot.capturedAt);
    }

    return null;
  }

  reset(): GlobeQualityTier {
    if (typeof window !== 'undefined') window.localStorage.removeItem(GLOBE_QUALITY_STORAGE_KEY);
    this.tier = capabilityDefaultTier(this.capability);
    this.poorInteractiveMs = 0;
    this.stableInteractiveMs = 0;
    this.lastTierChangeAt = -Infinity;
    return this.tier;
  }

  private changeTier(direction: -1 | 1, now: number): GlobeQualityTier | null {
    const currentIndex = TIER_ORDER.indexOf(this.tier);
    const nextIndex = Math.min(TIER_ORDER.length - 1, Math.max(0, currentIndex + direction));
    const nextTier = TIER_ORDER[nextIndex];
    this.poorInteractiveMs = 0;
    this.stableInteractiveMs = 0;
    if (nextTier === this.tier) return null;
    this.tier = nextTier;
    this.lastTierChangeAt = now;
    if (typeof window !== 'undefined') window.localStorage.setItem(GLOBE_QUALITY_STORAGE_KEY, nextTier);
    return nextTier;
  }
}

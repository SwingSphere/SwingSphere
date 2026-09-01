import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { renderedGlobeLocalToWgs84, wgs84ToRenderedGlobeLocal } from "./math/geoProjection.js";
import { resolveLandSurfaceAnchorFromDirection } from "./math/surfaceAnchoring.js";
import { loadJsonAsset } from "./jsonAssetCache.js";

const DEFAULT_PALETTE = ["#17181d", "#17181d", "#1d2026", "#1d2026", "#24262d", "#24262d", "#651522", "#ff465c"];
export const BORDER_SURFACE_CLEARANCE = 0.004;
const BORDER_MAX_ANGULAR_STEP_DEGREES = 0.1;
const BORDER_TERRAIN_DEVIATION = 0.001;
const BORDER_CLEARANCE_TOLERANCE = 0.00035;
const BORDER_MAX_SUBDIVISION_DEPTH = 10;
const BORDER_MAX_POINTS_PER_PATH = 20_000;
const STRAIGHT_PRESERVING_COASTLINE_STEP_DEGREES = 0.1;
const COASTLINE_RADIUS_OUTLIER = 0.012;
const STRAIGHT_PRESERVING_COASTLINE_VERSION = 3;
const GRADIENT_TEXTURE_WIDTH = 256;

export class CountryVectorBorderLayer {
  constructor({ renderer, config }) {
    this.renderer = renderer;
    this.config = config;
    this.options = config.countryVectorBorders ?? {};
    this.enabled = this.options.enabled !== false;
    this.featuresByKey = new Map();
    this.feature = null;
    this.selectedCountry = null;
    this.hybridOptions = config.hybridCountryBorders ?? {};
    this.hybridManifest = null;
    this.hybridAssets = new Map();
    this.hybridAssetPromises = new Map();
    this.hybridLoadDiagnostics = new Map();
    this.failedHybridUrls = new Set();
    this.disposed = false;
    this.sourceMode = normalizeSourceMode(this.hybridOptions.sourceMode ?? "hybrid");
    this.allowedHybridStatuses = normalizeAllowedStatuses(this.hybridOptions.allowedStatuses);
    this.presentationGroups = normalizePresentationGroups(config.countryPresentationGroups);
    this.suppressedCountryKeys = new Set(
      this.presentationGroups
        .filter((group) => group.suppressVectorBorders)
        .flatMap((group) => group.members)
    );
    this.lines = [];
    this.selectionTransition = 0;
    this.selectionTransitionTarget = 0;
    this.pendingClearAfterTransition = false;
    this.lastTransitionElapsed = null;
    this.preparedCache = new Map();
    this.preparedCacheLimit = Math.floor(THREE.MathUtils.clamp(Number(this.options.preparedCacheSize ?? 8), 0, 32));
    this.renderableCountryKeys = Array.isArray(this.options.renderableCountryKeys)
      ? normalizeCountryKeys(this.options.renderableCountryKeys)
      : null;
    this.group = new THREE.Group();
    this.group.name = "language-explorer-vector-country-border";
    this.group.renderOrder = 30;
    this.renderer.globe.add(this.group);
    this.palette = (this.options.palette ?? DEFAULT_PALETTE).map((color) => new THREE.Color(color));
    this.settings = {
      coreWidth: Number(this.options.coreWidth ?? 2),
      glowWidth: Number(this.options.glowWidth ?? 5),
      glowOpacity: Number(this.options.glowOpacity ?? 0),
      speed: Number(this.options.speed ?? 0.2),
      opacity: Number(this.options.opacity ?? 0.96),
      coreVisible: this.options.coreVisible !== false,
      glowVisible: this.options.glowVisible !== false,
      animationEnabled: this.options.animationEnabled !== false
    };
    this.gradientPhaseUniform = { value: 0 };
    this.gradientTexture = createGradientTexture(this.palette);
    this.gradientTextureUniform = { value: this.gradientTexture };
    this.renderResolution = new THREE.Vector2();
    this.appliedResolution = new THREE.Vector2(-1, -1);
    this.raycaster = new THREE.Raycaster();
    this.rayOrigin = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3();
    this.surfaceCandidate = new THREE.Vector3();
    this.edgeCounts = new Map();
    this.shorelinePaths = [];
    this.experimentalPhysicalCoastlineSnap = this.options.experimentalPhysicalCoastlineSnap === true;
    this.shorelineSnapExcludedCountryKeys = this.experimentalPhysicalCoastlineSnap
      ? normalizeCountryKeys(this.options.shorelineSnapExcludedCountryKeys ?? [])
      : new Set();
    this.physicalCoastlineAssetVersion = null;
    this.diagnostics = createEmptyDiagnostics();
    this.updateDiagnostics = createEmptyUpdateDiagnostics();
    this.group.visible = this.enabled;
  }

  async mount() {
    const url = this.options.url ?? this.config.countryGeoJson?.url;
    if (!url) return;
    const data = await loadJsonAsset(url);
    const features = data?.features ?? [];
    this.edgeCounts = buildGeoJsonEdgeCounts(features);
    if (this.experimentalPhysicalCoastlineSnap) {
      const physicalCoastlineAsset = await loadJsonAsset(
        this.options.physicalCoastlineUrl ?? "/assets/globe/coastlines/physical-coastlines-v1.json"
      ).catch((error) => {
        console.warn("[SwingSphere physical coastline]", error);
        return null;
      });
      this.physicalCoastlineAssetVersion = physicalCoastlineAsset?.version ?? null;
      this.shorelinePaths = buildPhysicalCoastlineRenderPaths(physicalCoastlineAsset, this.config);
    } else {
      this.shorelinePaths = buildLandShorelinePaths(this.renderer.landHitMesh?.geometry);
    }
    for (const feature of features) {
      for (const key of featureKeys(feature)) {
        if (!this.featuresByKey.has(key)) this.featuresByKey.set(key, feature);
      }
    }
    if (this.hybridOptions.enabled !== false && this.hybridOptions.manifestUrl) {
      this.hybridManifest = await loadJsonAsset(this.hybridOptions.manifestUrl);
    }
  }

  setSelectedCountry(country) {
    const feature = findFeature(this.featuresByKey, country);
    const suppressed = countryKeys(country).some((key) => this.suppressedCountryKeys.has(key));
    const renderableFeature = !suppressed && this.#isRenderableCountry(country, feature) ? feature : null;
    const sameSelection = renderableFeature === this.feature && countryKeys(country).join("|") === countryKeys(this.selectedCountry).join("|");
    this.selectedCountry = country;
    if (sameSelection) return;

    if (!renderableFeature && this.feature && this.lines.length) {
      this.selectionTransitionTarget = 0;
      this.pendingClearAfterTransition = true;
      if (this.config.motion?.reduced) {
        this.selectionTransition = 0;
        this.feature = null;
        this.pendingClearAfterTransition = false;
        this.#clear();
      }
      return;
    }

    this.feature = renderableFeature;
    this.pendingClearAfterTransition = false;
    this.selectionTransition = 0;
    this.selectionTransitionTarget = renderableFeature ? 1 : 0;
    this.#rebuild();
  }

  setHoveredCountry(country) {
    if (this.feature || this.options.hoverEnabled === false) return;
    const feature = findFeature(this.featuresByKey, country);
    const suppressed = countryKeys(country).some((key) => this.suppressedCountryKeys.has(key));
    const renderableFeature = !suppressed && this.#isRenderableCountry(country, feature) ? feature : null;
    if (renderableFeature === this.hoverFeature) return;
    this.hoverFeature = renderableFeature;
    if (renderableFeature) this.#prefetchHybridAsset(country, renderableFeature);
    this.#rebuild(renderableFeature, true);
  }

  clearHoveredCountry() {
    if (!this.hoverFeature) return;
    this.hoverFeature = null;
    if (!this.feature) this.#clear();
  }

  setVisible(visible) {
    this.enabled = Boolean(visible);
    this.group.visible = this.enabled;
  }

  setSourceMode(mode) {
    const normalized = normalizeSourceMode(mode);
    if (normalized === this.sourceMode) return;
    this.sourceMode = normalized;
    if (this.feature) this.#rebuild();
  }

  setRenderableCountries(countries = []) {
    this.renderableCountryKeys = normalizeCountryKeys(countries);
    for (const [cacheKey, prepared] of this.preparedCache) {
      if (this.#isRenderableCountry(null, prepared.feature)) continue;
      this.preparedCache.delete(cacheKey);
      this.updateDiagnostics.preparedCacheEvictionCount += 1;
      this.updateDiagnostics.preparedCacheBytes -= prepared.byteLength;
    }
    if (this.feature && !this.#isRenderableCountry(null, this.feature)) {
      this.feature = null;
      this.selectedCountry = null;
      this.#clear();
    }
    if (this.hoverFeature && !this.#isRenderableCountry(null, this.hoverFeature)) {
      this.hoverFeature = null;
      if (!this.feature) this.#clear();
    }
  }

  #isRenderableCountry(country, feature) {
    if (!feature) return false;
    if (this.renderableCountryKeys === null) return true;
    if (!this.renderableCountryKeys.size) return false;
    return [...countryKeys(country), ...featureKeys(feature)]
      .some((key) => this.renderableCountryKeys.has(key));
  }

  updateSettings(next = {}) {
    if (Number.isFinite(next.coreWidth)) this.settings.coreWidth = THREE.MathUtils.clamp(next.coreWidth, 1, 10);
    if (Number.isFinite(next.glowWidth)) this.settings.glowWidth = THREE.MathUtils.clamp(next.glowWidth, 2, 30);
    if (Number.isFinite(next.glowOpacity)) this.settings.glowOpacity = THREE.MathUtils.clamp(next.glowOpacity, 0, 0.8);
    if (Number.isFinite(next.opacity)) this.settings.opacity = THREE.MathUtils.clamp(next.opacity, 0, 1);
    if (Number.isFinite(next.speed)) this.settings.speed = THREE.MathUtils.clamp(next.speed, 0, 0.5);
    if (typeof next.coreVisible === "boolean") this.settings.coreVisible = next.coreVisible;
    if (typeof next.glowVisible === "boolean") this.settings.glowVisible = next.glowVisible;
    if (typeof next.animationEnabled === "boolean") this.settings.animationEnabled = next.animationEnabled;
    if (Array.isArray(next.palette) && next.palette.length >= 2) {
      this.palette = next.palette.map((color) => new THREE.Color(color));
      updateGradientTexture(this.gradientTexture, this.palette);
      this.updateDiagnostics.gradientTextureUploadCount += 1;
    }
    if (!this.settings.animationEnabled || this.settings.speed === 0) this.gradientPhaseUniform.value = 0;
    for (const item of this.lines) {
      item.coreMaterial.linewidth = this.settings.coreWidth;
      item.coreMaterial.opacity = this.settings.opacity;
      item.glowMaterial.linewidth = this.settings.glowWidth;
      item.glowMaterial.opacity = this.settings.glowOpacity;
      item.core.visible = this.settings.coreVisible;
      item.glow.visible = this.settings.glowVisible && this.settings.glowOpacity > 0;
    }
  }

  isAnimationActive() {
    return Boolean(
      this.enabled
      && this.lines.length
      && this.selectionTransition > 0.002
      && !this.config.motion?.reduced
      && this.settings.animationEnabled
      && this.settings.speed > 0
    );
  }

  getDiagnostics() {
    return {
      ...this.diagnostics,
      ...this.updateDiagnostics,
      linePathCount: this.lines.length,
      coreDrawCallCount: this.lines.filter((item) => item.core.visible).length,
      glowDrawCallCount: this.lines.filter((item) => item.glow.visible).length,
      totalBorderDrawCallCount: this.lines.reduce(
        (count, item) => count + Number(item.core.visible) + Number(item.glow.visible),
        0
      )
    };
  }

  update(elapsed = 0) {
    this.group.rotation.y = this.renderer.visibleLandMesh?.rotation.y ?? 0;
    const updateStartedAt = performance.now();
    this.updateDiagnostics.updateCallCount += 1;
    if (!this.enabled || !this.lines.length) {
      this.#recordUpdateDuration(performance.now() - updateStartedAt);
      return;
    }
    this.renderer.renderer.getSize(this.renderResolution);
    if (!this.renderResolution.equals(this.appliedResolution)) {
      this.appliedResolution.copy(this.renderResolution);
      for (const item of this.lines) {
        item.coreMaterial.resolution.copy(this.renderResolution);
        item.glowMaterial.resolution.copy(this.renderResolution);
      }
      this.updateDiagnostics.resolutionUpdateCount += 1;
    }
    const reducedMotion = Boolean(this.config.motion?.reduced);
    if (!reducedMotion && this.settings.animationEnabled && this.settings.speed > 0) {
      this.gradientPhaseUniform.value = elapsed * this.settings.speed;
      this.updateDiagnostics.gradientUniformUpdateCount += 1;
    } else if (reducedMotion) {
      this.gradientPhaseUniform.value = 0;
    }
    const delta = this.lastTransitionElapsed == null ? 0 : Math.max(0, Math.min(0.1, elapsed - this.lastTransitionElapsed));
    this.lastTransitionElapsed = elapsed;
    this.selectionTransition = reducedMotion
      ? this.selectionTransitionTarget
      : dampTransition(
          this.selectionTransition,
          this.selectionTransitionTarget,
          delta,
          Math.max(0.1, Number(this.options.selectedTransitionSeconds ?? 0.34))
        );
    for (const item of this.lines) {
      item.coreMaterial.opacity = this.settings.opacity * this.selectionTransition;
      item.glowMaterial.opacity = this.settings.glowOpacity * this.selectionTransition;
    }
    if (this.pendingClearAfterTransition && this.selectionTransition === 0) {
      this.pendingClearAfterTransition = false;
      this.feature = null;
      this.#clear();
    }
    this.#recordUpdateDuration(performance.now() - updateStartedAt);
  }

  #recordUpdateDuration(durationMs, colorUpdate = false) {
    this.updateDiagnostics.totalUpdateDurationMs += durationMs;
    this.updateDiagnostics.lastUpdateDurationMs = durationMs;
    this.updateDiagnostics.maxUpdateDurationMs = Math.max(this.updateDiagnostics.maxUpdateDurationMs, durationMs);
    this.updateDiagnostics.averageUpdateDurationMs =
      this.updateDiagnostics.totalUpdateDurationMs / Math.max(1, this.updateDiagnostics.updateCallCount);
    if (!colorUpdate) return;
    this.updateDiagnostics.totalColorUpdateDurationMs += durationMs;
    this.updateDiagnostics.maxColorUpdateDurationMs = Math.max(this.updateDiagnostics.maxColorUpdateDurationMs, durationMs);
    this.updateDiagnostics.averageColorUpdateDurationMs =
      this.updateDiagnostics.totalColorUpdateDurationMs / Math.max(1, this.updateDiagnostics.colorUpdateCount);
  }

  dispose() {
    this.disposed = true;
    this.#clear();
    this.preparedCache.clear();
    this.hybridAssets.clear();
    this.hybridAssetPromises.clear();
    this.failedHybridUrls.clear();
    this.gradientTexture.dispose();
    this.renderer.globe.remove(this.group);
  }

  #rebuild(feature = this.feature, hover = false) {
    this.#clear();
    if (!feature) return;
    const buildStartedAt = performance.now();
    const source = this.#resolveBorderSource(feature, hover);
    const cacheKey = this.#preparedCacheKey(feature, source);
    const cached = this.preparedCache.get(cacheKey);
    if (cached) {
      this.preparedCache.delete(cacheKey);
      this.preparedCache.set(cacheKey, cached);
      this.updateDiagnostics.preparedCacheHitCount += 1;
      this.diagnostics = {
        ...cached.diagnostics,
        cacheHit: true,
        countrySwitchRaycastCount: 0,
        generationDurationMs: 0
      };
      for (const path of cached.paths) this.#appendLineGeometry({ ...path, hover });
      this.diagnostics.buildDurationMs = performance.now() - buildStartedAt;
      return;
    }
    this.updateDiagnostics.preparedCacheMissCount += 1;
    this.diagnostics = createEmptyDiagnostics();
    this.diagnostics.borderSource = source.id;
    this.diagnostics.hybridBorderVersion = source.asset?.version ?? null;
    this.diagnostics.coastlineAssetVersion = source.asset?.coastlineAssetVersion ?? null;
    this.diagnostics.hybridAssetLoadDurationMs = source.loadDurationMs ?? 0;
    const preparedPaths = [];
    const segments = source.segments ?? extractBoundarySegments(feature, Number(this.options.pointStep ?? 1), this.edgeCounts);
    const radius = this.renderer.globeRadius * Number(this.options.radiusScale ?? 1.008);
    const conformToLand = this.options.conformToLand !== false;
    const shorelineSnap = this.options.shorelineSnap !== false;
    const shorelineSnapStrength = THREE.MathUtils.clamp(Number(this.options.shorelineSnapStrength ?? 1), 0, 1);
    const maxShorelineSnapDegrees = THREE.MathUtils.clamp(Number(this.options.maxShorelineSnapDegrees ?? 3.5), 0.25, 12);
    const maxRenderedStepDegrees = THREE.MathUtils.clamp(Number(this.options.maxRenderedStepDegrees ?? 4.5), 1, 15);
    const maxShorelineTurnDegrees = THREE.MathUtils.clamp(Number(this.options.maxShorelineTurnDegrees ?? 48), 15, 120);
    const maxRadialOutlier = Math.max(0.002, Number(this.options.maxRadialOutlier ?? this.renderer.globeRadius * 0.018));
    const maxSegmentDegrees = Math.max(0.15, Number(this.options.maxSegmentDegrees ?? 0.8));
    const useHybridSegmentTreatment = Boolean(source.asset);
    const featureCountryKeys = featureKeys(feature);
    const hybridShorelineSnapEnabled = this.experimentalPhysicalCoastlineSnap
      && shorelineSnap
      && this.shorelinePaths.length > 0
      && !featureCountryKeys.some((key) => this.shorelineSnapExcludedCountryKeys.has(key));
    for (const segment of segments) {
      const baseCoordinates = useHybridSegmentTreatment
        ? boundarySegmentControlCoordinates(segment)
        : densifyBoundarySegment(segment, maxSegmentDegrees);
      const sourceCoordinates = useHybridSegmentTreatment && this.experimentalPhysicalCoastlineSnap
        ? compensateHybridCoastlineControls(baseCoordinates, this.config)
        : baseCoordinates;
      const coordinates = useHybridSegmentTreatment && hybridShorelineSnapEnabled
        ? snapHybridCoastlineControlsToPhysical(sourceCoordinates, this.shorelinePaths, this.config, maxShorelineSnapDegrees)
        : sourceCoordinates;
      if (coordinates.length < 2) continue;
      const boundaryPoints = buildShorelineConformedBoundary({
        coordinates,
        shorelinePaths: !source.asset && shorelineSnap ? this.shorelinePaths : [],
        config: this.config,
        maxSnapDegrees: maxShorelineSnapDegrees
      });
      const projectedPoints = boundaryPoints.map((point) => {
        const originalDirection = point.originalDirection;
        const direction = point.direction;
        const position = conformToLand
          ? this.#resolveSurfacePoint(direction, radius).position
          : direction.clone().multiplyScalar(radius + BORDER_SURFACE_CLEARANCE);
        return {
          position,
          direction,
          originalDirection,
          snapped: Boolean(point.surfacePosition),
          physicalCoastline: Boolean(point.physicalCoastline),
          coastalToNext: Boolean(point.coastalToNext)
        };
      });
      const sanitizedPoints = useHybridSegmentTreatment
        ? projectedPoints
        : sanitizeProjectedPoints({
            points: projectedPoints,
            resolveOriginalPosition: (direction) => conformToLand
              ? this.#resolveSurfacePoint(direction, radius).position
              : direction.clone().multiplyScalar(radius),
            maxTurnDegrees: maxShorelineTurnDegrees,
            maxRadialOutlier
          });
      const terrainConformingPoints = useHybridSegmentTreatment
        ? this.#buildHybridConformingPoints({
            points: regularizeCoastalControlRadii(sanitizedPoints),
            fallbackRadius: radius,
            conformToLand
          })
        : this.#buildTerrainConformingPoints({
            points: sanitizedPoints,
            fallbackRadius: radius,
            conformToLand
          });
      if (useHybridSegmentTreatment) this.diagnostics.renderedPointCount += terrainConformingPoints.length;
      const positions = [];
      const progress = [];
      let total = 0;
      let previous = null;
      for (const { position, breakBefore } of terrainConformingPoints) {
        if (breakBefore && previous) {
          if (positions.length >= 6 && total > 0) this.#appendPreparedPath(preparedPaths, { positions, progress, total });
          positions.length = 0;
          progress.length = 0;
          total = 0;
          previous = null;
        }
        if (previous) {
          const previousDirection = previous.clone().normalize();
          const stepDegrees = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(previousDirection.dot(position.clone().normalize()), -1, 1)));
          if (stepDegrees > maxRenderedStepDegrees) {
            if (positions.length >= 6) this.#appendPreparedPath(preparedPaths, { positions, progress, total });
            positions.length = 0;
            progress.length = 0;
            total = 0;
            previous = null;
          }
        }
        if (previous) total += previous.distanceTo(position);
        positions.push(position.x, position.y, position.z);
        progress.push(total);
        previous = position;
      }
      if (positions.length >= 6 && total > 0) this.#appendPreparedPath(preparedPaths, { positions, progress, total });
    }
    this.diagnostics.generationDurationMs = performance.now() - buildStartedAt;
    this.diagnostics.countrySwitchRaycastCount = this.diagnostics.anchorRaycastCount;
    const prepared = {
      feature,
      paths: preparedPaths,
      diagnostics: { ...this.diagnostics },
      byteLength: preparedPaths.reduce(
        (bytes, path) => bytes + path.positions.byteLength + path.normalizedProgress.byteLength,
        0
      )
    };
    this.#cachePreparedFeature(cacheKey, prepared);
    for (const path of prepared.paths) this.#appendLineGeometry({ ...path, hover });
    this.diagnostics.cacheHit = false;
    this.diagnostics.buildDurationMs = performance.now() - buildStartedAt;
  }

  #appendPreparedPath(paths, { positions, progress, total }) {
    paths.push({
      positions: new Float32Array(positions),
      normalizedProgress: new Float32Array(progress.map((value) => value / total))
    });
  }

  #cachePreparedFeature(cacheKey, prepared) {
    if (this.preparedCacheLimit <= 0) return;
    this.preparedCache.set(cacheKey, prepared);
    this.updateDiagnostics.preparedCacheBytes += prepared.byteLength;
    while (this.preparedCache.size > this.preparedCacheLimit) {
      const oldestFeature = this.preparedCache.keys().next().value;
      const oldest = this.preparedCache.get(oldestFeature);
      this.preparedCache.delete(oldestFeature);
      this.updateDiagnostics.preparedCacheEvictionCount += 1;
      this.updateDiagnostics.preparedCacheBytes -= oldest?.byteLength ?? 0;
    }
  }

  #resolveBorderSource(feature, hover) {
    const entry = this.#findHybridManifestEntry(this.selectedCountry, feature);
    const hybridAllowed = this.#isHybridEntryAllowed(entry);
    if (this.sourceMode !== "geojson" && hybridAllowed) {
      const asset = this.hybridAssets.get(entry.url);
      if (asset) {
        return {
          id: `${this.sourceMode}:hybrid-v${asset.version}:coast-v${asset.coastlineAssetVersion}`,
          asset,
          loadDurationMs: this.hybridLoadDiagnostics.get(entry.url)?.durationMs ?? 0,
          segments: hybridAssetToBoundarySegments(asset, this.sourceMode)
        };
      }
      this.#loadHybridAsset(entry, feature, !hover);
      if (!hover) return { id: "hybrid-pending", asset: null, segments: [] };
    }
    if (entry && this.sourceMode !== "geojson" && !hybridAllowed) {
      return { id: `geojson-fallback:${String(entry.status ?? "unknown")}`, asset: null, segments: null };
    }
    return { id: entry && this.sourceMode !== "geojson" ? "geojson-loading-hybrid" : "geojson", asset: null, segments: null };
  }

  #isHybridEntryAllowed(entry) {
    if (!entry?.url || this.failedHybridUrls.has(entry.url)) return false;
    if (!this.allowedHybridStatuses) return true;
    return this.allowedHybridStatuses.has(String(entry.status ?? "").trim().toLowerCase());
  }

  #findHybridManifestEntry(country, feature) {
    const countries = this.hybridManifest?.countries;
    if (!countries) return null;
    const keys = new Set([...countryKeys(country), ...featureKeys(feature)]);
    for (const [iso3, entry] of Object.entries(countries)) {
      if ([iso3, ...(entry.aliases ?? [])].some((key) => keys.has(String(key).trim().toUpperCase()))) return entry;
    }
    return null;
  }

  #prefetchHybridAsset(country, feature) {
    const entry = this.#findHybridManifestEntry(country, feature);
    if (!this.#isHybridEntryAllowed(entry) || this.hybridAssets.has(entry.url) || this.hybridAssetPromises.has(entry.url)) return;
    this.#loadHybridAsset(entry, null, false);
  }

  #loadHybridAsset(entry, requestedFeature, rebuildWhenReady = true) {
    if (this.hybridAssetPromises.has(entry.url)) return;
    const startedAt = performance.now();
    const promise = loadJsonAsset(entry.url)
      .then((asset) => {
        const durationMs = performance.now() - startedAt;
        this.failedHybridUrls.delete(entry.url);
        this.hybridAssets.set(entry.url, asset);
        this.hybridLoadDiagnostics.set(entry.url, { durationMs });
        this.hybridAssetPromises.delete(entry.url);
        const activeEntry = !this.disposed && this.feature
          ? this.#findHybridManifestEntry(this.selectedCountry, this.feature)
          : null;
        if (activeEntry?.url === entry.url && (rebuildWhenReady || this.feature)) this.#rebuild();
        return asset;
      })
      .catch((error) => {
        this.hybridAssetPromises.delete(entry.url);
        this.failedHybridUrls.add(entry.url);
        const activeEntry = !this.disposed && this.feature
          ? this.#findHybridManifestEntry(this.selectedCountry, this.feature)
          : null;
        if (activeEntry?.url === entry.url) this.#rebuild();
        console.warn("[SwingSphere hybrid border]", error);
      });
    this.hybridAssetPromises.set(entry.url, promise);
  }

  #preparedCacheKey(feature, source) {
    const featureKey = featureKeys(feature)[0] ?? "unknown";
    const geometrySettings = [
      this.options.pointStep ?? 1,
      this.options.radiusScale ?? 1.008,
      this.options.conformToLand !== false,
      this.options.maxSegmentDegrees ?? 0.8,
      this.options.maxRenderedStepDegrees ?? 4.5,
      this.options.maxShorelineTurnDegrees ?? 48,
      BORDER_SURFACE_CLEARANCE,
      BORDER_MAX_ANGULAR_STEP_DEGREES,
      BORDER_TERRAIN_DEVIATION,
      BORDER_CLEARANCE_TOLERANCE,
      BORDER_MAX_SUBDIVISION_DEPTH,
      STRAIGHT_PRESERVING_COASTLINE_VERSION
    ].join(":");
    return `${featureKey}|${source.id}|${geometrySettings}`;
  }

  #appendLineGeometry({ positions, normalizedProgress, hover }) {
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    const progressBuffer = createLineProgressAttributes(geometry, normalizedProgress);
    this.updateDiagnostics.staticProgressBufferBytes += progressBuffer.byteLength;
    const coreMaterial = createLineMaterial({
      width: hover ? this.settings.coreWidth * 0.72 : this.settings.coreWidth,
      opacity: hover ? 0.72 : this.settings.opacity * this.selectionTransition,
      blending: THREE.NormalBlending,
      gradientPhaseUniform: this.gradientPhaseUniform,
      gradientTextureUniform: this.gradientTextureUniform
    });
    const glowMaterial = createLineMaterial({
      width: hover ? this.settings.glowWidth * 0.72 : this.settings.glowWidth,
      opacity: hover ? this.settings.glowOpacity * 0.55 : this.settings.glowOpacity * this.selectionTransition,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      gradientPhaseUniform: this.gradientPhaseUniform,
      gradientTextureUniform: this.gradientTextureUniform
    });
    const glow = new Line2(geometry, glowMaterial);
    const core = new Line2(geometry, coreMaterial);
    glow.renderOrder = 28;
    core.renderOrder = 29;
    glow.visible = this.settings.glowVisible && this.settings.glowOpacity > 0;
    core.visible = this.settings.coreVisible;
    this.group.add(glow, core);
    this.lines.push({ geometry, glow, core, glowMaterial, coreMaterial });
  }

  #buildHybridConformingPoints({ points, fallbackRadius, conformToLand }) {
    if (points.length < 2) return points;
    const anchored = (point) => conformToLand
      ? { ...point, ...this.#resolveSurfacePoint(point.direction, fallbackRadius) }
      : {
          ...point,
          position: point.direction.clone().multiplyScalar(fallbackRadius + BORDER_SURFACE_CLEARANCE),
          anchorPosition: point.direction.clone().multiplyScalar(fallbackRadius),
          surfaceNormal: point.direction.clone(),
          hit: false
        };
    const result = [points[0]];
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      if (start.coastalToNext) {
        appendStraightPreservingSegment(result, start, end);
        continue;
      }
      const politicalSegment = [start];
      this.#subdivideTerrainSegment({ start, end, depth: 0, result: politicalSegment, anchored });
      result.push(...politicalSegment.slice(1));
    }
    return result;
  }

  #buildTerrainConformingPoints({ points, fallbackRadius, conformToLand }) {
    if (points.length < 2) return [];
    const anchored = (point) => conformToLand
      ? { ...point, ...this.#resolveSurfacePoint(point.direction, fallbackRadius) }
      : {
          ...point,
          position: point.direction.clone().multiplyScalar(fallbackRadius + BORDER_SURFACE_CLEARANCE),
          anchorPosition: point.direction.clone().multiplyScalar(fallbackRadius),
          surfaceNormal: point.direction.clone(),
          hit: false
        };
    const result = [];
    let start = anchored(points[0]);
    result.push(start);
    for (let index = 1; index < points.length; index += 1) {
      const end = anchored(points[index]);
      this.#subdivideTerrainSegment({ start, end, depth: 0, result, anchored });
      start = end;
      if (result.length >= BORDER_MAX_POINTS_PER_PATH) {
        this.diagnostics.sampleLimitReached += 1;
        break;
      }
    }
    this.diagnostics.renderedPointCount += result.length;
    return result;
  }

  #subdivideTerrainSegment({ start, end, depth, result, anchored }) {
    const angleRadians = angleBetween(start.direction, end.direction);
    const midpoint = anchored(interpolateBoundaryPoint(start, end, 0.5));
    const straightMidpoint = start.position.clone().add(end.position).multiplyScalar(0.5);
    const terrainDeviation = midpoint.position.distanceTo(straightMidpoint);
    const straightClearance = straightMidpoint.clone()
      .sub(midpoint.anchorPosition)
      .dot(midpoint.surfaceNormal);
    const clearanceDeficit = BORDER_SURFACE_CLEARANCE - straightClearance;
    this.diagnostics.maxTerrainDeviation = Math.max(this.diagnostics.maxTerrainDeviation, terrainDeviation);
    this.diagnostics.maxClearanceDeficit = Math.max(this.diagnostics.maxClearanceDeficit, clearanceDeficit);
    const hasComparableTerrainHits = Boolean(start.hit && midpoint.hit && end.hit);
    const mustSubdivide =
      THREE.MathUtils.radToDeg(angleRadians) > BORDER_MAX_ANGULAR_STEP_DEGREES ||
      (hasComparableTerrainHits && (
        terrainDeviation > BORDER_TERRAIN_DEVIATION ||
        clearanceDeficit > BORDER_CLEARANCE_TOLERANCE
      ));
    const hasCapacity = result.length + 2 < BORDER_MAX_POINTS_PER_PATH;
    if (mustSubdivide && depth < BORDER_MAX_SUBDIVISION_DEPTH && hasCapacity) {
      this.diagnostics.subdivisionCount += 1;
      this.#subdivideTerrainSegment({ start, end: midpoint, depth: depth + 1, result, anchored });
      this.#subdivideTerrainSegment({ start: midpoint, end, depth: depth + 1, result, anchored });
      return;
    }
    if (mustSubdivide && depth >= BORDER_MAX_SUBDIVISION_DEPTH) this.diagnostics.depthLimitReached += 1;
    if (mustSubdivide && !hasCapacity) this.diagnostics.sampleLimitReached += 1;
    const splitUnsafeSegment = mustSubdivide && (!hasCapacity || depth >= BORDER_MAX_SUBDIVISION_DEPTH);
    if (splitUnsafeSegment) this.diagnostics.unsafeSegmentSplitCount += 1;
    if (hasComparableTerrainHits && !splitUnsafeSegment) {
      this.diagnostics.maxAcceptedTerrainDeviation = Math.max(
        this.diagnostics.maxAcceptedTerrainDeviation,
        terrainDeviation
      );
      this.diagnostics.maxAcceptedClearanceDeficit = Math.max(
        this.diagnostics.maxAcceptedClearanceDeficit,
        clearanceDeficit
      );
      if (clearanceDeficit > BORDER_CLEARANCE_TOLERANCE) {
        this.diagnostics.acceptedClearanceViolationCount += 1;
      }
    }
    result.push(splitUnsafeSegment ? { ...end, breakBefore: true } : end);
  }

  #resolveSurfacePoint(direction, fallbackRadius) {
    const landHitMesh = this.renderer.landHitMesh;
    if (!landHitMesh) {
      const anchorPosition = direction.clone().multiplyScalar(Math.max(0.001, fallbackRadius));
      return {
        position: anchorPosition.clone().addScaledVector(direction, BORDER_SURFACE_CLEARANCE),
        anchorPosition,
        surfaceNormal: direction.clone(),
        hit: false
      };
    }
    const anchor = resolveLandSurfaceAnchorFromDirection({
      localDirection: direction,
      globeRadius: fallbackRadius,
      landHitMesh,
      raycaster: this.raycaster,
      origin: this.rayOrigin,
      direction: this.rayDirection,
      candidate: this.surfaceCandidate
    });
    const surfaceNormal = (anchor.surfaceNormal ?? anchor.radialDirection).clone().normalize();
    if (surfaceNormal.dot(anchor.radialDirection) < 0) surfaceNormal.multiplyScalar(-1);
    this.diagnostics.anchorRaycastCount += 1;
    if (!anchor.hit) this.diagnostics.fallbackAnchorCount += 1;
    return {
      position: anchor.anchorPosition.clone().addScaledVector(surfaceNormal, BORDER_SURFACE_CLEARANCE),
      anchorPosition: anchor.anchorPosition,
      surfaceNormal,
      hit: anchor.hit
    };
  }

  #clear() {
    for (const item of this.lines) {
      this.group.remove(item.glow, item.core);
      item.geometry.dispose();
      item.glowMaterial.dispose();
      item.coreMaterial.dispose();
    }
    this.lines = [];
    this.updateDiagnostics.staticProgressBufferBytes = 0;
  }
}

function dampTransition(current, target, delta, duration) {
  const lambda = 5 / Math.max(duration, 0.001);
  const next = THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * delta));
  return Math.abs(next - target) < 0.001 ? target : next;
}

function createLineMaterial({
  width,
  opacity,
  blending,
  depthWrite = false,
  gradientPhaseUniform,
  gradientTextureUniform
}) {
  const material = new LineMaterial({
    linewidth: width,
    vertexColors: false,
    transparent: true,
    opacity,
    worldUnits: false,
    alphaToCoverage: true,
    depthTest: true,
    depthWrite,
    blending
  });
  material.uniforms.gradientPhase = gradientPhaseUniform;
  material.uniforms.gradientMap = gradientTextureUniform;
  material.vertexShader = material.vertexShader
    .replace(
      "uniform vec2 resolution;",
      `uniform vec2 resolution;
      attribute float instanceProgressStart;
      attribute float instanceProgressEnd;
      varying float vGradientProgress;`
    )
    .replace(
      "void main() {",
      `void main() {
      vGradientProgress = ( position.y < 0.5 ) ? instanceProgressStart : instanceProgressEnd;`
    );
  material.fragmentShader = material.fragmentShader
    .replace(
      "uniform float linewidth;",
      `uniform float linewidth;
      uniform float gradientPhase;
      uniform sampler2D gradientMap;
      varying float vGradientProgress;`
    )
    .replace(
      "vec4 diffuseColor = vec4( diffuse, alpha );",
      `vec3 gradientColor = texture2D(
        gradientMap,
        vec2(fract(vGradientProgress - gradientPhase + 1.0), 0.5)
      ).rgb;
      vec4 diffuseColor = vec4(gradientColor, alpha);`
    );
  return material;
}

function createLineProgressAttributes(geometry, progress) {
  const segmentProgress = new Float32Array(Math.max(0, progress.length - 1) * 2);
  for (let index = 0; index < progress.length - 1; index += 1) {
    segmentProgress[index * 2] = progress[index];
    segmentProgress[index * 2 + 1] = progress[index + 1];
  }
  const buffer = new THREE.InstancedInterleavedBuffer(segmentProgress, 2, 1);
  geometry.setAttribute("instanceProgressStart", new THREE.InterleavedBufferAttribute(buffer, 1, 0));
  geometry.setAttribute("instanceProgressEnd", new THREE.InterleavedBufferAttribute(buffer, 1, 1));
  return segmentProgress;
}

function createGradientTexture(palette) {
  const texture = new THREE.DataTexture(
    new Uint8Array(GRADIENT_TEXTURE_WIDTH * 4),
    GRADIENT_TEXTURE_WIDTH,
    1,
    THREE.RGBAFormat
  );
  texture.name = "country-vector-border-gradient";
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  updateGradientTexture(texture, palette);
  return texture;
}

function updateGradientTexture(texture, palette) {
  const data = texture.image.data;
  const sample = new THREE.Color();
  for (let index = 0; index < GRADIENT_TEXTURE_WIDTH; index += 1) {
    const progress = index / GRADIENT_TEXTURE_WIDTH;
    const scaled = progress * palette.length;
    const paletteIndex = Math.floor(scaled) % palette.length;
    const nextIndex = (paletteIndex + 1) % palette.length;
    sample.copy(palette[paletteIndex]).lerp(palette[nextIndex], scaled - Math.floor(scaled));
    data[index * 4] = Math.round(THREE.MathUtils.clamp(sample.r, 0, 1) * 255);
    data[index * 4 + 1] = Math.round(THREE.MathUtils.clamp(sample.g, 0, 1) * 255);
    data[index * 4 + 2] = Math.round(THREE.MathUtils.clamp(sample.b, 0, 1) * 255);
    data[index * 4 + 3] = 255;
  }
  texture.needsUpdate = true;
}

function extractBoundarySegments(feature, pointStep, edgeCounts) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
  const segments = [];
  const step = Math.max(1, pointStep);
  for (const polygon of polygons) {
    for (const ring of polygon) {
      let current = [];
      for (let index = 0; index < ring.length - 1; index += step) {
        const start = ring[index];
        const end = ring[Math.min(index + step, ring.length - 1)];
        if (Math.abs(end[0] - start[0]) > 180) {
          if (current.length > 1) segments.push(current);
          current = [];
          continue;
        }
        const coastal = (edgeCounts.get(geoEdgeKey(start, end)) ?? 0) <= 1;
        if (!current.length) current.push({ coordinate: start, coastal });
        current.push({ coordinate: end, coastal });
      }
      if (current.length > 1) segments.push(current);
    }
  }
  return segments;
}

function hybridAssetToBoundarySegments(asset, sourceMode) {
  if (sourceMode === "coastline") {
    return (asset.coastlinePaths ?? [])
      .filter((coordinates) => Array.isArray(coordinates) && coordinates.length >= 2)
      .map((coordinates) => coordinates.map((coordinate, index) => ({
        coordinate,
        coastalToNext: index < coordinates.length - 1
      })));
  }
  return (asset.rings ?? []).filter((ring) => ring?.presentation !== false).map((ring) => {
    const points = [];
    for (const segment of ring.segments ?? []) {
      const coordinates = segment.coordinates ?? [];
      const coastlinePathId = segment.kind === "coastline" ? (segment.sourcePathId ?? null) : null;
      for (let index = 0; index < coordinates.length - 1; index += 1) {
        points.push({
          coordinate: coordinates[index],
          coastalToNext: segment.kind === "coastline",
          coastlinePathIdToNext: coastlinePathId
        });
      }
    }
    const finalSegment = ring.segments?.[ring.segments.length - 1];
    const finalCoordinate = finalSegment?.coordinates?.[finalSegment.coordinates.length - 1];
    if (finalCoordinate) points.push({ coordinate: finalCoordinate, coastalToNext: false });
    return points;
  }).filter((points) => points.length >= 2);
}

function boundarySegmentControlCoordinates(segment) {
  return segment.map(({ coordinate, coastal, coastalToNext, coastlinePathIdToNext }) => ({
    lon: coordinate[0],
    lat: coordinate[1],
    coastal: Boolean(coastal),
    coastalToNext: Boolean(coastalToNext),
    coastlinePathIdToNext: coastlinePathIdToNext ?? null
  }));
}

export function buildPhysicalCoastlineRenderPaths(asset, config) {
  return (asset?.paths ?? []).map((path) => {
    const source = (path.simplifiedCoordinates ?? [])
      .map((coordinate, index, coordinates) => ({
        lon: Number(coordinate?.[0]),
        lat: Number(coordinate?.[1]),
        coastal: true,
        coastalToNext: index < coordinates.length - 1
      }))
      .filter((control) => Number.isFinite(control.lon) && Number.isFinite(control.lat));
    const compensated = compensateHybridCoastlineControls(source, config);
    const points = compensated.map((control) =>
      wgs84ToRenderedGlobeLocal(control.lon, control.lat, 1, config).normalize()
    );
    return {
      id: path.id ?? null,
      closed: path.closed !== false,
      points,
      directions: points
    };
  }).filter((path) => path.points.length >= 2);
}

export function snapHybridCoastlineControlsToPhysical(controls, shorelinePaths, config, maxSnapDegrees = 5) {
  if (!Array.isArray(controls) || controls.length < 2 || !shorelinePaths?.length) return controls;
  const normalized = controls.map((control, index) => ({
    ...control,
    coastal: Boolean(control.coastal || control.coastalToNext || controls[index - 1]?.coastalToNext),
    coastlinePathIdToNext: control.coastlinePathIdToNext ?? null
  }));
  const snapped = buildShorelineConformedBoundary({
    coordinates: normalized,
    shorelinePaths,
    config,
    maxSnapDegrees,
    strictPhysicalMatch: true
  });
  return snapped.map((point) => {
    const geo = renderedGlobeLocalToWgs84(point.direction, config);
    return {
      lon: geo.lng,
      lat: geo.lat,
      coastal: Boolean(point.surfacePosition || point.coastalToNext),
      coastalToNext: Boolean(point.coastalToNext),
      physicalCoastline: Boolean(point.physicalCoastline)
    };
  });
}

export function compensateHybridCoastlineControls(controls, config) {
  if (!Array.isArray(controls) || controls.length < 2) return controls;
  const alignment = config?.alignment ?? {};
  const longitudeSign = Number(alignment.pinLongitudeSign ?? -1) || -1;
  const latitudeSign = Number(alignment.pinLatitudeSign ?? 1) || 1;
  const longitudeOffset = Number(alignment.pinLongitudeOffsetDeg ?? 0);
  const latitudeOffset = Number(alignment.pinLatitudeOffsetDeg ?? 0);
  if (Math.abs(longitudeOffset) < 1e-9 && Math.abs(latitudeOffset) < 1e-9) return controls;

  const isClosed = controls.length > 2
    && Math.abs(controls[0].lon - controls[controls.length - 1].lon) < 1e-8
    && Math.abs(controls[0].lat - controls[controls.length - 1].lat) < 1e-8;
  const lastEdgeIndex = Math.max(0, controls.length - 2);
  return controls.map((control, index) => {
    const previousIndex = index > 0 ? index - 1 : isClosed ? lastEdgeIndex : -1;
    const incomingCoastal = previousIndex >= 0 && Boolean(controls[previousIndex]?.coastalToNext);
    const touchesPhysicalCoast = Boolean(control.coastal || control.coastalToNext || incomingCoastal);
    if (!touchesPhysicalCoast) return control;
    return {
      ...control,
      // Hybrid coastline coordinates were authored from land.glb in the pre-calibration
      // visual frame. Counteract the WGS84 alignment offset only for coastline controls
      // so the existing Border Surgery shoreline work stays on the physical mesh.
      lon: wrapLongitude(control.lon - longitudeOffset / longitudeSign),
      lat: THREE.MathUtils.clamp(control.lat - latitudeOffset / latitudeSign, -90, 90)
    };
  });
}

function densifyNormalizedPath(points, closed, maxStepDegrees) {
  if (!Array.isArray(points) || points.length < 2) return points ?? [];
  const explicitlyClosed = points[0].angleTo(points[points.length - 1]) < 1e-8;
  const unique = explicitlyClosed ? points.slice(0, -1) : points.slice();
  if (unique.length < 2) return points.slice();
  const maxStepRadians = THREE.MathUtils.degToRad(Math.max(0.02, maxStepDegrees));
  const result = [unique[0].clone().normalize()];
  const segmentCount = closed ? unique.length : unique.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const start = unique[index].clone().normalize();
    const end = unique[(index + 1) % unique.length].clone().normalize();
    const angle = angleBetween(start, end);
    const divisions = Math.max(1, Math.ceil(angle / maxStepRadians));
    for (let step = 1; step <= divisions; step += 1) {
      if (closed && index === segmentCount - 1 && step === divisions) {
        result.push(result[0].clone());
        continue;
      }
      const t = step / divisions;
      result.push(start.clone().lerp(end, t).normalize());
    }
  }
  return result;
}

function appendStraightPreservingSegment(result, start, end) {
  const stepDegrees = THREE.MathUtils.radToDeg(angleBetween(start.direction, end.direction));
  const divisions = Math.max(1, Math.ceil(stepDegrees / STRAIGHT_PRESERVING_COASTLINE_STEP_DEGREES));
  const preservePhysicalChord = Boolean(start.physicalCoastline && end.physicalCoastline);
  const startRadius = start.position.length();
  const endRadius = end.position.length();
  for (let step = 1; step <= divisions; step += 1) {
    const t = step / divisions;
    if (step === divisions) {
      result.push(end);
      continue;
    }
    const interpolated = interpolateBoundaryPoint(start, end, t);
    const position = preservePhysicalChord
      ? start.position.clone().lerp(end.position, t)
      : interpolated.direction.clone().multiplyScalar(THREE.MathUtils.lerp(startRadius, endRadius, t));
    result.push({
      ...interpolated,
      direction: position.clone().normalize(),
      position,
      physicalCoastline: preservePhysicalChord,
      coastalToNext: true,
      breakBefore: false
    });
  }
}

function regularizeCoastalControlRadii(points) {
  const isClosed = points.length > 2 && points[0].direction.angleTo(points[points.length - 1].direction) < 1e-6;
  const uniqueCount = isClosed ? points.length - 1 : points.length;
  if (uniqueCount < 3) return points;

  let controls = points.slice(0, uniqueCount).map((point) => ({
    ...point,
    position: point.position.clone()
  }));

  for (let pass = 0; pass < 2; pass += 1) {
    const previousPass = controls;
    controls = previousPass.map((point, index) => {
      const previous = previousPass[(index - 1 + uniqueCount) % uniqueCount];
      const next = previousPass[(index + 1) % uniqueCount];
      const incomingCoastal = Boolean(previous.coastalToNext);
      const outgoingCoastal = Boolean(point.coastalToNext);
      if (point.physicalCoastline || previous.physicalCoastline || next.physicalCoastline) return point;
      if (!incomingCoastal || !outgoingCoastal) return point;
      const previousSpan = angleBetween(previous.direction, point.direction);
      const nextSpan = angleBetween(point.direction, next.direction);
      const totalSpan = previousSpan + nextSpan;
      const interpolation = totalSpan > 1e-8 ? previousSpan / totalSpan : 0.5;
      const expectedRadius = THREE.MathUtils.lerp(previous.position.length(), next.position.length(), interpolation);
      const radius = point.position.length();
      if (Math.abs(radius - expectedRadius) <= COASTLINE_RADIUS_OUTLIER) return point;
      return {
        ...point,
        position: point.direction.clone().multiplyScalar(expectedRadius)
      };
    });
  }

  if (isClosed) controls.push({ ...controls[0], position: controls[0].position.clone(), coastalToNext: false });
  return controls;
}

function densifyBoundarySegment(segment, maxSegmentDegrees) {
  const points = [];
  for (let index = 0; index < segment.length - 1; index += 1) {
    const start = segment[index];
    const end = segment[index + 1];
    const [startLon, startLat] = start.coordinate;
    const [endLon, endLat] = end.coordinate;
    let deltaLon = endLon - startLon;
    if (deltaLon > 180) deltaLon -= 360;
    if (deltaLon < -180) deltaLon += 360;
    const deltaLat = endLat - startLat;
    const span = Math.max(Math.abs(deltaLon), Math.abs(deltaLat));
    const divisions = Math.max(1, Math.ceil(span / maxSegmentDegrees));
    for (let step = 0; step < divisions; step += 1) {
      const t = step / divisions;
      const lon = wrapLongitude(startLon + deltaLon * t);
      const lat = startLat + deltaLat * t;
      points.push({ lon, lat, coastal: Boolean(start.coastal || end.coastal) });
    }
  }
  const last = segment[segment.length - 1];
  points.push({ lon: last.coordinate[0], lat: last.coordinate[1], coastal: Boolean(last.coastal) });
  return points;
}

function buildGeoJsonEdgeCounts(features) {
  const counts = new Map();
  for (const feature of features) {
    const geometry = feature?.geometry;
    if (!geometry) continue;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (let index = 0; index < ring.length - 1; index += 1) {
          const start = ring[index];
          const end = ring[index + 1];
          if (Math.abs(end[0] - start[0]) > 180) continue;
          const key = geoEdgeKey(start, end);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

function buildLandShorelinePaths(geometry) {
  if (!geometry) return [];
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const edges = new Map();
  const vertices = new Map();
  const readVertex = (vertexIndex) => new THREE.Vector3().fromBufferAttribute(position, vertexIndex);
  const addEdge = (aIndex, bIndex) => {
    const a = readVertex(aIndex);
    const b = readVertex(bIndex);
    const aKey = vectorVertexKey(a);
    const bKey = vectorVertexKey(b);
    const key = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
    vertices.set(aKey, a);
    vertices.set(bKey, b);
    const existing = edges.get(key);
    if (existing) existing.count += 1;
    else edges.set(key, { key, count: 1, aKey, bKey });
  };
  const triangleCount = index ? index.count / 3 : position.count / 3;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = index ? index.getX(triangle * 3) : triangle * 3;
    const b = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1;
    const c = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }

  const adjacency = new Map();
  const boundaryEdges = [...edges.values()].filter((edge) => edge.count === 1);
  for (const edge of boundaryEdges) {
    if (!adjacency.has(edge.aKey)) adjacency.set(edge.aKey, new Set());
    if (!adjacency.has(edge.bKey)) adjacency.set(edge.bKey, new Set());
    adjacency.get(edge.aKey).add(edge.bKey);
    adjacency.get(edge.bKey).add(edge.aKey);
  }

  const unused = new Set(boundaryEdges.map((edge) => edge.key));
  const paths = [];
  const edgeKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  while (unused.size) {
    const seedKey = unused.values().next().value;
    const seed = edges.get(seedKey);
    const componentStart = [seed.aKey, seed.bKey].find((key) => (adjacency.get(key)?.size ?? 0) === 1) ?? seed.aKey;
    const keys = [componentStart];
    let previous = null;
    let current = componentStart;
    while (true) {
      const next = [...(adjacency.get(current) ?? [])].find((candidate) => candidate !== previous && unused.has(edgeKey(current, candidate)));
      if (!next) break;
      unused.delete(edgeKey(current, next));
      keys.push(next);
      previous = current;
      current = next;
      if (current === componentStart) break;
    }
    if (keys.length >= 2) {
      const points = keys.map((key) => vertices.get(key).clone());
      paths.push({ points, closed: keys[0] === keys[keys.length - 1] });
    } else {
      unused.delete(seedKey);
    }
  }
  return paths;
}

function buildShorelineConformedBoundary({ coordinates, shorelinePaths, config, maxSnapDegrees, strictPhysicalMatch = false }) {
  const source = coordinates.map((point) => ({
    ...point,
    originalDirection: wgs84ToRenderedGlobeLocal(point.lon, point.lat, 1, config).normalize()
  }));
  if (!shorelinePaths.length) {
    return source.map((point) => ({
      direction: point.originalDirection.clone(),
      originalDirection: point.originalDirection.clone(),
      surfacePosition: null,
      physicalCoastline: false,
      coastalToNext: Boolean(point.coastalToNext)
    }));
  }

  const result = [];
  let index = 0;
  while (index < source.length) {
    if (!source[index].coastal) {
      result.push({
        direction: source[index].originalDirection.clone(),
        originalDirection: source[index].originalDirection.clone(),
        surfacePosition: null,
        physicalCoastline: false,
        coastalToNext: Boolean(source[index].coastalToNext)
      });
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < source.length && source[end].coastal) end += 1;
    const run = source.slice(index, end);
    const pathIds = [...new Set(
      run.map((point) => point.coastlinePathIdToNext).filter((value) => typeof value === "string" && value.length)
    )];
    const preferredPathIds = pathIds.length === 1 ? new Set(pathIds) : null;
    const arc = findBestShorelineArc(run, shorelinePaths, maxSnapDegrees, strictPhysicalMatch, preferredPathIds);
    if (arc?.length >= 2) {
      for (let arcIndex = 0; arcIndex < arc.length; arcIndex += 1) {
        const position = arc[arcIndex];
        const direction = position.clone().normalize();
        const nearestSource = findNearestSourceDirection(direction, run);
        result.push({
          direction,
          originalDirection: nearestSource.clone(),
          surfacePosition: position.clone(),
          physicalCoastline: strictPhysicalMatch,
          coastalToNext: strictPhysicalMatch
            ? (arcIndex < arc.length - 1 ? true : Boolean(run.at(-1)?.coastalToNext))
            : true
        });
      }
    } else {
      for (const point of run) {
        result.push({
          direction: point.originalDirection.clone(),
          originalDirection: point.originalDirection.clone(),
          surfacePosition: null,
          physicalCoastline: false,
          coastalToNext: Boolean(point.coastalToNext)
        });
      }
    }
    index = end;
  }
  return dedupeBoundaryPoints(result);
}

function findBestShorelineArc(run, shorelinePaths, maxSnapDegrees, strictPhysicalMatch = false, preferredPathIds = null) {
  if (run.length < 2) return null;
  const start = run[0].originalDirection;
  const end = run[run.length - 1].originalDirection;
  const sourceDirections = run.map((point) => point.originalDirection);
  const midpoint = run[Math.floor(run.length / 2)].originalDirection;
  const maxAngle = THREE.MathUtils.degToRad(maxSnapDegrees);
  const sourceLength = angularPathLength(sourceDirections);
  let best = null;
  let bestScore = Infinity;

  for (const path of shorelinePaths) {
    if (preferredPathIds?.size && !preferredPathIds.has(path.id)) continue;

    let candidates;
    let startAngle;
    let endAngle;
    if (strictPhysicalMatch) {
      const startMatch = nearestPointOnPathSegments(start, path.points, path.closed);
      const endMatch = nearestPointOnPathSegments(end, path.points, path.closed);
      if (!startMatch || !endMatch) continue;
      startAngle = startMatch.angle;
      endAngle = endMatch.angle;
      if (startAngle > maxAngle || endAngle > maxAngle) continue;
      candidates = buildProjectedPathArcs(path.points, startMatch, endMatch, path.closed);
    } else {
      const directions = path.directions ?? path.points.map((point) => point.clone().normalize());
      const startIndex = nearestDirectionIndex(start, directions);
      const endIndex = nearestDirectionIndex(end, directions);
      startAngle = angleBetween(start, directions[startIndex]);
      endAngle = angleBetween(end, directions[endIndex]);
      if (startAngle > maxAngle || endAngle > maxAngle) continue;
      candidates = buildPathArcs(path.points, startIndex, endIndex, path.closed);
    }

    for (const arc of candidates) {
      if (arc.length < 2) continue;
      const arcDirections = arc.map((point) => point.clone().normalize());
      const midpointAngle = strictPhysicalMatch
        ? nearestPolylineAngle(midpoint, arcDirections)
        : nearestDirectionAngle(midpoint, arcDirections);
      if (midpointAngle > maxAngle * 1.6) continue;
      const arcLength = angularPathLength(arcDirections);
      const lengthPenalty = Math.abs(arcLength - sourceLength) / Math.max(sourceLength, 1e-4);
      let score = startAngle + endAngle + midpointAngle * 0.8 + lengthPenalty * 0.08;
      if (strictPhysicalMatch) {
        const sourceDistances = sourceDirections.map((direction) => nearestPolylineAngle(direction, arcDirections));
        const arcDistances = arcDirections.map((direction) => nearestPolylineAngle(direction, sourceDirections));
        const maximumSourceToArc = Math.max(...sourceDistances);
        const maximumArcToSource = Math.max(...arcDistances);
        if (maximumSourceToArc > maxAngle * 2.4 || maximumArcToSource > maxAngle * 2.4) continue;
        const averageSourceToArc = sourceDistances.reduce((sum, value) => sum + value, 0) / sourceDistances.length;
        const averageArcToSource = arcDistances.reduce((sum, value) => sum + value, 0) / arcDistances.length;
        score = startAngle + endAngle
          + midpointAngle * 0.8
          + averageSourceToArc * 1.2
          + averageArcToSource * 0.75
          + lengthPenalty * 0.55;
      }
      if (score >= bestScore) continue;
      bestScore = score;
      best = arc;
    }
  }
  return best;
}

function nearestPointOnPathSegments(direction, points, closed) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const explicitlyClosed = points[0].distanceToSquared(points[points.length - 1]) < 1e-10;
  const unique = explicitlyClosed ? points.slice(0, -1) : points;
  const segmentCount = closed ? unique.length : unique.length - 1;
  let best = null;
  for (let index = 0; index < segmentCount; index += 1) {
    const a = unique[index];
    const b = unique[(index + 1) % unique.length];
    const ab = b.clone().sub(a);
    const denominator = ab.lengthSq();
    if (denominator < 1e-12) continue;
    const t = THREE.MathUtils.clamp(direction.clone().sub(a).dot(ab) / denominator, 0, 1);
    const point = a.clone().lerp(b, t).normalize();
    const angle = angleBetween(direction, point);
    if (best && angle >= best.angle) continue;
    best = { segmentIndex: index, t, point, angle };
  }
  return best;
}

function buildProjectedPathArcs(points, startMatch, endMatch, closed) {
  const explicitlyClosed = points[0].distanceToSquared(points[points.length - 1]) < 1e-10;
  const unique = explicitlyClosed ? points.slice(0, -1) : points.slice();
  if (unique.length < 2) return [];
  const startPoint = startMatch.point.clone();
  const endPoint = endMatch.point.clone();
  const inserts = new Map();
  const addInsert = (segmentIndex, entry) => {
    const entries = inserts.get(segmentIndex) ?? [];
    entries.push(entry);
    inserts.set(segmentIndex, entries);
  };
  addInsert(startMatch.segmentIndex, { t: startMatch.t, point: startPoint, kind: "start" });
  addInsert(endMatch.segmentIndex, { t: endMatch.t, point: endPoint, kind: "end" });

  const expanded = [];
  let startIndex = -1;
  let endIndex = -1;
  const segmentCount = closed ? unique.length : unique.length - 1;
  for (let index = 0; index < unique.length; index += 1) {
    expanded.push(unique[index]);
    if (index >= segmentCount) continue;
    const entries = (inserts.get(index) ?? []).sort((a, b) => a.t - b.t);
    for (const entry of entries) {
      expanded.push(entry.point);
      if (entry.kind === "start") startIndex = expanded.length - 1;
      if (entry.kind === "end") endIndex = expanded.length - 1;
    }
  }
  if (startIndex < 0 || endIndex < 0) return [];
  return buildPathArcs(expanded, startIndex, endIndex, closed);
}

function nearestPolylineAngle(direction, points) {
  if (!Array.isArray(points) || points.length < 2) return Math.PI;
  const match = nearestPointOnPathSegments(direction, points, false);
  return match?.angle ?? Math.PI;
}

function buildPathArcs(points, startIndex, endIndex, closed) {
  if (!closed) {
    const slice = startIndex <= endIndex
      ? points.slice(startIndex, endIndex + 1)
      : points.slice(endIndex, startIndex + 1).reverse();
    return [slice];
  }
  const unique = points[0].distanceToSquared(points[points.length - 1]) < 1e-10 ? points.slice(0, -1) : points.slice();
  const forward = [];
  let cursor = startIndex % unique.length;
  while (true) {
    forward.push(unique[cursor]);
    if (cursor === endIndex % unique.length) break;
    cursor = (cursor + 1) % unique.length;
    if (forward.length > unique.length + 1) break;
  }
  const backward = [];
  cursor = startIndex % unique.length;
  while (true) {
    backward.push(unique[cursor]);
    if (cursor === endIndex % unique.length) break;
    cursor = (cursor - 1 + unique.length) % unique.length;
    if (backward.length > unique.length + 1) break;
  }
  return [forward, backward];
}

function nearestDirectionIndex(direction, candidates) {
  let bestIndex = 0;
  let bestDot = -Infinity;
  for (let index = 0; index < candidates.length; index += 1) {
    const dot = direction.dot(candidates[index]);
    if (dot <= bestDot) continue;
    bestDot = dot;
    bestIndex = index;
  }
  return bestIndex;
}

function nearestDirectionAngle(direction, candidates) {
  return angleBetween(direction, candidates[nearestDirectionIndex(direction, candidates)]);
}

function findNearestSourceDirection(direction, run) {
  return run[nearestDirectionIndex(direction, run.map((point) => point.originalDirection))].originalDirection;
}

function angularPathLength(directions) {
  let total = 0;
  for (let index = 1; index < directions.length; index += 1) total += angleBetween(directions[index - 1], directions[index]);
  return total;
}

function angleBetween(a, b) {
  return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
}

function dedupeBoundaryPoints(points) {
  const deduped = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.direction.dot(point.direction) > 0.9999999) continue;
    deduped.push(point);
  }
  return deduped;
}

function sanitizeProjectedPoints({ points, resolveOriginalPosition, maxTurnDegrees, maxRadialOutlier }) {
  if (points.length < 3) return points;
  const sanitized = points.map((point) => ({ ...point, position: point.position.clone() }));
  for (let index = 1; index < sanitized.length - 1; index += 1) {
    const previous = sanitized[index - 1];
    const current = sanitized[index];
    const next = sanitized[index + 1];
    if (!current.snapped) continue;
    const previousDirection = previous.position.clone().normalize();
    const currentDirection = current.position.clone().normalize();
    const nextDirection = next.position.clone().normalize();
    const incoming = currentDirection.clone().sub(previousDirection).normalize();
    const outgoing = nextDirection.clone().sub(currentDirection).normalize();
    const turnDegrees = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(incoming.dot(outgoing), -1, 1)));
    const neighborRadius = (previous.position.length() + next.position.length()) * 0.5;
    const radialDeviation = Math.abs(current.position.length() - neighborRadius);
    if (turnDegrees <= maxTurnDegrees && radialDeviation <= maxRadialOutlier) continue;
    current.position = resolveOriginalPosition(current.originalDirection);
    current.direction = current.originalDirection.clone();
    current.snapped = false;
  }
  return sanitized;
}

function interpolateBoundaryPoint(start, end, t) {
  return {
    direction: start.direction.clone().lerp(end.direction, t).normalize(),
    originalDirection: start.originalDirection.clone().lerp(end.originalDirection, t).normalize(),
    snapped: Boolean(start.snapped && end.snapped)
  };
}

function createEmptyDiagnostics() {
  return {
    borderSource: "none",
    hybridBorderVersion: null,
    coastlineAssetVersion: null,
    hybridAssetLoadDurationMs: 0,
    anchorRaycastCount: 0,
    fallbackAnchorCount: 0,
    renderedPointCount: 0,
    subdivisionCount: 0,
    depthLimitReached: 0,
    sampleLimitReached: 0,
    unsafeSegmentSplitCount: 0,
    maxTerrainDeviation: 0,
    maxClearanceDeficit: 0,
    maxAcceptedTerrainDeviation: 0,
    maxAcceptedClearanceDeficit: 0,
    acceptedClearanceViolationCount: 0,
    cacheHit: false,
    countrySwitchRaycastCount: 0,
    generationDurationMs: 0,
    buildDurationMs: 0
  };
}

function createEmptyUpdateDiagnostics() {
  return {
    updateCallCount: 0,
    colorUpdateCount: 0,
    gpuColorBufferUploadCount: 0,
    colorArrayAllocationBytes: 0,
    lastColorArrayAllocationBytes: 0,
    totalUpdateDurationMs: 0,
    lastUpdateDurationMs: 0,
    maxUpdateDurationMs: 0,
    averageUpdateDurationMs: 0,
    totalColorUpdateDurationMs: 0,
    maxColorUpdateDurationMs: 0,
    averageColorUpdateDurationMs: 0,
    gradientUniformUpdateCount: 0,
    gradientTextureUploadCount: 1,
    resolutionUpdateCount: 0,
    staticProgressBufferBytes: 0,
    preparedCacheHitCount: 0,
    preparedCacheMissCount: 0,
    preparedCacheEvictionCount: 0,
    preparedCacheBytes: 0
  };
}

function geoEdgeKey(a, b) {
  const first = `${quantize(a[0])},${quantize(a[1])}`;
  const second = `${quantize(b[0])},${quantize(b[1])}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function vectorVertexKey(value) {
  return `${quantize(value.x)},${quantize(value.y)},${quantize(value.z)}`;
}

function vectorEdgeKey(a, b) {
  const first = vectorVertexKey(a);
  const second = vectorVertexKey(b);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function quantize(value) {
  return Math.round(value * 100000) / 100000;
}

function wrapLongitude(value) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function featureKeys(feature) {
  const properties = feature?.properties ?? {};
  return [feature?.id, properties.ISO_A2, properties.ISO_A3, properties.iso_a2, properties.iso_a3, properties.ADM0_A3, properties.name, properties.NAME]
    .filter((value) => value != null && String(value).trim())
    .map((value) => String(value).trim().toUpperCase());
}

function countryKeys(country) {
  if (!country) return [];
  return [country.id, country.iso2, country.iso3, country.name]
    .filter((value) => value != null && String(value).trim())
    .map((value) => String(value).trim().toUpperCase());
}

function normalizeCountryKeys(countries) {
  if (!Array.isArray(countries)) return new Set();
  return new Set(countries.flatMap((country) => {
    if (typeof country === "string" || typeof country === "number") {
      const key = String(country).trim().toUpperCase();
      return key ? [key] : [];
    }
    return countryKeys(country);
  }));
}

function normalizeSourceMode(mode) {
  return ["geojson", "coastline", "hybrid"].includes(mode) ? mode : "hybrid";
}

function normalizePresentationGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group) => ({
      ...group,
      members: Array.isArray(group?.members)
        ? group.members.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
        : [],
      suppressVectorBorders: group?.suppressVectorBorders !== false
    }))
    .filter((group) => group.members.length > 0);
}

function normalizeAllowedStatuses(statuses) {
  if (!Array.isArray(statuses) || !statuses.length) return null;
  return new Set(statuses.map((status) => String(status).trim().toLowerCase()).filter(Boolean));
}

function findFeature(featuresByKey, country) {
  if (!country) return null;
  for (const key of countryKeys(country)) {
    const feature = featuresByKey.get(key);
    if (feature) return feature;
  }
  return null;
}

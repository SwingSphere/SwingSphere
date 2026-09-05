import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { wgs84ToRenderedGlobeLocal } from "./math/geoProjection.js";
import { resolveLandSurfaceAnchorFromDirection } from "./math/surfaceAnchoring.js";
import {
  BORDER_SURFACE_CLEARANCE,
  buildPhysicalCoastlineRenderPaths,
  compensateHybridCoastlineControls,
  snapHybridCoastlineControlsToPhysical
} from "./CountryVectorBorderLayer.js";
import { loadJsonAsset } from "./jsonAssetCache.js";

const DEFAULT_IDLE = {
  enabled: true,
  coreVisible: true,
  glowVisible: true,
  coreColor: "#d9dde2",
  glowColor: "#ff465c",
  coreWidth: 1.5,
  coreOpacity: 0.42,
  glowWidth: 5.5,
  glowOpacity: 0.045,
  pulseEnabled: true,
  pulseMin: 0.55,
  pulseMax: 1,
  pulseSpeed: 0.24
};

const DEFAULT_HOVER = {
  enabled: true,
  coreVisible: true,
  glowVisible: true,
  coreColor: "#f4f5f7",
  glowColor: "#ff465c",
  sweepColor: "#ffffff",
  coreWidth: 2.2,
  coreOpacity: 0.9,
  glowWidth: 8,
  glowOpacity: 0.12,
  sweepEnabled: true,
  sweepWidth: 0.22,
  sweepStrength: 0.9,
  sweepSpeed: 0.7,
  sweepRepeat: false
};

export function resolveActivityBoundaryCoverage(requestedCountryKeys = [], countryGroups = new Map()) {
  const requestedKeys = [...new Set(
    requestedCountryKeys
      .map((value) => String(value ?? "").trim().toUpperCase())
      .filter(Boolean)
  )];
  const resolvedCountryKeys = requestedKeys.filter((key) => {
    const country = countryGroups.get(key);
    return (country?.lines?.length ?? 0) > 0
      && (country.sourceType === "hybrid" || country.sourceType === "geojson-fallback");
  });
  const resolved = new Set(resolvedCountryKeys);
  return {
    requestedCountryKeys: requestedKeys,
    resolvedCountryKeys,
    unresolvedCountryKeys: requestedKeys.filter((key) => !resolved.has(key))
  };
}

export class CountryVectorActivityLayer {
  constructor({ renderer, config }) {
    this.renderer = renderer;
    this.config = config;
    this.options = config.countryVectorActivity ?? {};
    this.enabled = this.options.enabled !== false;
    this.manifestUrl = this.options.manifestUrl ?? config.hybridCountryBorders?.manifestUrl;
    this.fallbackGeoJsonUrl = this.options.fallbackGeoJsonUrl ?? config.countryVectorBorders?.url ?? null;
    this.allowedHybridStatuses = normalizeAllowedStatuses(
      this.options.allowedHybridStatuses ?? config.hybridCountryBorders?.allowedStatuses
    );
    this.radiusScale = Number(this.options.radiusScale ?? config.countryVectorBorders?.radiusScale ?? 1.009);
    this.maxStepDegrees = Math.max(0.08, Number(this.options.maxStepDegrees ?? 0.18));
    this.settings = {
      idle: { ...DEFAULT_IDLE, ...(this.options.idle ?? {}) },
      hover: { ...DEFAULT_HOVER, ...(this.options.hover ?? {}) }
    };
    this.manifest = null;
    this.assets = new Map();
    this.assetPromises = new Map();
    this.fallbackFeaturesByKey = new Map();
    this.fallbackGeoJsonPromise = null;
    this.activityCountries = [];
    this.activitySyncVersion = 0;
    this.disposed = false;
    this.countryGroups = new Map();
    this.hoveredKey = null;
    this.selectedKey = null;
    this.hoverStartedAt = null;
    this.lastTransitionElapsed = null;
    this.lastCoverageGapSignature = "";
    this.renderResolution = new THREE.Vector2();
    this.appliedResolution = new THREE.Vector2(-1, -1);
    this.raycaster = new THREE.Raycaster();
    this.rayOrigin = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3();
    this.surfaceCandidate = new THREE.Vector3();
    this.experimentalPhysicalCoastlineSnap = this.options.experimentalPhysicalCoastlineSnap === true;
    this.shorelinePaths = [];
    this.shorelineSnapExcludedCountryKeys = this.experimentalPhysicalCoastlineSnap
      ? new Set(
          (this.options.shorelineSnapExcludedCountryKeys ?? this.config.countryVectorBorders?.shorelineSnapExcludedCountryKeys ?? [])
            .map((value) => String(value).trim().toUpperCase())
            .filter(Boolean)
        )
      : new Set();
    this.group = new THREE.Group();
    this.group.name = "language-explorer-vector-country-activity";
    this.group.renderOrder = 27;
    this.group.visible = this.enabled;
    this.renderer.globe.add(this.group);
  }

  async mount() {
    if (this.manifestUrl) {
      this.manifest = await loadJsonAsset(this.manifestUrl).catch((error) => {
        console.warn("[SwingSphere activity boundary manifest]", error);
        return null;
      });
    }
    if (!this.manifest && !this.fallbackGeoJsonUrl) return;
    if (this.experimentalPhysicalCoastlineSnap) {
      const physicalCoastlineAsset = await loadJsonAsset(
        this.options.physicalCoastlineUrl ?? this.config.countryVectorBorders?.physicalCoastlineUrl ?? "/assets/globe/coastlines/physical-coastlines-v1.json"
      ).catch((error) => {
        console.warn("[SwingSphere activity physical coastline]", error);
        return null;
      });
      this.shorelinePaths = buildPhysicalCoastlineRenderPaths(physicalCoastlineAsset, this.config);
    }
    await this.#syncActivityCountries();
  }

  setVisible(visible) {
    this.enabled = Boolean(visible);
    this.group.visible = this.enabled;
  }

  setActivityCountries(countries = []) {
    this.activityCountries = Array.isArray(countries) ? [...countries] : [];
    this.activitySyncVersion += 1;
    void this.#syncActivityCountries(this.activitySyncVersion);
  }

  setHoveredCountry(country) {
    const next = this.#resolveCountryKey(country);
    if (next === this.hoveredKey) return;
    this.hoveredKey = next;
    this.hoverStartedAt = null;
    this.#applyVisibilityAndStaticStyles();
  }

  setSelectedCountry(country) {
    this.selectedKey = this.#resolveCountryKey(country);
    this.#applyVisibilityAndStaticStyles();
  }

  updateSettings(next = {}) {
    if (next.idle) Object.assign(this.settings.idle, sanitizeStyle(next.idle, "idle"));
    if (next.hover) Object.assign(this.settings.hover, sanitizeStyle(next.hover, "hover"));
    if (typeof next.enabled === "boolean") this.setVisible(next.enabled);
    this.#applyVisibilityAndStaticStyles();
  }

  update(elapsed = 0) {
    this.group.rotation.y = this.renderer.visibleLandMesh?.rotation.y ?? 0;
    if (!this.enabled || !this.countryGroups.size) return;
    this.renderer.renderer.getSize(this.renderResolution);
    if (!this.renderResolution.equals(this.appliedResolution)) {
      this.appliedResolution.copy(this.renderResolution);
      for (const country of this.countryGroups.values()) {
        for (const line of country.lines) {
          line.coreMaterial.resolution.copy(this.renderResolution);
          line.glowMaterial.resolution.copy(this.renderResolution);
        }
      }
    }

    const idle = this.settings.idle;
    const reducedMotion = Boolean(this.config.motion?.reduced);
    const pulsePhase = 0.5 + 0.5 * Math.sin(elapsed * Math.PI * 2 * idle.pulseSpeed);
    const pulse = !reducedMotion && idle.pulseEnabled
      ? THREE.MathUtils.lerp(idle.pulseMin, idle.pulseMax, pulsePhase)
      : 1;

    const delta = this.lastTransitionElapsed == null ? 0 : Math.max(0, Math.min(0.1, elapsed - this.lastTransitionElapsed));
    this.lastTransitionElapsed = elapsed;
    const hoverDuration = reducedMotion ? 0 : Math.max(0.08, Number(this.options.hoverTransitionSeconds ?? 0.22));
    const selectedDuration = reducedMotion ? 0 : Math.max(0.1, Number(this.options.selectedTransitionSeconds ?? 0.3));

    for (const [key, country] of this.countryGroups) {
      const selected = key === this.selectedKey;
      const hovered = key === this.hoveredKey && this.settings.hover.enabled && !selected;
      country.hoverMix = reducedMotion
        ? Number(hovered)
        : dampTransition(country.hoverMix, hovered ? 1 : 0, delta, hoverDuration);
      country.selectedMix = reducedMotion
        ? Number(selected)
        : dampTransition(country.selectedMix, selected ? 1 : 0, delta, selectedDuration);
      const visibleMix = 1 - country.selectedMix;

      for (const line of country.lines) {
        line.core.visible = visibleMix > 0.002 && (idle.coreVisible || this.settings.hover.coreVisible);
        line.glow.visible = visibleMix > 0.002 && (idle.glowVisible || this.settings.hover.glowVisible);
        line.coreMaterial.linewidth = THREE.MathUtils.lerp(idle.coreWidth, this.settings.hover.coreWidth, country.hoverMix);
        line.glowMaterial.linewidth = THREE.MathUtils.lerp(idle.glowWidth, this.settings.hover.glowWidth, country.hoverMix);
        line.coreMaterial.opacity = THREE.MathUtils.lerp(idle.coreOpacity, this.settings.hover.coreOpacity, country.hoverMix) * visibleMix;
        line.glowMaterial.opacity = THREE.MathUtils.lerp(idle.glowOpacity * pulse, this.settings.hover.glowOpacity, country.hoverMix) * visibleMix;
        if (!reducedMotion && (hovered || country.hoverMix > 0.002)) this.#updateHoverLine(line, elapsed);
      }
    }
  }

  getDiagnostics() {
    let pathCount = 0;
    let drawCalls = 0;
    for (const country of this.countryGroups.values()) {
      pathCount += country.lines.length;
      for (const line of country.lines) drawCalls += Number(line.core.visible) + Number(line.glow.visible);
    }
    const requestedCountryKeys = [...new Set(
      this.activityCountries.map((country) => this.#resolveCountryKey(country)).filter(Boolean)
    )];
    const missingCountryKeys = requestedCountryKeys.filter((key) => !this.manifest?.countries?.[key]);
    const generatedCountryKeys = requestedCountryKeys.filter(
      (key) => this.manifest?.countries?.[key]?.status === "generated"
    );
    const fallbackCountryKeys = [...this.countryGroups]
      .filter(([, country]) => country.sourceType === "geojson-fallback")
      .map(([key]) => key);
    const rejectedHybridCountryKeys = requestedCountryKeys.filter((key) => {
      const entry = this.manifest?.countries?.[key];
      return Boolean(entry?.url) && !this.#isHybridEntryAllowed(entry);
    });
    const coverage = resolveActivityBoundaryCoverage(requestedCountryKeys, this.countryGroups);
    return {
      requestedCountryCount: requestedCountryKeys.length,
      countryCount: this.countryGroups.size,
      missingCountryKeys,
      generatedCountryKeys,
      missingHybridCountryKeys: missingCountryKeys,
      fallbackCountryKeys,
      rejectedHybridCountryKeys,
      resolvedCountryKeys: coverage.resolvedCountryKeys,
      unresolvedCountryKeys: coverage.unresolvedCountryKeys,
      pathCount,
      drawCalls,
      hoveredCountryKey: this.hoveredKey,
      selectedCountryKey: this.selectedKey
    };
  }

  dispose() {
    this.disposed = true;
    this.activitySyncVersion += 1;
    for (const country of this.countryGroups.values()) this.#disposeCountry(country);
    this.countryGroups.clear();
    this.assets.clear();
    this.assetPromises.clear();
    this.fallbackFeaturesByKey.clear();
    this.fallbackGeoJsonPromise = null;
    this.renderer.globe.remove(this.group);
  }

  async #syncActivityCountries(syncVersion = this.activitySyncVersion) {
    if (this.disposed) return;
    const requested = new Set(this.activityCountries.map((country) => this.#resolveCountryKey(country)).filter(Boolean));
    for (const [key, country] of this.countryGroups) {
      if (requested.has(key)) continue;
      this.#disposeCountry(country);
      this.countryGroups.delete(key);
    }
    await Promise.all([...requested].map(async (key) => {
      if (this.countryGroups.has(key)) return;
      const entry = this.manifest?.countries?.[key];
      let source = null;
      let sourceType = null;
      if (this.#isHybridEntryAllowed(entry)) {
        source = await this.#loadAsset(entry.url);
        sourceType = source ? "hybrid" : null;
      }
      if (!source) {
        source = await this.#loadFallbackFeature(key);
        sourceType = source ? "geojson-fallback" : null;
      }
      if (!source || this.disposed || syncVersion !== this.activitySyncVersion) return;
      const currentRequested = new Set(
        this.activityCountries.map((country) => this.#resolveCountryKey(country)).filter(Boolean)
      );
      if (!currentRequested.has(key)) return;
      let country = this.#buildCountry(key, source, sourceType, entry?.status ?? null);
      if (!country.lines.length && sourceType === "hybrid") {
        const fallback = await this.#loadFallbackFeature(key);
        if (fallback && !this.disposed && syncVersion === this.activitySyncVersion) {
          this.#disposeCountry(country);
          country = this.#buildCountry(key, fallback, "geojson-fallback", entry?.status ?? null);
        }
      }
      if (country.lines.length) this.countryGroups.set(key, country);
    }));
    if (this.disposed || syncVersion !== this.activitySyncVersion) return;
    this.#applyVisibilityAndStaticStyles();
    this.#reportBoundaryCoverage();
  }

  #reportBoundaryCoverage() {
    const { unresolvedCountryKeys } = this.getDiagnostics();
    const signature = unresolvedCountryKeys.join("|");
    if (signature === this.lastCoverageGapSignature) return;
    this.lastCoverageGapSignature = signature;
    if (!unresolvedCountryKeys.length) return;
    console.error(
      "[SwingSphere activity boundary coverage] Active countries without a drawable hybrid or GeoJSON boundary:",
      unresolvedCountryKeys
    );
  }

  #isHybridEntryAllowed(entry) {
    if (!entry?.url) return false;
    if (!this.allowedHybridStatuses) return true;
    return this.allowedHybridStatuses.has(String(entry.status ?? "").trim().toLowerCase());
  }

  async #loadFallbackFeature(key) {
    if (!this.fallbackGeoJsonUrl) return null;
    if (!this.fallbackFeaturesByKey.size) await this.#loadFallbackGeoJson();
    return this.fallbackFeaturesByKey.get(String(key).trim().toUpperCase()) ?? null;
  }

  async #loadFallbackGeoJson() {
    if (this.fallbackGeoJsonPromise) return this.fallbackGeoJsonPromise;
    this.fallbackGeoJsonPromise = loadJsonAsset(this.fallbackGeoJsonUrl)
      .then((data) => {
        if (this.disposed) return;
        for (const feature of data?.features ?? []) {
          if (!feature?.geometry) continue;
          for (const featureKey of fallbackFeatureKeys(feature)) {
            if (!this.fallbackFeaturesByKey.has(featureKey)) this.fallbackFeaturesByKey.set(featureKey, feature);
          }
        }
      })
      .catch((error) => {
        console.warn("[SwingSphere vector activity fallback]", error);
      });
    return this.fallbackGeoJsonPromise;
  }

  async #loadAsset(url) {
    if (this.assets.has(url)) return this.assets.get(url);
    if (this.assetPromises.has(url)) return this.assetPromises.get(url);
    const promise = loadJsonAsset(url)
      .then((asset) => {
        if (!this.disposed) this.assets.set(url, asset);
        this.assetPromises.delete(url);
        return asset;
      })
      .catch((error) => {
        this.assetPromises.delete(url);
        console.warn("[SwingSphere vector activity border]", error);
        return null;
      });
    this.assetPromises.set(url, promise);
    return promise;
  }

  #buildCountry(key, source, sourceType = "hybrid", hybridStatus = null) {
    const country = { key, lines: [], hoverMix: 0, selectedMix: 0, sourceType, hybridStatus };
    const maxShorelineSnapDegrees = THREE.MathUtils.clamp(
      Number(this.options.maxShorelineSnapDegrees ?? this.config.countryVectorBorders?.maxShorelineSnapDegrees ?? 5),
      0.25,
      12
    );
    const shorelineSnapEnabled = this.experimentalPhysicalCoastlineSnap
      && this.options.shorelineSnap !== false
      && this.shorelinePaths.length > 0
      && !this.shorelineSnapExcludedCountryKeys.has(String(key).trim().toUpperCase());
    const hybridRings = buildHybridControlRings(source);
    const rings = sourceType === "geojson-fallback"
      ? buildGeoJsonControlRings(source)
      : this.experimentalPhysicalCoastlineSnap
        ? hybridRings
            .map((ring) => compensateHybridCoastlineControls(ring, this.config))
            .map((ring) => shorelineSnapEnabled
              ? snapHybridCoastlineControlsToPhysical(ring, this.shorelinePaths, this.config, maxShorelineSnapDegrees)
              : ring)
        : hybridRings;
    for (const ring of rings) {
      const anchoredControls = ring.map((control) => this.#anchorControl(control));
      const regularizedControls = regularizeCoastalControlRadii(anchoredControls);
      const renderedPoints = buildStraightPreservingPath(regularizedControls, this.maxStepDegrees, (control) => this.#anchorControl(control));
      if (renderedPoints.length < 2) continue;
      const positions = [];
      const latitudes = [];
      for (const point of renderedPoints) {
        positions.push(point.position.x, point.position.y, point.position.z);
        latitudes.push(point.lat);
      }
      const minLat = Math.min(...latitudes);
      const maxLat = Math.max(...latitudes);
      const span = Math.max(0.001, maxLat - minLat);
      const normalizedLat = latitudes.map((lat) => (lat - minLat) / span);
      const coreGeometry = new LineGeometry();
      coreGeometry.setPositions(positions);
      coreGeometry.setColors(flatColorArray(renderedPoints.length, this.settings.idle.coreColor));
      const glowGeometry = new LineGeometry();
      glowGeometry.setPositions(positions);
      glowGeometry.setColors(flatColorArray(renderedPoints.length, this.settings.idle.glowColor));
      const coreMaterial = createMaterial({
        width: this.settings.idle.coreWidth,
        opacity: this.settings.idle.coreOpacity,
        blending: THREE.NormalBlending
      });
      const glowMaterial = createMaterial({
        width: this.settings.idle.glowWidth,
        opacity: this.settings.idle.glowOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const core = new Line2(coreGeometry, coreMaterial);
      const glow = new Line2(glowGeometry, glowMaterial);
      core.renderOrder = 27;
      glow.renderOrder = 26;
      this.group.add(glow, core);
      country.lines.push({ coreGeometry, glowGeometry, core, glow, coreMaterial, glowMaterial, normalizedLat, appliedStyleKey: null });
    }
    return country;
  }

  #anchorControl(control) {
    const localDirection = wgs84ToRenderedGlobeLocal(control.lng, control.lat, 1, this.config).normalize();
    const anchor = resolveLandSurfaceAnchorFromDirection({
      localDirection,
      globeRadius: this.renderer.globeRadius,
      landHitMesh: this.renderer.landHitMesh,
      raycaster: this.raycaster,
      origin: this.rayOrigin,
      direction: this.rayDirection,
      candidate: this.surfaceCandidate
    });
    return {
      ...control,
      direction: localDirection,
      position: anchor.anchorPosition.clone().addScaledVector(
        anchor.surfaceNormal ?? anchor.radialDirection ?? localDirection,
        BORDER_SURFACE_CLEARANCE
      )
    };
  }

  #applyVisibilityAndStaticStyles() {
    const idle = this.settings.idle;
    const hover = this.settings.hover;
    for (const [key, country] of this.countryGroups) {
      const selected = key === this.selectedKey;
      const hovered = key === this.hoveredKey && hover.enabled && !selected;
      const styleKey = selected ? "selected" : hovered ? "hover" : "idle";
      for (const line of country.lines) {
        if (line.appliedStyleKey === styleKey) continue;
        line.appliedStyleKey = styleKey;
        line.core.visible = hovered ? hover.coreVisible : idle.enabled && idle.coreVisible;
        line.glow.visible = hovered ? hover.glowVisible : idle.enabled && idle.glowVisible;
        line.coreMaterial.linewidth = hovered ? hover.coreWidth : idle.coreWidth;
        line.coreMaterial.opacity = hovered ? hover.coreOpacity : idle.coreOpacity;
        line.glowMaterial.linewidth = hovered ? hover.glowWidth : idle.glowWidth;
        line.glowMaterial.opacity = hovered ? hover.glowOpacity : idle.glowOpacity;
        line.coreGeometry.setColors(flatColorArray(line.normalizedLat.length, hovered ? hover.coreColor : idle.coreColor));
        line.glowGeometry.setColors(flatColorArray(line.normalizedLat.length, hovered ? hover.glowColor : idle.glowColor));
      }
    }
  }

  #updateHoverLine(line, elapsed) {
    const hover = this.settings.hover;
    if (!hover.sweepEnabled) return;
    if (this.hoverStartedAt == null) this.hoverStartedAt = elapsed;
    const localElapsed = Math.max(0, elapsed - this.hoverStartedAt);
    const raw = localElapsed * hover.sweepSpeed;
    const center = hover.sweepRepeat ? raw % 1.35 - 0.18 : Math.min(1.18, raw - 0.18);
    const base = new THREE.Color(hover.coreColor);
    const glowBase = new THREE.Color(hover.glowColor);
    const sweep = new THREE.Color(hover.sweepColor);
    const colors = [];
    const glowColors = [];
    for (const latitude of line.normalizedLat) {
      const distance = Math.abs(latitude - center);
      const amount = THREE.MathUtils.clamp(1 - distance / Math.max(0.01, hover.sweepWidth), 0, 1) * hover.sweepStrength;
      const color = base.clone().lerp(sweep, amount);
      const glowColor = glowBase.clone().lerp(sweep, amount * 0.75);
      colors.push(color.r, color.g, color.b);
      glowColors.push(glowColor.r, glowColor.g, glowColor.b);
    }
    line.coreGeometry.setColors(colors);
    line.glowGeometry.setColors(glowColors);
  }

  #resolveCountryKey(country) {
    const keys = countryKeys(country);
    const countries = this.manifest?.countries ?? {};
    for (const [iso3, entry] of Object.entries(countries)) {
      const aliases = new Set([iso3, ...(entry.aliases ?? [])].map((value) => String(value).trim().toUpperCase()));
      if (keys.some((key) => aliases.has(key))) return iso3;
    }
    return keys.find((key) => key.length === 3) ?? null;
  }

  #disposeCountry(country) {
    for (const line of country.lines) {
      this.group.remove(line.core, line.glow);
      line.coreGeometry.dispose();
      line.glowGeometry.dispose();
      line.coreMaterial.dispose();
      line.glowMaterial.dispose();
    }
  }
}

function dampTransition(current, target, delta, duration) {
  const lambda = 5 / Math.max(duration, 0.001);
  const next = THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * delta));
  return Math.abs(next - target) < 0.001 ? target : next;
}

function createMaterial({ width, opacity, blending, depthWrite = true }) {
  return new LineMaterial({
    linewidth: width,
    opacity,
    transparent: opacity < 1 || blending !== THREE.NormalBlending,
    vertexColors: true,
    worldUnits: false,
    blending,
    depthTest: true,
    depthWrite,
    dashed: false,
    alphaToCoverage: false
  });
}

function flatColorArray(count, colorValue) {
  const color = new THREE.Color(colorValue);
  const colors = [];
  for (let index = 0; index < count; index += 1) colors.push(color.r, color.g, color.b);
  return colors;
}

function buildGeoJsonControlRings(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];
  return polygons
    .map((polygon) => polygon?.[0])
    .filter((ring) => Array.isArray(ring) && ring.length >= 2)
    .map((ring) => ring.map((coordinate) => ({
      lng: Number(coordinate?.[0]),
      lat: Number(coordinate?.[1]),
      coastalToNext: false
    })).filter((control) => Number.isFinite(control.lng) && Number.isFinite(control.lat)))
    .filter((ring) => ring.length >= 2);
}

function buildHybridControlRings(asset) {
  const sourceRings = Array.isArray(asset?.rings) ? asset.rings.filter((ring) => ring?.presentation !== false) : [];
  return sourceRings.map((ring) => {
    const controls = [];
    const segments = Array.isArray(ring?.segments) ? ring.segments : [];
    for (const segment of segments) {
      const coordinates = Array.isArray(segment?.coordinates) ? segment.coordinates : [];
      const coastlinePathId = segment.kind === "coastline" ? (segment.sourcePathId ?? null) : null;
      for (let index = 0; index < coordinates.length - 1; index += 1) {
        const coordinate = coordinates[index];
        if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
        const previous = controls[controls.length - 1];
        const lng = Number(coordinate[0]);
        const lat = Number(coordinate[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        if (previous && Math.abs(previous.lng - lng) < 1e-9 && Math.abs(previous.lat - lat) < 1e-9) {
          previous.coastalToNext = segment.kind === "coastline";
          previous.coastlinePathIdToNext = coastlinePathId;
          continue;
        }
        controls.push({
          lng,
          lat,
          coastalToNext: segment.kind === "coastline",
          coastlinePathIdToNext: coastlinePathId
        });
      }
    }
    const lastSegment = segments[segments.length - 1];
    const lastCoordinate = lastSegment?.coordinates?.[lastSegment.coordinates.length - 1];
    if (Array.isArray(lastCoordinate) && lastCoordinate.length >= 2) {
      controls.push({
        lng: Number(lastCoordinate[0]),
        lat: Number(lastCoordinate[1]),
        coastalToNext: false,
        coastlinePathIdToNext: null
      });
    }
    return controls;
  }).filter((ring) => ring.length >= 2);
}

function buildStraightPreservingPath(controls, maxStepDegrees, anchorControl) {
  if (controls.length < 2) return [];
  const result = [controls[0]];
  for (let index = 1; index < controls.length; index += 1) {
    const start = controls[index - 1];
    const end = controls[index];
    const angleDegrees = THREE.MathUtils.radToDeg(start.direction.angleTo(end.direction));
    const divisions = Math.max(1, Math.ceil(angleDegrees / Math.max(0.08, maxStepDegrees)));
    for (let step = 1; step <= divisions; step += 1) {
      if (step === divisions) {
        result.push(end);
        continue;
      }
      const t = step / divisions;
      const interpolated = interpolateControl(start, end, t);
      if (start.coastalToNext) {
        const preservePhysicalChord = Boolean(start.physicalCoastline && end.physicalCoastline);
        const position = preservePhysicalChord
          ? start.position.clone().lerp(end.position, t)
          : interpolated.direction.clone().multiplyScalar(THREE.MathUtils.lerp(start.position.length(), end.position.length(), t));
        result.push({
          ...interpolated,
          direction: position.clone().normalize(),
          position,
          physicalCoastline: preservePhysicalChord,
          coastalToNext: true
        });
      } else {
        result.push(anchorControl(interpolated));
      }
    }
  }
  return result;
}

function interpolateControl(start, end, t) {
  const deltaLng = shortestLongitudeDelta(start.lng, end.lng);
  return {
    lng: wrapLongitude(start.lng + deltaLng * t),
    lat: THREE.MathUtils.lerp(start.lat, end.lat, t),
    direction: start.direction.clone().lerp(end.direction, t).normalize(),
    coastalToNext: Boolean(start.coastalToNext)
  };
}

function regularizeCoastalControlRadii(points) {
  const isClosed = points.length > 2 && points[0].direction.angleTo(points[points.length - 1].direction) < 1e-6;
  const uniqueCount = isClosed ? points.length - 1 : points.length;
  if (uniqueCount < 3) return points;
  let controls = points.slice(0, uniqueCount).map((point) => ({ ...point, position: point.position.clone() }));
  for (let pass = 0; pass < 2; pass += 1) {
    const previousPass = controls;
    controls = previousPass.map((point, index) => {
      const previous = previousPass[(index - 1 + uniqueCount) % uniqueCount];
      const next = previousPass[(index + 1) % uniqueCount];
      if (point.physicalCoastline || previous.physicalCoastline || next.physicalCoastline) return point;
      if (!previous.coastalToNext || !point.coastalToNext) return point;
      const previousSpan = previous.direction.angleTo(point.direction);
      const nextSpan = point.direction.angleTo(next.direction);
      const totalSpan = previousSpan + nextSpan;
      const interpolation = totalSpan > 1e-8 ? previousSpan / totalSpan : 0.5;
      const expectedRadius = THREE.MathUtils.lerp(previous.position.length(), next.position.length(), interpolation);
      const radius = point.position.length();
      if (Math.abs(radius - expectedRadius) <= 0.012) return point;
      return { ...point, position: point.direction.clone().multiplyScalar(expectedRadius) };
    });
  }
  if (isClosed) controls.push({ ...controls[0], position: controls[0].position.clone(), coastalToNext: false });
  return controls;
}

function shortestLongitudeDelta(start, end) {
  let delta = end - start;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

function wrapLongitude(value) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function countryKeys(country) {
  if (country == null) return [];
  if (typeof country === "string" || typeof country === "number") return [String(country).trim().toUpperCase()];
  return [country.iso3, country.iso2, country.id, country.name]
    .filter((value) => value != null && String(value).trim())
    .map((value) => String(value).trim().toUpperCase());
}

function fallbackFeatureKeys(feature) {
  const properties = feature?.properties ?? {};
  return [
    feature?.id,
    properties.ISO_A2,
    properties.ISO_A3,
    properties.iso_a2,
    properties.iso_a3,
    properties.ADM0_A3,
    properties.ADMIN,
    properties.name,
    properties.NAME
  ]
    .filter((value) => value != null && String(value).trim())
    .map((value) => String(value).trim().toUpperCase());
}

function normalizeAllowedStatuses(statuses) {
  if (!Array.isArray(statuses) || !statuses.length) return null;
  return new Set(statuses.map((status) => String(status).trim().toLowerCase()).filter(Boolean));
}

function sanitizeStyle(next, mode) {
  const result = { ...next };
  const numericRanges = mode === "idle"
    ? {
        coreWidth: [0.5, 10], coreOpacity: [0, 1], glowWidth: [2, 30], glowOpacity: [0, 0.8],
        pulseMin: [0, 1], pulseMax: [0, 2], pulseSpeed: [0, 2]
      }
    : {
        coreWidth: [0.5, 10], coreOpacity: [0, 1], glowWidth: [2, 30], glowOpacity: [0, 0.8],
        sweepWidth: [0.02, 1], sweepStrength: [0, 1.5], sweepSpeed: [0, 3]
      };
  for (const [key, [min, max]] of Object.entries(numericRanges)) {
    if (Number.isFinite(result[key])) result[key] = THREE.MathUtils.clamp(Number(result[key]), min, max);
  }
  return result;
}

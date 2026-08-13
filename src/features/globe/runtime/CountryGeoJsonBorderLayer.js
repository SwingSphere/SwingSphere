import * as THREE from "three";
import { loadJsonAsset } from "./jsonAssetCache.js";
import { sphericalShaderBody } from "./shaders/countryHighlightShader.js";

const DEFAULT_STATIC_WIDTH = 1024;
const DEFAULT_STATIC_HEIGHT = 512;
const DEFAULT_DYNAMIC_WIDTH = 2048;
const DEFAULT_DYNAMIC_HEIGHT = 1024;

export class CountryGeoJsonBorderLayer {
  constructor({ renderer, config, onDiagnostics = null }) {
    this.renderer = renderer;
    this.config = config;
    this.options = config.countryGeoJson ?? {};
    this.presentationGroups = normalizePresentationGroups(config.countryPresentationGroups);
    this.onDiagnostics = onDiagnostics;
    this.disposed = false;
    this.visible = this.options.visible !== false;
    this.diagnosticMode = Boolean(this.options.diagnosticMode);
    this.featuresByKey = new Map();
    this.hoveredKey = null;
    this.selectedKey = null;
    this.renderedHoverKeys = [];
    this.renderedSelectedKeys = [];
    this.hoverTransition = 0;
    this.hoverTransitionTarget = 0;
    this.selectedTransition = 0;
    this.selectedTransitionTarget = 0;
    this.lastTransitionElapsed = null;
    this.activityKeys = new Set();
    this.requestedActivityCountries = [];
    this.hybridManifest = null;
    this.hybridAssets = new Map();
    this.hybridAssetPromises = new Map();
    this.features = [];
    this.matchedFeature = null;
    this.alignment = {
      longitudeOffsetDeg: Number(this.options.longitudeOffsetDeg ?? 0),
      latitudeOffsetDeg: Number(this.options.latitudeOffsetDeg ?? 0),
      scale: Number(this.options.scale ?? 1)
    };

    const staticWidth = Math.max(1024, Number(this.options.staticTextureWidth ?? this.options.textureWidth ?? DEFAULT_STATIC_WIDTH));
    const staticHeight = Math.max(512, Number(this.options.staticTextureHeight ?? this.options.textureHeight ?? DEFAULT_STATIC_HEIGHT));
    const dynamicWidth = Math.max(512, Number(this.options.dynamicTextureWidth ?? DEFAULT_DYNAMIC_WIDTH));
    const dynamicHeight = Math.max(256, Number(this.options.dynamicTextureHeight ?? DEFAULT_DYNAMIC_HEIGHT));
    this.baseCanvas = createCanvas(staticWidth, staticHeight);
    this.activeCanvas = createCanvas(dynamicWidth, dynamicHeight);
    this.fillCanvas = createCanvas(dynamicWidth, dynamicHeight);
    this.activityCanvas = createCanvas(dynamicWidth, dynamicHeight);
    this.baseTexture = createCanvasTexture(this.baseCanvas);
    this.activeTexture = createCanvasTexture(this.activeCanvas);
    this.fillTexture = createCanvasTexture(this.fillCanvas);
    this.activityTexture = createCanvasTexture(this.activityCanvas);
    this.uniforms = createUniforms(this.baseTexture, this.activeTexture, this.fillTexture, this.activityTexture, config, this.options);
    this.#applyAlignmentUniforms();
    this.uniforms.countryGeoJsonEnabled.value = this.visible ? 1 : 0;
    this.uniforms.countryGeoJsonDiagnosticMode.value = this.diagnosticMode ? 1 : 0;
    this.#installOnLandMaterial();
  }

  async mount() {
    const url = this.options.url;
    if (!url || this.disposed) return;
    const data = await loadJsonAsset(url);
    if (this.disposed) return;
    this.#buildMasks(data);

    const manifestUrl = this.config.hybridCountryBorders?.manifestUrl;
    if (manifestUrl) {
      this.hybridManifest = await loadJsonAsset(manifestUrl);
      if (this.disposed) return;
      this.#resolveActivityCountries();
      if (this.hoveredKey) this.#ensureHybridAsset(this.hoveredKey);
      if (this.selectedKey) this.#ensureHybridAsset(this.selectedKey);
    }
  }

  update(elapsed = 0) {
    this.uniforms.countryGeoJsonTime.value = elapsed;
    const delta = this.lastTransitionElapsed == null ? 0 : Math.max(0, Math.min(0.1, elapsed - this.lastTransitionElapsed));
    this.lastTransitionElapsed = elapsed;
    if (delta <= 0) return;

    const reducedMotion = Boolean(this.config.motion?.reduced);
    const hoverDuration = reducedMotion ? 0 : Math.max(0.08, Number(this.options.hoverTransitionSeconds ?? 0.22));
    const selectedDuration = reducedMotion ? 0 : Math.max(0.1, Number(this.options.selectedTransitionSeconds ?? 0.34));
    this.hoverTransition = reducedMotion
      ? this.hoverTransitionTarget
      : dampTransition(this.hoverTransition, this.hoverTransitionTarget, delta, hoverDuration);
    this.selectedTransition = reducedMotion
      ? this.selectedTransitionTarget
      : dampTransition(this.selectedTransition, this.selectedTransitionTarget, delta, selectedDuration);
    this.uniforms.countryGeoJsonHoverTransition.value = this.hoverTransition;
    this.uniforms.countryGeoJsonSelectedTransition.value = this.selectedTransition;

    let redraw = false;
    if (this.hoverTransitionTarget === 0 && this.hoverTransition < 0.002 && this.renderedHoverKeys.length) {
      this.renderedHoverKeys = [];
      redraw = true;
    }
    if (this.selectedTransitionTarget === 0 && this.selectedTransition < 0.002 && this.renderedSelectedKeys.length) {
      this.renderedSelectedKeys = [];
      redraw = true;
    }
    if (redraw) this.#redrawActiveMask();
  }

  setHoveredCountry(country) {
    const match = this.#findFeature(country);
    const next = match?.key ?? null;
    const nextPresentationKeys = next ? this.#presentationKeys(next) : [];
    const samePresentation = sameStringArray(nextPresentationKeys, this.renderedHoverKeys);
    if (next === this.hoveredKey && samePresentation) return;
    this.hoveredKey = next;
    this.matchedFeature = match ? describeFeature(match.feature, match.key) : null;
    if (next) {
      this.renderedHoverKeys = nextPresentationKeys;
      this.hoverTransitionTarget = 1;
      if (!samePresentation) {
        this.hoverTransition = 0;
        if (!this.#isPresentationGrouped(next)) this.#ensureHybridAsset(next);
        this.#redrawActiveMask();
      }
    } else {
      this.hoverTransitionTarget = 0;
    }
    this.#emitDiagnostics();
  }

  setSelectedCountry(country) {
    const match = this.#findFeature(country);
    const next = match?.key ?? null;
    const nextPresentationKeys = next ? this.#presentationKeys(next) : [];
    const samePresentation = sameStringArray(nextPresentationKeys, this.renderedSelectedKeys);
    if (next === this.selectedKey && samePresentation) return;
    this.selectedKey = next;
    this.matchedFeature = match ? describeFeature(match.feature, match.key) : null;
    if (next) {
      this.renderedSelectedKeys = nextPresentationKeys;
      this.selectedTransitionTarget = 1;
      if (!samePresentation) {
        this.selectedTransition = 0;
        if (!this.#isPresentationGrouped(next)) this.#ensureHybridAsset(next);
        this.#redrawActiveMask();
      }
    } else {
      this.selectedTransitionTarget = 0;
    }
    this.#emitDiagnostics();
  }

  setActivityCountries(countries = []) {
    this.requestedActivityCountries = Array.isArray(countries) ? [...countries] : [];
    this.#resolveActivityCountries();
  }

  setVisible(visible) {
    this.visible = Boolean(visible);
    this.uniforms.countryGeoJsonEnabled.value = this.visible ? 1 : 0;
    this.#emitDiagnostics();
  }

  setDiagnosticMode(enabled) {
    this.diagnosticMode = Boolean(enabled);
    this.uniforms.countryGeoJsonDiagnosticMode.value = this.diagnosticMode ? 1 : 0;
    this.#emitDiagnostics();
  }

  updateAlignment({ longitudeOffsetDeg, latitudeOffsetDeg, scale } = {}) {
    if (Number.isFinite(longitudeOffsetDeg)) this.alignment.longitudeOffsetDeg = longitudeOffsetDeg;
    if (Number.isFinite(latitudeOffsetDeg)) this.alignment.latitudeOffsetDeg = latitudeOffsetDeg;
    if (Number.isFinite(scale)) this.alignment.scale = THREE.MathUtils.clamp(scale, 0.9, 1.1);
    this.#applyAlignmentUniforms();
    this.#emitDiagnostics();
  }

  updateStateStyles({ baseOpacity, activityRasterWidth, activityBorderOpacity, activityFillOpacity, hoverRasterWidth, hoverBorderOpacity, hoverFillOpacity } = {}) {
    if (Number.isFinite(baseOpacity)) this.uniforms.countryGeoJsonBaseOpacity.value = THREE.MathUtils.clamp(baseOpacity, 0, 1);
    if (Number.isFinite(activityRasterWidth)) this.options.activityRasterWidth = THREE.MathUtils.clamp(activityRasterWidth, 0.5, 8);
    if (Number.isFinite(hoverRasterWidth)) this.options.hoverRasterWidth = THREE.MathUtils.clamp(hoverRasterWidth, 0.5, 8);
    if (Number.isFinite(activityBorderOpacity)) this.uniforms.countryGeoJsonActivityBorderOpacity.value = THREE.MathUtils.clamp(activityBorderOpacity, 0, 1);
    if (Number.isFinite(activityFillOpacity)) this.uniforms.countryGeoJsonActivityFillOpacity.value = THREE.MathUtils.clamp(activityFillOpacity, 0, 1);
    if (Number.isFinite(hoverBorderOpacity)) this.uniforms.countryGeoJsonHoverBorderOpacity.value = THREE.MathUtils.clamp(hoverBorderOpacity, 0, 1);
    if (Number.isFinite(hoverFillOpacity)) this.uniforms.countryGeoJsonHoverFillOpacity.value = THREE.MathUtils.clamp(hoverFillOpacity, 0, 1);
    if (Number.isFinite(activityRasterWidth)) this.#redrawActivityMask();
    if (Number.isFinite(hoverRasterWidth)) this.#redrawActiveMask();
    this.#emitDiagnostics();
  }

  updateGlow({ enabled, coreThickness, hazeWidth, hazeStrength, color } = {}) {
    if (typeof enabled === "boolean") this.uniforms.countryGeoJsonGlowEnabled.value = enabled ? 1 : 0;
    if (Number.isFinite(coreThickness)) {
      this.uniforms.countryGeoJsonGlowCoreThickness.value = THREE.MathUtils.clamp(coreThickness, 0.5, 4);
    }
    if (Number.isFinite(hazeWidth)) {
      this.uniforms.countryGeoJsonGlowHazeWidth.value = THREE.MathUtils.clamp(hazeWidth, 1, 12);
    }
    if (Number.isFinite(hazeStrength)) {
      this.uniforms.countryGeoJsonGlowHazeStrength.value = THREE.MathUtils.clamp(hazeStrength, 0, 1.5);
    }
    if (typeof color === "string") this.uniforms.countryGeoJsonGlowColor.value.set(color);
    this.#emitDiagnostics();
  }

  getDiagnostics() {
    return {
      featureCount: this.features.length,
      maskNontransparentPixelCount: this.maskNontransparentPixelCount ?? 0,
      selectedCountryKey: this.selectedKey,
      hoveredCountryKey: this.hoveredKey,
      activityCountryCount: this.activityKeys.size,
      matchedFeature: this.matchedFeature,
      textureWidth: this.baseCanvas.width,
      textureHeight: this.baseCanvas.height,
      dynamicTextureWidth: this.activeCanvas.width,
      dynamicTextureHeight: this.activeCanvas.height,
      flipY: this.baseTexture.flipY,
      longitudeSign: this.config.alignment.longitudeSign,
      longitudeOffsetDeg: this.alignment.longitudeOffsetDeg,
      latitudeOffsetDeg: this.alignment.latitudeOffsetDeg,
      scale: this.alignment.scale,
      visible: this.visible,
      diagnosticMode: this.diagnosticMode,
      renderOwner: this.renderer.visibleLandMesh?.name || "land.glb visible land mesh"
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const material = this.renderer.landMaterial;
    if (material) {
      material.onBeforeCompile = this.previousOnBeforeCompile;
      material.customProgramCacheKey = this.previousProgramCacheKey;
      delete material.userData.countryGeoJson;
      material.needsUpdate = true;
    }
    this.baseTexture.dispose();
    this.activeTexture.dispose();
    this.fillTexture.dispose();
    this.activityTexture.dispose();
    this.featuresByKey.clear();
    this.hybridAssets.clear();
    this.hybridAssetPromises.clear();
  }

  #installOnLandMaterial() {
    const material = this.renderer.landMaterial;
    if (!material) throw new Error("GeoJSON country masks require the visible land material.");
    this.previousOnBeforeCompile = material.onBeforeCompile;
    this.previousProgramCacheKey = material.customProgramCacheKey;
    const previousCompile = this.previousOnBeforeCompile;
    const previousCacheKey = this.previousProgramCacheKey.bind(material);
    const uniforms = this.uniforms;

    material.userData.countryGeoJson = { uniforms };
    material.onBeforeCompile = (shader, webglRenderer) => {
      previousCompile?.call(material, shader, webglRenderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>\n      varying vec3 vCountryGeoJsonLocalPosition;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>\n      vCountryGeoJsonLocalPosition = position;`
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
      uniform sampler2D countryGeoJsonBaseMap;
      uniform sampler2D countryGeoJsonActiveMap;
      uniform sampler2D countryGeoJsonFillMap;
      uniform sampler2D countryGeoJsonActivityMap;
      uniform vec3 countryGeoJsonBaseColor;
      uniform vec3 countryGeoJsonActivityColor;
      uniform vec3 countryGeoJsonActiveColor;
      uniform float countryGeoJsonEnabled;
      uniform float countryGeoJsonBaseOpacity;
      uniform float countryGeoJsonHoverBorderOpacity;
      uniform float countryGeoJsonSelectedBorderOpacity;
      uniform float countryGeoJsonHoverFillOpacity;
      uniform float countryGeoJsonSelectedFillOpacity;
      uniform float countryGeoJsonHoverTransition;
      uniform float countryGeoJsonSelectedTransition;
      uniform float countryGeoJsonActivityBorderOpacity;
      uniform float countryGeoJsonActivityFillOpacity;
      uniform float countryGeoJsonUvScale;
      uniform float countryGeoJsonTime;
      uniform float countryGeoJsonDiagnosticMode;
      uniform float countryGeoJsonGlowEnabled;
      uniform float countryGeoJsonGlowCoreThickness;
      uniform float countryGeoJsonGlowHazeWidth;
      uniform float countryGeoJsonGlowHazeStrength;
      uniform vec3 countryGeoJsonGlowColor;
      uniform vec2 countryGeoJsonBaseTexelSize;
      varying vec3 vCountryGeoJsonLocalPosition;
      ${sphericalShaderBody()}`
        )
        .replace(
          "#include <opaque_fragment>",
          `if (countryGeoJsonEnabled > 0.5) {
        vec2 countryUv = sphericalUv(vCountryGeoJsonLocalPosition);
        countryUv = (countryUv - 0.5) / max(countryGeoJsonUvScale, 0.001) + 0.5;
        countryUv.x = fract(countryUv.x);
        if (countryUv.y >= 0.0 && countryUv.y <= 1.0) {
          float countryBaseSample = texture2D(countryGeoJsonBaseMap, countryUv).r;
          float countryBaseBorder = smoothstep(0.28, 0.72, countryBaseSample);
          vec2 countryActiveBorderSample = texture2D(countryGeoJsonActiveMap, countryUv).rg;
          vec2 countryActiveBorder = smoothstep(vec2(0.24), vec2(0.76), countryActiveBorderSample);
          vec2 countryActiveFill = texture2D(countryGeoJsonFillMap, countryUv).rg;
          countryActiveBorder *= vec2(countryGeoJsonHoverTransition, countryGeoJsonSelectedTransition);
          countryActiveFill *= vec2(countryGeoJsonHoverTransition, countryGeoJsonSelectedTransition);
          vec2 countryActivitySample = texture2D(countryGeoJsonActivityMap, countryUv).rg;
          float countryActivityBorder = smoothstep(0.24, 0.76, countryActivitySample.r);
          float countryActivityFill = countryActivitySample.g;
          float countryPulse = 0.88 + 0.12 * sin(countryGeoJsonTime * 3.2);
          float activeInteractionMask = clamp(max(max(countryActiveBorder.r, countryActiveBorder.g), max(countryActiveFill.r, countryActiveFill.g)), 0.0, 1.0);
          float countryActivityPulse = 0.9 + 0.1 * sin(countryGeoJsonTime * 0.72);
          float countryActivityVisibility = 1.0 - activeInteractionMask;
          if (countryGeoJsonDiagnosticMode > 0.5) {
            float countryDiagnosticMask = max(countryBaseBorder, max(countryActivityBorder, max(max(countryActiveBorder.r, countryActiveBorder.g), max(countryActiveFill.r, countryActiveFill.g))));
            outgoingLight = mix(outgoingLight, vec3(0.1, 1.0, 0.25), countryDiagnosticMask);
          } else {
            outgoingLight = mix(outgoingLight, countryGeoJsonActivityColor, clamp(countryActivityFill * countryGeoJsonActivityFillOpacity * countryActivityPulse * countryActivityVisibility, 0.0, 0.35));
            outgoingLight = mix(outgoingLight, countryGeoJsonActiveColor, clamp(countryActiveFill.r * countryGeoJsonHoverFillOpacity + countryActiveFill.g * countryGeoJsonSelectedFillOpacity * countryPulse, 0.0, 0.72));
            outgoingLight += countryGeoJsonActivityColor
              * clamp(countryActivityBorder * countryGeoJsonActivityBorderOpacity * countryActivityPulse * countryActivityVisibility, 0.0, 1.0);
            outgoingLight += mix(countryGeoJsonBaseColor, countryGeoJsonActiveColor, max(countryActiveBorder.r, countryActiveBorder.g))
              * clamp(countryBaseBorder * countryGeoJsonBaseOpacity + countryActiveBorder.r * countryGeoJsonHoverBorderOpacity + countryActiveBorder.g * countryGeoJsonSelectedBorderOpacity * countryPulse, 0.0, 1.0);

            if (countryGeoJsonGlowEnabled > 0.5) {
              vec2 coreStep = countryGeoJsonBaseTexelSize * countryGeoJsonGlowCoreThickness;
              vec2 hazeStep = countryGeoJsonBaseTexelSize * countryGeoJsonGlowHazeWidth;
              float coreNeighbors = 0.0;
              float hazeNeighbors = 0.0;
              coreNeighbors = max(coreNeighbors, texture2D(countryGeoJsonBaseMap, countryUv + vec2(coreStep.x, 0.0)).r);
              coreNeighbors = max(coreNeighbors, texture2D(countryGeoJsonBaseMap, countryUv - vec2(coreStep.x, 0.0)).r);
              coreNeighbors = max(coreNeighbors, texture2D(countryGeoJsonBaseMap, countryUv + vec2(0.0, coreStep.y)).r);
              coreNeighbors = max(coreNeighbors, texture2D(countryGeoJsonBaseMap, countryUv - vec2(0.0, coreStep.y)).r);
              hazeNeighbors = max(hazeNeighbors, texture2D(countryGeoJsonBaseMap, countryUv + vec2(hazeStep.x, 0.0)).r);
              hazeNeighbors = max(hazeNeighbors, texture2D(countryGeoJsonBaseMap, countryUv - vec2(hazeStep.x, 0.0)).r);
              hazeNeighbors = max(hazeNeighbors, texture2D(countryGeoJsonBaseMap, countryUv + vec2(0.0, hazeStep.y)).r);
              hazeNeighbors = max(hazeNeighbors, texture2D(countryGeoJsonBaseMap, countryUv - vec2(0.0, hazeStep.y)).r);
              hazeNeighbors = max(hazeNeighbors, texture2D(countryGeoJsonBaseMap, countryUv + hazeStep).r);
              hazeNeighbors = max(hazeNeighbors, texture2D(countryGeoJsonBaseMap, countryUv - hazeStep).r);
              hazeNeighbors = max(hazeNeighbors, texture2D(countryGeoJsonBaseMap, countryUv + vec2(hazeStep.x, -hazeStep.y)).r);
              hazeNeighbors = max(hazeNeighbors, texture2D(countryGeoJsonBaseMap, countryUv + vec2(-hazeStep.x, hazeStep.y)).r);
              float glowCore = smoothstep(0.18, 0.74, max(countryBaseSample, coreNeighbors));
              float glowHaze = smoothstep(0.08, 0.62, hazeNeighbors);
              float smokyPulse = 0.9 + 0.1 * sin(countryGeoJsonTime * 0.55 + countryUv.x * 31.0 + countryUv.y * 19.0);
              float innerGlow = max(glowCore - countryBaseBorder, 0.0) * 0.26;
              float outerHaze = max(glowHaze - glowCore, 0.0) * countryGeoJsonGlowHazeStrength * 0.16 * smokyPulse;
              outgoingLight += countryGeoJsonGlowColor * (innerGlow + outerHaze);
            }
          }
        }
      }
      #include <opaque_fragment>`
        );
    };
    material.customProgramCacheKey = () => `${previousCacheKey()}|country-geojson-land-mask-v3`;
    material.needsUpdate = true;
  }

  #applyAlignmentUniforms() {
    const alignment = this.config.alignment;
    this.uniforms.longitudeOffset.value = THREE.MathUtils.degToRad(
      Number(alignment.longitudeOffsetDeg ?? 0) + this.alignment.longitudeOffsetDeg
    );
    this.uniforms.latitudeOffset.value = THREE.MathUtils.degToRad(
      Number(alignment.latitudeOffsetDeg ?? 0) + this.alignment.latitudeOffsetDeg
    );
    this.uniforms.longitudeSign.value = Number(alignment.longitudeSign ?? -1);
    this.uniforms.flipU.value = alignment.flipU ? 1 : 0;
    this.uniforms.flipV.value = alignment.flipV ? 1 : 0;
    this.uniforms.countryGeoJsonUvScale.value = this.alignment.scale;
  }

  #buildMasks(featureCollection) {
    const features = Array.isArray(featureCollection?.features) ? featureCollection.features : [];
    this.features = features;
    for (const feature of features) {
      for (const key of featureKeys(feature)) {
        if (!this.featuresByKey.has(key)) this.featuresByKey.set(key, feature);
      }
    }

    this.boundarySegmentCounts = buildBoundarySegmentCounts(features, this.options);
    this.#resolveActivityCountries(false);
    const context = this.baseCanvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
    context.strokeStyle = "rgba(255,255,255,1)";
    context.lineWidth = Number(this.options.baseRasterWidth ?? 1);
    context.lineJoin = "round";
    context.lineCap = "round";
    for (const feature of features) {
      drawFeatureBorders(context, feature, this.baseCanvas, this.options, this.boundarySegmentCounts, true);
    }
    this.maskNontransparentPixelCount = countNontransparentPixels(context, this.baseCanvas);
    this.baseTexture.needsUpdate = true;
    this.#redrawActivityMask();
    this.#redrawActiveMask();
    this.#emitDiagnostics();
  }

  #findFeature(country) {
    for (const key of countryKeys(country)) {
      const feature = this.featuresByKey.get(key);
      if (feature) return { key, feature };
    }
    return null;
  }

  #presentationGroup(country) {
    const keys = new Set(countryKeys(country));
    return this.presentationGroups.find((group) => group.members.some((member) => keys.has(member))) ?? null;
  }

  #isPresentationGrouped(country) {
    return Boolean(this.#presentationGroup(country));
  }

  #presentationKeys(country) {
    const group = this.#presentationGroup(country);
    if (!group) {
      const match = this.#findFeature(country);
      return match?.key ? [match.key] : [];
    }
    return group.members.filter((member) => this.featuresByKey.has(member));
  }

  #resolveActivityCountries(redraw = true) {
    const next = new Set();
    for (const country of this.requestedActivityCountries) {
      const match = this.#findFeature(country);
      if (!match?.key) continue;
      const presentationKeys = this.#presentationKeys(match.key);
      for (const key of presentationKeys) next.add(key);
      if (!this.#isPresentationGrouped(match.key)) this.#ensureHybridAsset(match.key);
    }
    const unchanged = next.size === this.activityKeys.size && [...next].every((key) => this.activityKeys.has(key));
    if (!unchanged) this.activityKeys = next;
    if (redraw && (!unchanged || this.hybridManifest)) {
      this.#redrawActivityMask();
      this.#emitDiagnostics();
    }
  }

  #findHybridEntry(country) {
    const countries = this.hybridManifest?.countries;
    if (!countries) return null;
    const keys = new Set(countryKeys(country));
    const feature = this.featuresByKey.get(String(country).trim().toUpperCase());
    for (const key of featureKeys(feature)) keys.add(key);
    for (const [iso3, entry] of Object.entries(countries)) {
      const aliases = [iso3, ...(entry.aliases ?? [])].map((value) => String(value).trim().toUpperCase());
      if (aliases.some((alias) => keys.has(alias))) return entry;
    }
    return null;
  }

  #ensureHybridAsset(country) {
    const entry = this.#findHybridEntry(country);
    if (!entry?.url || this.hybridAssets.has(entry.url) || this.hybridAssetPromises.has(entry.url)) return;
    const promise = loadJsonAsset(entry.url)
      .then((asset) => {
        this.hybridAssetPromises.delete(entry.url);
        if (this.disposed) return asset;
        this.hybridAssets.set(entry.url, asset);
        this.#redrawActivityMask();
        this.#redrawActiveMask();
        this.#emitDiagnostics();
        return asset;
      })
      .catch((error) => {
        this.hybridAssetPromises.delete(entry.url);
        console.warn("[SwingSphere corrected border mask]", error);
      });
    this.hybridAssetPromises.set(entry.url, promise);
  }

  #drawCorrectedBorder(context, country, feature, canvas) {
    const entry = this.#findHybridEntry(country);
    const asset = entry?.url ? this.hybridAssets.get(entry.url) : null;
    const rings = Array.isArray(asset?.runtimeRings) ? asset.runtimeRings : [];
    if (rings.length) {
      drawCoordinateRings(context, rings, canvas);
      return true;
    }
    drawFeatureBorders(context, feature, canvas, this.options, this.boundarySegmentCounts, false);
    return false;
  }

  #drawCorrectedFill(context, country, feature, canvas) {
    const entry = this.#findHybridEntry(country);
    const asset = entry?.url ? this.hybridAssets.get(entry.url) : null;
    const rings = Array.isArray(asset?.runtimeRings) ? asset.runtimeRings : [];
    if (rings.length) {
      fillCoordinateRings(context, rings, canvas);
      return true;
    }
    fillFeature(context, feature, canvas, this.options);
    return false;
  }

  #redrawActivityMask() {
    const context = this.activityCanvas.getContext("2d");
    context.clearRect(0, 0, this.activityCanvas.width, this.activityCanvas.height);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.strokeStyle = "rgba(255,0,0,1)";
    context.fillStyle = "rgba(0,255,0,1)";
    context.lineWidth = Number(this.options.activityRasterWidth ?? 1.5);
    for (const key of this.activityKeys) {
      const feature = this.featuresByKey.get(key);
      if (!feature) continue;
      if (this.#isPresentationGrouped(key)) {
        fillFeature(context, feature, this.activityCanvas, this.options);
        continue;
      }
      this.#drawCorrectedBorder(context, key, feature, this.activityCanvas);
      this.#drawCorrectedFill(context, key, feature, this.activityCanvas);
    }
    this.activityTexture.needsUpdate = true;
  }

  #redrawActiveMask() {
    const borderContext = this.activeCanvas.getContext("2d");
    const fillContext = this.fillCanvas.getContext("2d");
    borderContext.clearRect(0, 0, this.activeCanvas.width, this.activeCanvas.height);
    fillContext.clearRect(0, 0, this.fillCanvas.width, this.fillCanvas.height);
    borderContext.lineJoin = "round";
    borderContext.lineCap = "round";

    const selectedKeys = new Set(this.renderedSelectedKeys);
    if (this.renderedHoverKeys.length) {
      borderContext.strokeStyle = "rgba(255,0,0,1)";
      borderContext.lineWidth = Number(this.options.hoverRasterWidth ?? 1.25);
      fillContext.fillStyle = "rgba(255,0,0,1)";
      for (const key of this.renderedHoverKeys) {
        if (selectedKeys.has(key)) continue;
        const feature = this.featuresByKey.get(key);
        if (!feature) continue;
        if (this.#isPresentationGrouped(key)) {
          fillFeature(fillContext, feature, this.fillCanvas, this.options);
        } else {
          this.#drawCorrectedBorder(borderContext, key, feature, this.activeCanvas);
          this.#drawCorrectedFill(fillContext, key, feature, this.fillCanvas);
        }
      }
    }
    if (this.renderedSelectedKeys.length) {
      fillContext.fillStyle = "rgba(0,255,0,1)";
      for (const key of this.renderedSelectedKeys) {
        const feature = this.featuresByKey.get(key);
        if (!feature) continue;
        if (this.#isPresentationGrouped(key)) fillFeature(fillContext, feature, this.fillCanvas, this.options);
        else this.#drawCorrectedFill(fillContext, key, feature, this.fillCanvas);
      }
    }
    this.activeTexture.needsUpdate = true;
    this.fillTexture.needsUpdate = true;
  }

  #emitDiagnostics() {
    const diagnostics = this.getDiagnostics();
    this.onDiagnostics?.(diagnostics);
    if (this.options.logDiagnostics) console.info("[SwingSphere GeoJSON land masks]", diagnostics);
  }
}

function dampTransition(current, target, delta, duration) {
  const lambda = 5 / Math.max(duration, 0.001);
  const next = THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * delta));
  return Math.abs(next - target) < 0.001 ? target : next;
}

function createUniforms(baseTexture, activeTexture, fillTexture, activityTexture, config, options) {
  return {
    countryGeoJsonBaseMap: { value: baseTexture },
    countryGeoJsonActiveMap: { value: activeTexture },
    countryGeoJsonFillMap: { value: fillTexture },
    countryGeoJsonActivityMap: { value: activityTexture },
    countryGeoJsonBaseColor: { value: new THREE.Color(options.baseColor ?? "#7e303d") },
    countryGeoJsonActivityColor: { value: new THREE.Color(options.activityColor ?? "#d9dde2") },
    countryGeoJsonActiveColor: { value: new THREE.Color(options.selectedColor ?? config.colors.accent) },
    countryGeoJsonEnabled: { value: 1 },
    countryGeoJsonBaseOpacity: { value: Number(options.baseOpacity ?? 0.2) },
    countryGeoJsonHoverBorderOpacity: { value: Number(options.hoverBorderOpacity ?? 0.46) },
    countryGeoJsonSelectedBorderOpacity: { value: Number(options.selectedBorderOpacity ?? 0.78) },
    countryGeoJsonHoverFillOpacity: { value: Number(options.hoverFillOpacity ?? 0.2) },
    countryGeoJsonSelectedFillOpacity: { value: Number(options.selectedFillOpacity ?? 0.36) },
    countryGeoJsonHoverTransition: { value: 0 },
    countryGeoJsonSelectedTransition: { value: 0 },
    countryGeoJsonActivityBorderOpacity: { value: Number(options.activityBorderOpacity ?? 0.3) },
    countryGeoJsonActivityFillOpacity: { value: Number(options.activityFillOpacity ?? 0.08) },
    countryGeoJsonUvScale: { value: Number(options.scale ?? 1) },
    countryGeoJsonTime: { value: 0 },
    countryGeoJsonDiagnosticMode: { value: 0 },
    countryGeoJsonGlowEnabled: { value: options.glowEnabled ? 1 : 0 },
    countryGeoJsonGlowCoreThickness: { value: Number(options.glowCoreThickness ?? 1.25) },
    countryGeoJsonGlowHazeWidth: { value: Number(options.glowHazeWidth ?? 5) },
    countryGeoJsonGlowHazeStrength: { value: Number(options.glowHazeStrength ?? 0.55) },
    countryGeoJsonGlowColor: { value: new THREE.Color(options.glowColor ?? config.colors.accent) },
    countryGeoJsonBaseTexelSize: { value: new THREE.Vector2(1 / baseTexture.image.width, 1 / baseTexture.image.height) },
    longitudeOffset: { value: THREE.MathUtils.degToRad(config.alignment.longitudeOffsetDeg) },
    latitudeOffset: { value: THREE.MathUtils.degToRad(config.alignment.latitudeOffsetDeg) },
    longitudeSign: { value: config.alignment.longitudeSign },
    flipU: { value: config.alignment.flipU ? 1 : 0 },
    flipV: { value: config.alignment.flipV ? 1 : 0 }
  };
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createCanvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

function drawFeatureBorders(context, feature, canvas, options, segmentCounts = null, sharedOnly = false) {
  for (const polygon of featurePolygons(feature, options)) {
    for (const ring of polygon) {
      const quantized = quantizeRing(ring, Math.max(0, Number(options.quantizeStepDeg ?? 0.35)));
      const visibleSegments = filterBoundarySegments(quantized, segmentCounts, sharedOnly);
      for (const segment of visibleSegments) {
        const simplified = simplifyRdp(segment, Math.max(0, Number(options.simplifyStepDeg ?? 0.7)));
        const projected = projectCoordinates(simplified, canvas);
        for (const shifted of wrapProjectedRing(projected, canvas.width)) drawProjectedStroke(context, shifted);
      }
    }
  }
}

function drawCoordinateRings(context, rings, canvas) {
  for (const coordinates of rings) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const projected = projectCoordinates(coordinates, canvas);
    for (const shifted of wrapProjectedRing(projected, canvas.width)) drawProjectedStroke(context, shifted);
  }
}

function fillCoordinateRings(context, rings, canvas) {
  const projectedRings = rings
    .filter((coordinates) => Array.isArray(coordinates) && coordinates.length >= 3)
    .map((coordinates) => projectCoordinates(coordinates, canvas))
    .filter((ring) => ring.length >= 3);
  if (!projectedRings.length) return;
  const referenceX = projectedRings[0][0][0];
  const alignedRings = projectedRings.map((ring) => alignRingToReference(ring, referenceX, canvas.width));
  for (const wrapOffset of [-canvas.width, 0, canvas.width]) {
    context.beginPath();
    for (const ring of alignedRings) addProjectedRingPath(context, ring, wrapOffset);
    context.fill("evenodd");
  }
}

function fillFeature(context, feature, canvas, options) {
  for (const polygon of featurePolygons(feature, options)) {
    const projectedRings = polygon
      .map((ring) => projectRing(ring, canvas, options))
      .filter((ring) => ring.length >= 3);
    if (!projectedRings.length) continue;
    const outerReferenceX = projectedRings[0][0][0];
    const alignedRings = projectedRings.map((ring) => alignRingToReference(ring, outerReferenceX, canvas.width));
    for (const wrapOffset of [-canvas.width, 0, canvas.width]) {
      context.beginPath();
      for (const ring of alignedRings) addProjectedRingPath(context, ring, wrapOffset);
      context.fill("evenodd");
    }
  }
}

function featurePolygons(feature, options = {}) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];
  if (polygons.length <= 1) return polygons;

  const ranked = polygons
    .map((polygon) => ({ polygon, area: Math.abs(ringAreaDeg2(polygon[0] ?? [])) }))
    .sort((a, b) => b.area - a.area);
  const minimumArea = Math.max(0, Number(options.minIslandAreaDeg2 ?? 0.035));
  const maximumIslands = Math.max(1, Number(options.maxIslandPolygonsPerCountry ?? 12));
  return ranked
    .filter((entry, index) => index === 0 || entry.area >= minimumArea)
    .slice(0, maximumIslands)
    .map((entry) => entry.polygon);
}

function projectRing(ring, canvas, options) {
  const coordinates = simplifyRing(
    ring,
    Math.max(0, Number(options.simplifyStepDeg ?? 0.7)),
    Math.max(0, Number(options.quantizeStepDeg ?? 0.35))
  );
  return projectCoordinates(coordinates, canvas);
}

function projectCoordinates(coordinates, canvas) {
  const points = [];
  let previousU = null;
  for (const [lon, lat] of coordinates) {
    let u = wrap01((lon + 180) / 360);
    const v = THREE.MathUtils.clamp(1 - (lat + 90) / 180, 0, 1);
    if (previousU != null) {
      while (u - previousU > 0.5) u -= 1;
      while (u - previousU < -0.5) u += 1;
    }
    points.push([u * canvas.width, v * canvas.height]);
    previousU = u;
  }
  return points;
}

function wrap01(value) {
  return ((value % 1) + 1) % 1;
}

function wrapProjectedRing(ring, width) {
  if (ring.length < 2) return [];
  return [-width, 0, width].map((offset) => ring.map(([x, y]) => [x + offset, y]));
}

function alignRingToReference(ring, referenceX, width) {
  if (!ring.length) return ring;
  const offset = Math.round((referenceX - ring[0][0]) / width) * width;
  return ring.map(([x, y]) => [x + offset, y]);
}

function drawProjectedStroke(context, ring) {
  if (ring.length < 2) return;
  context.beginPath();
  context.moveTo(ring[0][0], ring[0][1]);
  for (let index = 1; index < ring.length; index += 1) context.lineTo(ring[index][0], ring[index][1]);
  context.stroke();
}

function addProjectedRingPath(context, ring, offsetX) {
  if (ring.length < 3) return;
  context.moveTo(ring[0][0] + offsetX, ring[0][1]);
  for (let index = 1; index < ring.length; index += 1) context.lineTo(ring[index][0] + offsetX, ring[index][1]);
  context.closePath();
}

function simplifyRing(ring, simplifyStepDeg, quantizeStepDeg) {
  const quantized = quantizeRing(ring, quantizeStepDeg);
  if (quantized.length < 3) return quantized;
  const wasClosed = pointsEqual(quantized[0], quantized[quantized.length - 1]);
  const open = wasClosed ? quantized.slice(0, -1) : quantized;
  const simplified = simplifyRdp(open, simplifyStepDeg);
  if (wasClosed && simplified.length >= 3) simplified.push([...simplified[0]]);
  return simplified;
}

function quantizeRing(ring, quantizeStepDeg) {
  if (!Array.isArray(ring) || ring.length < 2) return [];
  const quantized = [];
  for (const coordinate of ring) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
    const lon = quantize(Number(coordinate[0]), quantizeStepDeg);
    const lat = quantize(Number(coordinate[1]), quantizeStepDeg);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const previous = quantized[quantized.length - 1];
    if (!previous || previous[0] !== lon || previous[1] !== lat) quantized.push([lon, lat]);
  }
  return quantized;
}

function buildBoundarySegmentCounts(features, options) {
  const counts = new Map();
  for (const feature of features) {
    for (const polygon of featurePolygons(feature, options)) {
      for (const ring of polygon) {
        const quantized = quantizeRing(ring, Math.max(0, Number(options.quantizeStepDeg ?? 0.35)));
        for (let index = 1; index < quantized.length; index += 1) {
          const key = segmentKey(quantized[index - 1], quantized[index]);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

function filterBoundarySegments(points, segmentCounts, sharedOnly) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const segments = [];
  let current = [];
  const flush = () => {
    if (current.length >= 2) segments.push(current);
    current = [];
  };
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const shared = !segmentCounts || (segmentCounts.get(segmentKey(a, b)) ?? 0) > 1;
    if (!sharedOnly || shared) {
      if (!current.length) current.push(a);
      current.push(b);
    } else {
      flush();
    }
  }
  flush();
  return segments;
}

function segmentKey(a, b) {
  const first = `${a[0].toFixed(4)},${a[1].toFixed(4)}`;
  const second = `${b[0].toFixed(4)},${b[1].toFixed(4)}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function simplifyRdp(points, tolerance) {
  if (points.length <= 2 || tolerance <= 0) return points.map((point) => [...point]);
  const squaredTolerance = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maximumDistance = 0;
    let maximumIndex = -1;
    for (let index = start + 1; index < end; index += 1) {
      const distance = squaredSegmentDistance(points[index], points[start], points[end]);
      if (distance > maximumDistance) {
        maximumDistance = distance;
        maximumIndex = index;
      }
    }
    if (maximumIndex >= 0 && maximumDistance > squaredTolerance) {
      keep[maximumIndex] = 1;
      stack.push([start, maximumIndex], [maximumIndex, end]);
    }
  }
  return points.filter((_, index) => keep[index]).map((point) => [...point]);
}

function squaredSegmentDistance(point, start, end) {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end[0];
      y = end[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function ringAreaDeg2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let area = 0;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    area += Number(ring[previous]?.[0] ?? 0) * Number(ring[index]?.[1] ?? 0)
      - Number(ring[index]?.[0] ?? 0) * Number(ring[previous]?.[1] ?? 0);
  }
  return area / 2;
}

function pointsEqual(a, b) {
  return Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
}

function angularDistanceDeg(a, b) {
  let lonDelta = b[0] - a[0];
  while (lonDelta > 180) lonDelta -= 360;
  while (lonDelta < -180) lonDelta += 360;
  return Math.hypot(lonDelta, b[1] - a[1]);
}

function quantize(value, step) {
  if (!step) return value;
  return Math.round(value / step) * step;
}

function featureKeys(feature) {
  const properties = feature?.properties ?? {};
  return normalizedKeys([
    properties.ISO_A2,
    properties.ISO_A3,
    properties.ADM0_A3,
    properties.SOV_A3,
    properties.NAME,
    properties.NAME_EN,
    properties.ADMIN,
    properties.FORMAL_EN
  ]);
}

function countryKeys(country) {
  if (typeof country === "string" || typeof country === "number") {
    return normalizedKeys([country]);
  }
  return normalizedKeys([
    country?.iso2,
    country?.iso3,
    country?.adm0_a3,
    country?.name,
    country?.sourceName
  ]);
}

function normalizePresentationGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group) => ({
      ...group,
      members: Array.isArray(group?.members) ? normalizedKeys(group.members) : []
    }))
    .filter((group) => group.members.length > 0);
}

function sameStringArray(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function normalizedKeys(values) {
  return [...new Set(values.map(normalizeKey).filter(Boolean))];
}

function normalizeKey(value) {
  if (value == null) return null;
  return String(value).trim().toUpperCase();
}

function describeFeature(feature, matchedKey) {
  const properties = feature?.properties ?? {};
  return {
    matchedKey,
    name: properties.NAME_EN ?? properties.NAME ?? properties.ADMIN ?? null,
    iso2: properties.ISO_A2 ?? null,
    iso3: properties.ISO_A3 ?? properties.ADM0_A3 ?? null
  };
}

function countNontransparentPixels(context, canvas) {
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let count = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) count += 1;
  }
  return count;
}

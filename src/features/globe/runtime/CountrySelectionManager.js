import * as THREE from "three";
import { createDebugAtlasMaterial, createHighlightMaterial } from "./shaders/countryHighlightShader.js";
import { sphericalUv } from "./math/geoProjection.js";

export class CountrySelectionManager {
  constructor({ renderer, assets, config, callbacks = {}, pinManager = null, activityRegionManager = null }) {
    this.renderer = renderer;
    this.assets = assets;
    this.config = config;
    this.callbacks = callbacks;
    this.pinManager = pinManager;
    this.activityRegionManager = activityRegionManager;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(100, 100);
    this.countryLookup = assets.countryLookup;
    this.countryByRgb = assets.countryByRgb;
    this.selectedRegion = null;
    this.hoverRegion = null;
    this.hoverWorldPosition = null;
    this.enabledEventOnly = config.selection?.enabledEventOnly !== false;
    this.useSphereRaycast = config.selection?.useSphereRaycast === true;
    this.dirty = true;
    this.lastSampleRotation = Infinity;
    this.lastCountryHover = null;
    this.pointerDown = false;
    this.pointerDownPosition = new THREE.Vector2();
    this.pointerDragExceeded = false;
    this.tmpLocalPoint = new THREE.Vector3();
    this.tmpWorldPoint = new THREE.Vector3();
    this.tmpGlobeCenter = new THREE.Vector3();
    this.tmpSurfaceNormal = new THREE.Vector3();
    this.tmpCameraDirection = new THREE.Vector3();
    this.tmpFrontSurface = new THREE.Vector3();
    this.sphere = new THREE.Sphere();
    this.transition = createHighlightTransition(config);
    this.highlightTrace = null;
    this.debugState = {
      showCountryHighlightMask: false,
      showCountryIdTexture: false,
      showVisualCountryAtlas: false,
      countryIdTextureOpacity: 0.86,
      visualAtlasOpacity: 0.86,
      highlightMaskOpacity: 1,
      countryAtlas: {}
    };
    this.#createHighlightMeshes();
    this.setHighlightVisible(config.selection?.highlightVisible !== false);
    this.#createDebugMeshes();
    this.boundPointerDown = (event) => this.#handlePointerDown(event);
    this.boundPointerMove = (event) => this.#handlePointerMove(event);
    this.boundPointerUp = () => this.#handlePointerUp();
    this.boundPointerCancel = () => this.#handlePointerCancel();
    this.boundPointerLeave = () => this.#handlePointerLeave();
    this.boundClick = () => this.#handleClick();
    this.boundDblClick = () => this.#handleDblClick();
    this.renderer.renderer.domElement.addEventListener("pointerdown", this.boundPointerDown);
    this.renderer.renderer.domElement.addEventListener("pointermove", this.boundPointerMove);
    this.renderer.renderer.domElement.addEventListener("pointerup", this.boundPointerUp);
    this.renderer.renderer.domElement.addEventListener("pointercancel", this.boundPointerCancel);
    this.renderer.renderer.domElement.addEventListener("pointerleave", this.boundPointerLeave);
    this.renderer.renderer.domElement.addEventListener("click", this.boundClick);
    this.renderer.renderer.domElement.addEventListener("dblclick", this.boundDblClick);
  }

  updateEvents(events = []) {
    const countsByIso3 = new Map();
    const countsById = new Map();
    for (const event of events) {
      const iso3 = event.countryIso3 ?? event.iso3 ?? event.expectedIso3;
      if (iso3) countsByIso3.set(String(iso3).toUpperCase(), (countsByIso3.get(String(iso3).toUpperCase()) ?? 0) + 1);
      if (event.countryId != null) countsById.set(String(event.countryId), (countsById.get(String(event.countryId)) ?? 0) + 1);
    }
    Object.values(this.countryLookup).forEach((country) => {
      const isoCount = country.iso3 ? countsByIso3.get(String(country.iso3).toUpperCase()) ?? 0 : 0;
      const idCount = country.id != null ? countsById.get(String(country.id)) ?? 0 : 0;
      country.eventCount = isoCount + idCount;
      country.eventActive = country.eventCount > 0;
      country.activityIntensity = country.eventCount > 0
        ? THREE.MathUtils.clamp(Math.log2(country.eventCount + 1) / 3, 0.18, 1)
        : 0;
    });
    this.markDirty();
  }

  markDirty() {
    this.dirty = true;
  }

  setEnabledEventOnly(enabled) {
    this.enabledEventOnly = Boolean(enabled);
    if (this.enabledEventOnly && this.selectedRegion && !this.selectedRegion.eventActive) {
      this.selectedRegion = null;
      this.#setHighlightRegion(this.hoverRegion?.eventActive ? this.hoverRegion : null);
      this.callbacks.onCountrySelect?.(null);
    }
    this.markDirty();
  }

  update(delta, elapsed) {
    this.#updateHighlightTransition(elapsed);
    this.highlightMesh.rotation.y = this.renderer.visibleLandMesh?.rotation.y ?? 0;
    this.outgoingHighlightMesh.rotation.y = this.renderer.visibleLandMesh?.rotation.y ?? 0;
    this.countryIdDebugMesh.rotation.y = this.renderer.visibleLandMesh?.rotation.y ?? 0;
    this.visualAtlasDebugMesh.rotation.y = this.renderer.visibleLandMesh?.rotation.y ?? 0;
    this.highlightMaskDebugMesh.rotation.y = this.renderer.visibleLandMesh?.rotation.y ?? 0;
    const currentRotation = this.renderer.visibleLandMesh?.rotation.y ?? 0;
    const rotationDirty = Math.abs(currentRotation - this.lastSampleRotation) >= this.config.selection.raycastRotationThreshold;
    if (!this.dirty && !rotationDirty) return;
    this.dirty = false;
    this.lastSampleRotation = currentRotation;
    this.#updateHover();
  }

  selectCountry(countryIdOrIso, elapsed = 0) {
    const region = this.#findCountry(countryIdOrIso);
    this.selectedRegion = region;
    this.#setHighlightRegion(region);
    this.callbacks.onCountrySelect?.(region);
    if (region && this.hoverWorldPosition) {
      this.callbacks.onCountryFocusRequest?.(this.hoverWorldPosition, elapsed);
    }
    return region;
  }

  highlightCountry(countryIdOrIso) {
    const trace = this.#createHighlightTrace(countryIdOrIso);
    const region = this.#findCountry(countryIdOrIso);
    this.#logHighlightTraceStage(trace, "lookup", {
      resolved: Boolean(region),
      region: describeRegion(region),
      lookupSize: Object.keys(this.countryLookup).length,
      countryByRgbSize: this.countryByRgb?.size ?? 0
    });
    this.#logHighlightTraceStage(trace, "atlas", {
      cpuAtlasSample: "not used for event selection",
      shaderAtlasTexture: describeTexture(this.highlightMaterial?.uniforms?.idMap?.value),
      targetRgbSource: region?.rgb ?? null,
      targetRgbNormalized: normalizeRgb(region?.rgb),
      idSamplerLoaded: Boolean(this.assets.idSampler),
      idSamplerSize: this.assets.idSampler ? `${this.assets.idSampler.width}x${this.assets.idSampler.height}` : null
    });
    this.#logHighlightTraceStage(trace, "mesh-before", this.#describeHighlightMeshState());
    this.selectedRegion = region;
    this.#setHighlightRegion(region);
    this.#logHighlightTraceStage(trace, "mesh-after", this.#describeHighlightMeshState());
    this.#logHighlightTraceStage(trace, "uniforms-after-set", describeHighlightUniforms(this.highlightMaterial));
    this.#finishHighlightTrace(trace, region);
    return region;
  }

  clearSelection() {
    this.selectedRegion = null;
    this.#setHighlightRegion(this.hoverRegion);
  }

  setHighlightVisible(visible) {
    const nextVisible = Boolean(visible);
    this.highlightMesh.visible = nextVisible;
    this.outgoingHighlightMesh.visible = nextVisible;
  }

  updateDebugView(debugConfig = {}) {
    this.debugState = {
      ...this.debugState,
      ...debugConfig,
      countryAtlas: {
        ...this.debugState.countryAtlas,
        ...(debugConfig.countryAtlas ?? {})
      }
    };
    this.#updateDebugMaterialUniforms();
    this.countryIdDebugMesh.visible = Boolean(this.debugState.showCountryIdTexture);
    this.visualAtlasDebugMesh.visible = Boolean(this.debugState.showVisualCountryAtlas);
    this.highlightMaskDebugMesh.visible = Boolean(this.debugState.showCountryHighlightMask && this.selectedRegion);
    this.markDirty();
  }

  dispose() {
    const dom = this.renderer.renderer.domElement;
    dom.removeEventListener("pointerdown", this.boundPointerDown);
    dom.removeEventListener("pointermove", this.boundPointerMove);
    dom.removeEventListener("pointerup", this.boundPointerUp);
    dom.removeEventListener("pointercancel", this.boundPointerCancel);
    dom.removeEventListener("pointerleave", this.boundPointerLeave);
    dom.removeEventListener("click", this.boundClick);
    dom.removeEventListener("dblclick", this.boundDblClick);
    this.renderer.globe.remove(this.highlightMesh);
    this.renderer.globe.remove(this.outgoingHighlightMesh);
    this.renderer.globe.remove(this.countryIdDebugMesh);
    this.renderer.globe.remove(this.visualAtlasDebugMesh);
    this.renderer.globe.remove(this.highlightMaskDebugMesh);
    this.highlightMaterial.dispose();
    this.outgoingHighlightMaterial.dispose();
    this.countryIdDebugMaterial.dispose();
    this.visualAtlasDebugMaterial.dispose();
    this.highlightMaskDebugMaterial.dispose();
  }

  #createHighlightMeshes() {
    this.highlightMaterial = createHighlightMaterial(this.assets.countryIdTexture, this.config, this.assets.visualAtlasTexture);
    this.outgoingHighlightMaterial = createHighlightMaterial(this.assets.countryIdTexture, this.config, this.assets.visualAtlasTexture);
    this.highlightMesh = new THREE.Mesh(this.renderer.visibleLandMesh.geometry, this.highlightMaterial);
    this.highlightMesh.scale.setScalar(1.004);
    this.outgoingHighlightMesh = new THREE.Mesh(this.renderer.visibleLandMesh.geometry, this.outgoingHighlightMaterial);
    this.outgoingHighlightMesh.scale.setScalar(1.005);
    this.renderer.globe.add(this.outgoingHighlightMesh, this.highlightMesh);
  }

  #createDebugMeshes() {
    this.countryIdDebugMaterial = createDebugAtlasMaterial(this.assets.countryIdTexture, this.config);
    this.visualAtlasDebugMaterial = createDebugAtlasMaterial(this.assets.visualAtlasTexture, this.config);
    this.highlightMaskDebugMaterial = createHighlightMaterial(this.assets.countryIdTexture, this.config, this.assets.visualAtlasTexture);
    this.highlightMaskDebugMaterial.depthTest = false;
    this.countryIdDebugMesh = new THREE.Mesh(this.renderer.visibleLandMesh.geometry, this.countryIdDebugMaterial);
    this.countryIdDebugMesh.scale.setScalar(1.012);
    this.countryIdDebugMesh.renderOrder = 30;
    this.countryIdDebugMesh.visible = false;
    this.visualAtlasDebugMesh = new THREE.Mesh(this.renderer.visibleLandMesh.geometry, this.visualAtlasDebugMaterial);
    this.visualAtlasDebugMesh.scale.setScalar(1.014);
    this.visualAtlasDebugMesh.renderOrder = 31;
    this.visualAtlasDebugMesh.visible = false;
    this.highlightMaskDebugMesh = new THREE.Mesh(this.renderer.visibleLandMesh.geometry, this.highlightMaskDebugMaterial);
    this.highlightMaskDebugMesh.scale.setScalar(1.016);
    this.highlightMaskDebugMesh.renderOrder = 32;
    this.highlightMaskDebugMesh.visible = false;
    this.renderer.globe.add(this.countryIdDebugMesh, this.visualAtlasDebugMesh, this.highlightMaskDebugMesh);
    this.#updateDebugMaterialUniforms();
  }

  #handlePointerDown(event) {
    if (event.button !== 0) return;
    this.pointerDown = true;
    this.pointerDragExceeded = false;
    this.pointerDownPosition.set(event.clientX, event.clientY);
  }

  #handlePointerMove(event) {
    if (this.pointerDown && !this.pointerDragExceeded) {
      const dragThreshold = Math.max(2, Number(this.config.selection?.clickDragThresholdPx ?? 6));
      if (this.pointerDownPosition.distanceTo({ x: event.clientX, y: event.clientY }) > dragThreshold) {
        this.pointerDragExceeded = true;
      }
    }
    const rect = this.renderer.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.markDirty();
  }

  #handlePointerUp() {
    this.pointerDown = false;
  }

  #handlePointerCancel() {
    this.pointerDown = false;
    this.pointerDragExceeded = true;
  }

  #handlePointerLeave() {
    if (this.pointerDown) this.pointerDragExceeded = true;
    this.pointerDown = false;
    this.pointer.set(100, 100);
    this.hoverRegion = null;
    this.hoverWorldPosition = null;
    this.#emitCountryHover(null);
    if (!this.selectedRegion) this.#setHighlightRegion(null);
    this.markDirty();
  }

  #handleClick() {
    const wasDrag = this.pointerDragExceeded;
    this.pointerDragExceeded = false;
    if (wasDrag) return;
    if (this.pinManager?.hoveredEvent || this.activityRegionManager?.hoveredRegionId) return;
    this.renderer.noteInteraction();
    this.selectedRegion = this.hoverRegion;
    this.#setHighlightRegion(this.selectedRegion);
    this.callbacks.onCountrySelect?.(this.selectedRegion);
    if (this.selectedRegion && this.hoverWorldPosition) {
      this.callbacks.onCountryFocusRequest?.(this.hoverWorldPosition, this.renderer.clock.elapsedTime);
    }
  }

  #handleDblClick() {
    if (this.pinManager?.hoveredEvent || this.activityRegionManager?.hoveredRegionId) return;
    this.renderer.noteInteraction();
    this.callbacks.onSurfaceDblClick?.();
  }

  #updateHover() {
    if (!this.renderer.visibleLandMesh || !this.assets.idSampler) return;
    if (this.pinManager?.hoveredEvent || this.activityRegionManager?.hoveredRegionId) {
      if (this.hoverRegion || this.hoverWorldPosition) this.#clearHover();
      this.renderer.renderer.domElement.style.cursor = "pointer";
      return;
    }
    this.raycaster.setFromCamera(this.pointer, this.renderer.camera);
    let hitPoint = null;
    let hitDistance = null;

    if (this.useSphereRaycast) {
      this.renderer.globe.getWorldPosition(this.tmpGlobeCenter);
      this.sphere.center.copy(this.tmpGlobeCenter);
      this.sphere.radius = (this.renderer.presentationRadius ?? this.renderer.globeRadius) * 1.002;
      hitPoint = this.raycaster.ray.intersectSphere(this.sphere, this.tmpWorldPoint);
      hitDistance = hitPoint ? this.raycaster.ray.origin.distanceTo(hitPoint) : null;
    } else {
      const raycastMesh = this.renderer.landHitMesh ?? this.renderer.visibleLandMesh;
      if (raycastMesh) {
        raycastMesh.rotation.copy(this.renderer.visibleLandMesh?.rotation ?? raycastMesh.rotation);
        raycastMesh.updateMatrixWorld(true);
        const hits = this.raycaster.intersectObject(raycastMesh, false);
        if (hits.length) {
          hitPoint = hits[0].point;
          hitDistance = hits[0].distance;
        }
      }
    }

    if (!hitPoint || (!this.useSphereRaycast && !this.#isWorldPointVisibleOnGlobe(hitPoint, hitDistance))) {
      this.#clearHover();
      return;
    }
    const result = this.#sampleAtlasAtVisualWorldPosition(hitPoint);
    const activeRegion = result.country && (!this.enabledEventOnly || result.country.eventActive) ? result.country : null;
    this.hoverRegion = activeRegion;
    this.hoverWorldPosition = activeRegion ? hitPoint.clone() : null;
    this.renderer.renderer.domElement.style.cursor = activeRegion ? "pointer" : "default";
    this.#emitCountryHover(activeRegion, result);
    if (!this.selectedRegion) this.#setHighlightRegion(activeRegion);
  }

  #clearHover() {
    this.hoverRegion = null;
    this.hoverWorldPosition = null;
    this.renderer.renderer.domElement.style.cursor = "default";
    this.#emitCountryHover(null, null);
    if (!this.selectedRegion) this.#setHighlightRegion(null);
  }

  #emitCountryHover(country, sample = null) {
    if (country === this.lastCountryHover && !sample) return;
    this.lastCountryHover = country;
    this.callbacks.onCountryHover?.(country, sample);
  }

  #sampleAtlasAtVisualWorldPosition(worldPosition) {
    this.tmpLocalPoint.copy(worldPosition);
    const samplingMesh = this.useSphereRaycast
      ? this.renderer.visibleLandMesh
      : this.renderer.landHitMesh ?? this.renderer.visibleLandMesh;
    samplingMesh.worldToLocal(this.tmpLocalPoint);
    return this.#sampleAtlasAtLocalPoint(this.tmpLocalPoint, worldPosition);
  }

  #sampleAtlasAtLocalPoint(localPoint, worldPosition) {
    const uv = sphericalUv(localPoint, this.#atlasConfig());
    const sample = this.#sampleIdTexture(uv.u, uv.v);
    const country = this.countryByRgb.get(sample.key) ?? null;
    if (country?.eventActive || !this.enabledEventOnly) return { uv, sample, country, worldPosition };

    const padded = this.#sampleNearbyActiveCountry(sample.x, sample.y);
    return {
      uv,
      sample: padded?.sample ?? sample,
      country: padded?.country ?? country,
      worldPosition,
      hitPaddingPixels: padded?.distancePixels ?? 0
    };
  }

  #sampleNearbyActiveCountry(centerX, centerY) {
    const radius = Math.max(0, Math.floor(Number(this.config.selection?.activeHitPaddingPixels ?? 0)));
    if (!radius) return null;
    const sampler = this.assets.idSampler;
    let best = null;
    for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
      for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
        if (xOffset === 0 && yOffset === 0) continue;
        const distancePixels = Math.hypot(xOffset, yOffset);
        if (distancePixels > radius) continue;
        const x = ((centerX + xOffset) % sampler.width + sampler.width) % sampler.width;
        const y = THREE.MathUtils.clamp(centerY + yOffset, 0, sampler.height - 1);
        const sample = this.#sampleIdTextureAtPixel(x, y);
        const country = this.countryByRgb.get(sample.key) ?? null;
        if (!country?.eventActive) continue;
        if (!best || distancePixels < best.distancePixels) best = { sample, country, distancePixels };
      }
    }
    return best;
  }

  #sampleIdTexture(u, v) {
    const sampler = this.assets.idSampler;
    const x = THREE.MathUtils.clamp(Math.floor(u * sampler.width), 0, sampler.width - 1);
    const y = THREE.MathUtils.clamp(Math.floor(v * sampler.height), 0, sampler.height - 1);
    return this.#sampleIdTextureAtPixel(x, y);
  }

  #sampleIdTextureAtPixel(x, y) {
    const sampler = this.assets.idSampler;
    const i = (y * sampler.width + x) * 4;
    const r = sampler.data[i];
    const g = sampler.data[i + 1];
    const b = sampler.data[i + 2];
    return { r, g, b, x, y, key: `${r},${g},${b}` };
  }

  #isWorldPointVisibleOnGlobe(worldPosition, hitDistance = null) {
    if (!this.#isWorldPointOnFrontGlobe(worldPosition)) return false;
    this.renderer.globe.getWorldPosition(this.tmpGlobeCenter);
    this.sphere.center.copy(this.tmpGlobeCenter);
    this.sphere.radius = (this.renderer.presentationRadius ?? this.renderer.globeRadius) * 1.015;
    const frontSurfacePoint = this.raycaster.ray.intersectSphere(this.sphere, this.tmpFrontSurface);
    if (!frontSurfacePoint) return true;
    const frontSurfaceDistance = this.raycaster.ray.origin.distanceTo(frontSurfacePoint);
    const targetDistance = hitDistance ?? this.raycaster.ray.origin.distanceTo(worldPosition);
    return targetDistance <= frontSurfaceDistance + this.config.selection.clickOcclusionSurfacePadding;
  }

  #isWorldPointOnFrontGlobe(worldPosition) {
    this.renderer.globe.getWorldPosition(this.tmpGlobeCenter);
    this.tmpSurfaceNormal.copy(worldPosition).sub(this.tmpGlobeCenter).normalize();
    this.tmpCameraDirection.copy(this.renderer.camera.position).sub(this.tmpGlobeCenter).normalize();
    return this.tmpSurfaceNormal.dot(this.tmpCameraDirection) >= this.config.selection.clickFrontHemisphereDot;
  }

  #findCountry(countryIdOrIso) {
    if (countryIdOrIso == null) return null;
    const countryKey = resolveCountryKey(countryIdOrIso);
    if (countryKey == null) return null;
    const key = String(countryKey).toUpperCase();
    return Object.values(this.countryLookup).find((country) => {
      return String(country.id) === String(countryKey)
        || String(country.iso3 ?? "").toUpperCase() === key
        || String(country.iso2 ?? "").toUpperCase() === key;
    }) ?? null;
  }

  #setHighlightRegion(region) {
    const nextKey = highlightRegionKey(region);
    const nextSelected = Boolean(region && this.selectedRegion === region);
    const currentKey = this.transition.regionKey;
    const currentSelected = this.transition.selected;
    if (nextKey === currentKey && nextSelected === currentSelected) {
      updateHighlightMaterialTarget(this.highlightMaterial, region, nextSelected, this.config);
      updateHighlightMaterialTarget(this.highlightMaskDebugMaterial, region, nextSelected, this.config);
      return;
    }
    const now = this.renderer.clock.elapsedTime;
    const selectingNewCountry = Boolean(region && nextSelected && (!currentSelected || nextKey !== currentKey));
    if (this.transition.region && this.transition.opacity > 0.001 && nextKey !== currentKey) {
      this.transition.outgoing.region = this.transition.region;
      this.transition.outgoing.regionKey = this.transition.regionKey;
      this.transition.outgoing.selected = this.transition.selected;
      this.transition.outgoing.opacity = this.transition.opacity;
      this.transition.outgoing.fadeFrom = this.transition.opacity;
      this.transition.outgoing.fadeStartedAt = now;
      updateHighlightMaterialTarget(this.outgoingHighlightMaterial, this.transition.outgoing.region, this.transition.outgoing.selected, this.config);
    }
    this.transition.region = region;
    this.transition.regionKey = nextKey;
    this.transition.selected = nextSelected;
    this.transition.fadeFrom = selectingNewCountry ? 0 : this.transition.opacity;
    this.transition.fadeTo = region ? 1 : 0;
    this.transition.fadeStartedAt = now;
    this.transition.fadeDuration = region ? this.config.selection.fadeInSeconds : this.config.selection.fadeOutSeconds;
    this.transition.pulseStartedAt = selectingNewCountry ? now : -Infinity;
    if (!region) this.transition.opacity = 0;
    updateHighlightMaterialTarget(this.highlightMaterial, region, nextSelected, this.config);
    updateHighlightMaterialTarget(this.highlightMaskDebugMaterial, region, nextSelected, this.config);
    this.highlightMaskDebugMesh.visible = Boolean(this.debugState.showCountryHighlightMask && region);
  }

  #updateHighlightTransition(elapsed) {
    this.highlightMaterial.uniforms.time.value = elapsed;
    this.outgoingHighlightMaterial.uniforms.time.value = elapsed;
    this.highlightMaskDebugMaterial.uniforms.time.value = elapsed;
    const fadeProgress = THREE.MathUtils.clamp(
      (elapsed - this.transition.fadeStartedAt) / Math.max(this.transition.fadeDuration, 0.001),
      0,
      1
    );
    this.transition.opacity = THREE.MathUtils.lerp(this.transition.fadeFrom, this.transition.fadeTo, easeOutCubic(fadeProgress));
    const pulseProgress = this.transition.selected
      ? THREE.MathUtils.clamp((elapsed - this.transition.pulseStartedAt) / this.config.selection.pulseSeconds, 0, 1)
      : 1;
    this.highlightMaterial.uniforms.opacity.value = this.transition.region ? this.transition.opacity : 0;
    this.highlightMaskDebugMaterial.uniforms.opacity.value = this.transition.region ? this.debugState.highlightMaskOpacity : 0;
    this.highlightMaterial.uniforms.pulseProgress.value = pulseProgress;
    this.highlightMaskDebugMaterial.uniforms.pulseProgress.value = pulseProgress;
    this.highlightMaterial.uniforms.edgeBoost.value = pulseProgress < 1
      ? Math.sin(pulseProgress * Math.PI) * (1 - pulseProgress * 0.35) * 0.18
      : 0;
    this.highlightMaskDebugMaterial.uniforms.edgeBoost.value = this.highlightMaterial.uniforms.edgeBoost.value;
    this.highlightMaterial.uniforms.breatheCycleSeconds.value = this.config.selection.breatheSeconds;
    this.highlightMaskDebugMaterial.uniforms.breatheCycleSeconds.value = this.config.selection.breatheSeconds;

    const outgoingProgress = THREE.MathUtils.clamp(
      (elapsed - this.transition.outgoing.fadeStartedAt) / this.config.selection.fadeOutSeconds,
      0,
      1
    );
    const outgoingOpacity = THREE.MathUtils.lerp(this.transition.outgoing.fadeFrom, 0, easeOutCubic(outgoingProgress));
    this.transition.outgoing.opacity = outgoingOpacity;
    this.outgoingHighlightMaterial.uniforms.opacity.value = outgoingOpacity;
    this.outgoingHighlightMaterial.uniforms.pulseProgress.value = 1;
    this.outgoingHighlightMaterial.uniforms.edgeBoost.value = 0;
    if (outgoingOpacity <= 0.001) {
      this.transition.outgoing.region = null;
      this.transition.outgoing.regionKey = null;
      this.outgoingHighlightMaterial.uniforms.enabled.value = 0;
    }
    this.#logHighlightTransitionFrame(elapsed, fadeProgress, pulseProgress, outgoingProgress);
  }

  #createHighlightTrace(countryIdOrIso) {
    const countryKey = resolveCountryKey(countryIdOrIso);
    const trace = {
      id: Math.random().toString(36).slice(2, 8),
      startedAt: this.renderer.clock.elapsedTime,
      countryIdOrIso,
      countryKey
    };
    this.#logHighlightTraceStage(trace, "input", {
      input: countryIdOrIso,
      resolvedCountryKey: countryKey
    });
    return trace;
  }

  #finishHighlightTrace(trace, region) {
    this.highlightTrace = {
      ...trace,
      framesRemaining: 8,
      regionKey: highlightRegionKey(region)
    };
  }

  #logHighlightTraceStage(trace, stage, payload) {
    if (!shouldLogHighlightTrace()) return;
    console.debug(`[SwingSphere highlight:${trace.id}] ${stage}`, payload);
  }

  #logHighlightTransitionFrame(elapsed, fadeProgress, pulseProgress, outgoingProgress) {
    if (!this.highlightTrace || !shouldLogHighlightTrace()) return;
    if (this.highlightTrace.framesRemaining <= 0) {
      this.highlightTrace = null;
      return;
    }
    console.debug(`[SwingSphere highlight:${this.highlightTrace.id}] frame`, {
      elapsed,
      fadeProgress,
      pulseProgress,
      outgoingProgress,
      transition: describeTransition(this.transition),
      uniforms: describeHighlightUniforms(this.highlightMaterial),
      outgoingUniforms: describeHighlightUniforms(this.outgoingHighlightMaterial)
    });
    this.highlightTrace.framesRemaining -= 1;
  }

  #describeHighlightMeshState() {
    return {
      selectedRegion: describeRegion(this.selectedRegion),
      transition: describeTransition(this.transition),
      highlightMesh: describeMesh(this.highlightMesh),
      outgoingHighlightMesh: describeMesh(this.outgoingHighlightMesh),
      highlightMaterial: describeHighlightUniforms(this.highlightMaterial),
      outgoingHighlightMaterial: describeHighlightUniforms(this.outgoingHighlightMaterial)
    };
  }

  #atlasConfig() {
    return {
      ...this.config,
      alignment: {
        ...this.config.alignment,
        ...this.debugState.countryAtlas
      }
    };
  }

  #updateDebugMaterialUniforms() {
    applyAlignmentUniforms(this.countryIdDebugMaterial, this.debugState.countryAtlas, this.config);
    applyAlignmentUniforms(this.visualAtlasDebugMaterial, this.debugState.countryAtlas, this.config);
    applyAlignmentUniforms(this.highlightMaskDebugMaterial, this.debugState.countryAtlas, this.config);
    applyAlignmentUniforms(this.highlightMaterial, this.debugState.countryAtlas, this.config);
    applyAlignmentUniforms(this.outgoingHighlightMaterial, this.debugState.countryAtlas, this.config);
    this.countryIdDebugMaterial.uniforms.opacity.value = this.debugState.countryIdTextureOpacity;
    this.visualAtlasDebugMaterial.uniforms.opacity.value = this.debugState.visualAtlasOpacity;
  }
}

function createHighlightTransition(config) {
  return {
    region: null,
    regionKey: null,
    selected: false,
    opacity: 0,
    fadeFrom: 0,
    fadeTo: 0,
    fadeStartedAt: 0,
    fadeDuration: config.selection.fadeInSeconds,
    pulseStartedAt: -Infinity,
    outgoing: {
      region: null,
      regionKey: null,
      selected: false,
      opacity: 0,
      fadeFrom: 0,
      fadeStartedAt: 0
    }
  };
}

function highlightRegionKey(region) {
  if (!region) return null;
  return region.id ? String(region.id) : `${region.iso3 ?? ""}:${region.rgb?.join(",") ?? ""}`;
}

function updateHighlightMaterialTarget(material, region, selected, config) {
  material.uniforms.enabled.value = region ? 1 : 0;
  material.uniforms.selected.value = selected ? 1 : 0;
  material.uniforms.activityIntensity.value = region?.activityIntensity ?? 0.25;
  material.uniforms.highlightColor.value.set(config.colors.accent);
  if (!region) return;
  const [r, g, b] = region.rgb.map((value) => value / 255);
  material.uniforms.targetRgb.value.set(r, g, b);
}

function resolveCountryKey(value) {
  if (!value || typeof value !== "object") return value;
  return value.countryId
    ?? value.countryIso3
    ?? value.iso3
    ?? value.expectedIso3
    ?? value.countryIso2
    ?? value.iso2
    ?? value.id
    ?? null;
}

function shouldLogHighlightTrace() {
  if (typeof window === "undefined") return false;
  return window.localStorage?.getItem("swingsphere.globeV1.highlightTrace") === "true";
}

function describeRegion(region) {
  if (!region) return null;
  return {
    id: region.id,
    name: region.name,
    iso2: region.iso2,
    iso3: region.iso3,
    rgb: region.rgb,
    eventActive: region.eventActive,
    eventCount: region.eventCount,
    activityIntensity: region.activityIntensity
  };
}

function describeTexture(texture) {
  if (!texture) return null;
  const image = texture.image;
  return {
    uuid: texture.uuid,
    name: texture.name,
    width: image?.width ?? null,
    height: image?.height ?? null,
    flipY: texture.flipY,
    colorSpace: texture.colorSpace
  };
}

function describeMesh(mesh) {
  if (!mesh) return null;
  return {
    name: mesh.name,
    visible: mesh.visible,
    renderOrder: mesh.renderOrder,
    geometryUuid: mesh.geometry?.uuid ?? null,
    scale: mesh.scale.toArray(),
    rotationY: mesh.rotation.y,
    parentAttached: Boolean(mesh.parent)
  };
}

function describeTransition(transition) {
  return {
    regionKey: transition.regionKey,
    selected: transition.selected,
    opacity: transition.opacity,
    fadeFrom: transition.fadeFrom,
    fadeTo: transition.fadeTo,
    fadeStartedAt: transition.fadeStartedAt,
    fadeDuration: transition.fadeDuration,
    pulseStartedAt: transition.pulseStartedAt,
    outgoing: {
      regionKey: transition.outgoing.regionKey,
      selected: transition.outgoing.selected,
      opacity: transition.outgoing.opacity,
      fadeFrom: transition.outgoing.fadeFrom,
      fadeStartedAt: transition.outgoing.fadeStartedAt
    }
  };
}

function describeHighlightUniforms(material) {
  if (!material?.uniforms) return null;
  const uniforms = material.uniforms;
  return {
    enabled: uniforms.enabled?.value,
    selected: uniforms.selected?.value,
    opacity: uniforms.opacity?.value,
    edgeBoost: uniforms.edgeBoost?.value,
    pulseProgress: uniforms.pulseProgress?.value,
    activityIntensity: uniforms.activityIntensity?.value,
    time: uniforms.time?.value,
    targetRgb: uniforms.targetRgb?.value?.toArray?.() ?? null,
    highlightColor: uniforms.highlightColor?.value?.getStyle?.() ?? null,
    idMapLoaded: Boolean(uniforms.idMap?.value),
    visualMapLoaded: Boolean(uniforms.visualMap?.value),
    longitudeOffset: uniforms.longitudeOffset?.value,
    latitudeOffset: uniforms.latitudeOffset?.value,
    longitudeSign: uniforms.longitudeSign?.value,
    flipU: uniforms.flipU?.value,
    flipV: uniforms.flipV?.value
  };
}

function normalizeRgb(rgb) {
  return Array.isArray(rgb) ? rgb.map((value) => value / 255) : null;
}

function applyAlignmentUniforms(material, override = {}, config) {
  if (!material?.uniforms) return;
  const alignment = {
    ...config.alignment,
    ...override
  };
  material.uniforms.longitudeOffset.value = THREE.MathUtils.degToRad(alignment.longitudeOffsetDeg);
  material.uniforms.latitudeOffset.value = THREE.MathUtils.degToRad(alignment.latitudeOffsetDeg);
  material.uniforms.longitudeSign.value = alignment.longitudeSign;
  material.uniforms.flipU.value = alignment.flipU ? 1 : 0;
  material.uniforms.flipV.value = alignment.flipV ? 1 : 0;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

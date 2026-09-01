import * as THREE from "three";
import { DiscoveryMarker } from "./DiscoveryMarker.js";
import { wgs84ToRenderedGlobeLocal } from "./math/geoProjection.js";
import { resolveRenderedGlobeLandSurfaceAnchor } from "./math/surfaceAnchoring.js";

export class ActivityRegionManager {
  constructor({ renderer, config, onSelect }) {
    this.renderer = renderer;
    this.config = config;
    this.onSelect = onSelect;
    this.group = new THREE.Group();
    this.group.name = "swingsphere-activity-region-layer";
    this.renderer.globe.add(this.group);
    this.markers = new Map();
    this.hitTargets = [];
    this.lifecycleStats = {
      sourceRegionCount: 0,
      constructedRegionCount: 0,
      retainedRegionMeshCount: 0,
      estimatedRegionSurfaceRaycastCount: 0,
      regionRebuildCount: 0,
      disposedRegionCount: 0,
      lastRegionBuildDurationMs: 0,
      lastRegionDisposeDurationMs: 0
    };
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(100, 100);
    this.hoveredRegionId = null;
    this.attentionEmphasis = false;
    this.dirty = true;
    this.referenceDistance = this.renderer.camera.position.distanceTo(this.renderer.controls.target);
    this.tmpWorld = new THREE.Vector3();
    this.tmpOrigin = new THREE.Vector3();
    this.tmpDirection = new THREE.Vector3();
    this.tmpCandidate = new THREE.Vector3();
    this.boundPointerMove = (event) => this.#handlePointerMove(event);
    this.boundPointerLeave = () => this.#handlePointerLeave();
    this.boundClick = (event) => this.#handleClick(event);
    const dom = this.renderer.renderer.domElement;
    dom.addEventListener("pointermove", this.boundPointerMove);
    dom.addEventListener("pointerleave", this.boundPointerLeave);
    dom.addEventListener("click", this.boundClick);
  }

  updateRegions(regions = []) {
    const buildStartedAt = performance.now();
    this.#clear();
    for (const region of regions) {
      const anchor = resolveRenderedGlobeLandSurfaceAnchor({
        lng: region.longitude,
        lat: region.latitude,
        config: this.config,
        globeRadius: this.renderer.globeRadius,
        landHitMesh: this.renderer.landHitMesh,
        raycaster: this.raycaster,
        origin: this.tmpOrigin,
        direction: this.tmpDirection,
        candidate: this.tmpCandidate
      });
      const marker = new DiscoveryMarker({
        region,
        position: anchor.anchorPosition,
        radialDirection: anchor.radialDirection,
        config: this.config,
        globeRadius: this.renderer.globeRadius,
        referenceDistance: this.referenceDistance
      });
      this.group.add(marker.group);
      this.markers.set(region.id, marker);
      this.hitTargets.push(marker.hitTarget);
    }
    this.lifecycleStats.sourceRegionCount = regions.length;
    this.lifecycleStats.constructedRegionCount = this.markers.size;
    this.lifecycleStats.retainedRegionMeshCount = [...this.markers.values()].reduce(
      (count, marker) => count + marker.marker.getMeshCount(),
      0
    );
    this.lifecycleStats.estimatedRegionSurfaceRaycastCount = regions.length;
    this.lifecycleStats.regionRebuildCount += 1;
    this.lifecycleStats.lastRegionBuildDurationMs = performance.now() - buildStartedAt;
    this.dirty = true;
  }

  update(delta, selectedRegionId = null) {
    if (!this.group.visible) return;
    this.group.rotation.y = this.renderer.visibleLandMesh?.rotation.y ?? 0;
    this.#updateHover();
    const cameraDistance = this.renderer.camera.position.distanceTo(this.renderer.controls.target);
    for (const [regionId, marker] of this.markers) {
      marker.update({
        hovered: regionId === this.hoveredRegionId,
        selected: regionId === selectedRegionId,
        attention: this.attentionEmphasis && regionId !== selectedRegionId,
        delta,
        cameraDistance
      });
    }
  }

  setVisible(visible) {
    if (this.group.visible === visible) return;
    this.group.visible = visible;
    if (!visible) this.hoveredRegionId = null;
    this.dirty = true;
  }

  setAttentionEmphasis(enabled) {
    this.attentionEmphasis = Boolean(enabled);
    this.dirty = true;
  }

  getRegion(regionId) {
    return this.markers.get(String(regionId))?.region ?? null;
  }

  getRegionWorldPosition(regionId, target = new THREE.Vector3()) {
    return this.markers.get(String(regionId))?.getWorldPosition(target) ?? null;
  }

  getActivityState() {
    return {
      hoverActive: Boolean(this.group.visible && this.hoveredRegionId),
      attentionActive: Boolean(this.group.visible && this.attentionEmphasis && this.markers.size)
    };
  }

  getPerformanceStats() {
    return {
      ...this.lifecycleStats,
      hoverActive: Boolean(this.group.visible && this.hoveredRegionId),
      visibleRegionCount: this.group.visible ? this.markers.size : 0,
      activeListenerCount: 3
    };
  }

  dispose() {
    const dom = this.renderer.renderer.domElement;
    dom.removeEventListener("pointermove", this.boundPointerMove);
    dom.removeEventListener("pointerleave", this.boundPointerLeave);
    dom.removeEventListener("click", this.boundClick);
    this.#clear();
    this.renderer.globe.remove(this.group);
  }

  #handlePointerMove(event) {
    const rect = this.renderer.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.dirty = true;
  }

  #handlePointerLeave() {
    this.pointer.set(100, 100);
    this.hoveredRegionId = null;
    this.dirty = true;
  }

  #handleClick(event) {
    if (!this.group.visible || !this.hoveredRegionId) return;
    const marker = this.markers.get(this.hoveredRegionId);
    if (!marker) return;
    // Discovery markers share the renderer DOM element with country hit
    // testing. Consume the click before activating the region so hiding this
    // layer cannot make the country listener treat the same click as a country
    // selection underneath.
    event?.stopImmediatePropagation?.();
    this.renderer.noteInteraction();
    this.tmpWorld.copy(wgs84ToRenderedGlobeLocal(
      marker.region.longitude,
      marker.region.latitude,
      this.renderer.globeRadius,
      this.config
    ));
    this.onSelect?.(marker.region, this.group.localToWorld(this.tmpWorld), this.renderer.clock.elapsedTime);
  }

  #updateHover() {
    if (!this.dirty) return;
    this.dirty = false;
    this.raycaster.setFromCamera(this.pointer, this.renderer.camera);
    const hit = this.raycaster.intersectObjects(this.hitTargets, false)[0] ?? null;
    this.hoveredRegionId = hit?.object?.userData?.regionId ?? null;
  }

  #clear() {
    const disposeStartedAt = performance.now();
    const disposedCount = this.markers.size;
    for (const marker of this.markers.values()) {
      this.group.remove(marker.group);
      marker.dispose();
    }
    this.markers.clear();
    this.lifecycleStats.constructedRegionCount = 0;
    this.lifecycleStats.retainedRegionMeshCount = 0;
    this.lifecycleStats.disposedRegionCount += disposedCount;
    this.lifecycleStats.lastRegionDisposeDurationMs = performance.now() - disposeStartedAt;
    this.hitTargets = [];
    this.hoveredRegionId = null;
  }
}

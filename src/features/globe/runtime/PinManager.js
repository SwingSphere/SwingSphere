import * as THREE from "three";
import { disposeObject3D } from "./math/objectPools.js";
import { resolveRenderedGlobeLandSurfaceAnchor } from "./math/surfaceAnchoring.js";
import { wgs84ToRenderedGlobeLocal } from "./math/geoProjection.js";
import { createMarkerStyle, DEFAULT_MARKER_STYLE, GlobeMarker, makeSurfaceQuaternion } from "./GlobeMarker.js";


export class PinManager {
  constructor({ renderer, config, callbacks = {} }) {
    this.renderer = renderer;
    this.config = config;
    this.callbacks = callbacks;
    this.group = new THREE.Group();
    this.group.name = "swingsphere-v1-pin-layer";
    this.renderer.globe.add(this.group);
    this.labelOverlayRoot = createLabelOverlayRoot(this.renderer.container);
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(100, 100);
    this.markerViews = [];
    this.markerMap = new Map();
    this.hitTargets = [];
    this.anchorViews = [];
    this.lifecycleStats = {
      sourceEventCount: 0,
      constructedPinCount: 0,
      retainedPinMeshCount: 0,
      retainedLabelNodeCount: 0,
      retainedAnchorCount: 0,
      estimatedSurfaceRaycastCount: 0,
      rebuildCount: 0,
      disposedPinCount: 0,
      lastBuildDurationMs: 0,
      lastDisposeDurationMs: 0
    };
    this.hoveredEvent = null;
    this.selectedEvent = null;
    this.attentionEmphasis = false;
    this.selectionPresentationVisible = true;
    this.heroStudioCaptureState = "idle";
    this.selectionAnimationActive = false;
    this.dirty = true;
    this.tmpOrigin = new THREE.Vector3();
    this.tmpDirection = new THREE.Vector3();
    this.tmpCandidate = new THREE.Vector3();
    this.tmpWorld = new THREE.Vector3();
    this.tmpProjected = new THREE.Vector3();
    this.tmpFocusWorld = new THREE.Vector3();
    this.tmpPinWorld = new THREE.Vector3();
    this.tmpLabelWorld = new THREE.Vector3();
    this.tmpLabelCenter = new THREE.Vector3();
    this.tmpLabelRight = new THREE.Vector3();
    this.tmpLabelUp = new THREE.Vector3();
    this.tmpLabelCorner = new THREE.Vector3();
    this.labelReferenceDistance = this.#getCameraZoomDistance();
    this.boundPointerMove = (event) => this.#handlePointerMove(event);
    this.boundPointerLeave = () => this.#handlePointerLeave();
    this.boundClick = (event) => this.#handleClick(event);
    this.boundLabelActivate = (event) => this.#handleLabelActivate(event);
    this.boundLabelKeyDown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') this.#handleLabelActivate(event);
    };
    this.renderer.renderer.domElement.addEventListener("pointermove", this.boundPointerMove);
    this.renderer.renderer.domElement.addEventListener("pointerleave", this.boundPointerLeave);
    this.renderer.renderer.domElement.addEventListener("click", this.boundClick);
    this.labelOverlayRoot.addEventListener("click", this.boundLabelActivate);
    this.labelOverlayRoot.addEventListener("keydown", this.boundLabelKeyDown);
  }

  updateEvents(events = []) {
    const buildStartedAt = performance.now();
    const selectedEventId = this.selectedEvent
      ? String(this.selectedEvent.id ?? this.selectedEvent.name)
      : null;
    this.#clearMarkers();
    const pin = this.config.pinPlacement;
    let estimatedSurfaceRaycastCount = 0;
    const displayCoordinates = buildRegionalDisplayCoordinates(events, pin.regionalSpread);
    for (const event of events) {
      const entityType = event.entityType ?? event.listing?.type ?? "event";
      const palette = getEntityMarkerPalette(entityType, this.config, pin);
      const style = createMarkerStyle(this.config, {
        stemEmissive: palette.base,
        stemSelectedColor: palette.active,
        tipColor: palette.base,
        tipHoverColor: palette.active,
        tipSelectedColor: palette.active,
        glowColor: palette.active,
        rippleColor: this.config.colors.lightText
      }, this.renderer.globeRadius);
      const displayCoordinate = displayCoordinates.get(String(event.id ?? event.name)) ?? event;
      const spreadAnchor = this.#resolveLandSurfaceAnchor(displayCoordinate.lon, displayCoordinate.lat);
      estimatedSurfaceRaycastCount += 1;
      const usesSpreadCoordinate = displayCoordinate !== event;
      const trueAnchor = usesSpreadCoordinate
        ? this.#resolveLandSurfaceAnchor(event.lon, event.lat)
        : spreadAnchor;
      if (usesSpreadCoordinate) estimatedSurfaceRaycastCount += 1;
      const marker = {
        id: String(event.id ?? event.name),
        name: event.name ?? String(event.id),
        labelTitle: event.name ?? String(event.id),
        labelSubtitle: event.hostRegionLabel ?? formatLocationSubtitle(event),
        labelCountryIso2: resolveCountryIso2(event),
        event,
        anchorPosition: spreadAnchor.anchorPosition,
        radialDirection: spreadAnchor.radialDirection,
        spreadAnchorPosition: spreadAnchor.anchorPosition,
        spreadRadialDirection: spreadAnchor.radialDirection,
        trueAnchorPosition: trueAnchor.anchorPosition,
        trueRadialDirection: trueAnchor.radialDirection,
        surfaceOffset: pin.surfaceOffset,
        surfacePosition: spreadAnchor.anchorPosition.clone().addScaledVector(spreadAnchor.radialDirection, pin.surfaceOffset)
      };
      this.#buildMarkerView(marker, style, entityType);
      if (pin.showPinAnchors) this.#buildAnchorView(marker);
    }
    this.lifecycleStats.sourceEventCount = events.length;
    this.lifecycleStats.constructedPinCount = this.markerViews.length;
    this.lifecycleStats.retainedPinMeshCount = this.markerViews.reduce(
      (count, view) => count + view.globeMarker.getMeshCount(),
      0
    );
    this.lifecycleStats.retainedLabelNodeCount = countDescendantElements(this.labelOverlayRoot);
    this.lifecycleStats.retainedAnchorCount = this.anchorViews.length;
    this.lifecycleStats.estimatedSurfaceRaycastCount = estimatedSurfaceRaycastCount;
    this.lifecycleStats.rebuildCount += 1;
    this.lifecycleStats.lastBuildDurationMs = performance.now() - buildStartedAt;
    if (selectedEventId) {
      const selectedView = this.markerMap.get(selectedEventId);
      this.selectedEvent = selectedView?.marker?.event ?? null;
      if (!this.selectedEvent) this.selectionPresentationVisible = false;
    }
    this.dirty = true;
  }

  setPointer(pointer) {
    this.pointer.copy(pointer);
    this.dirty = true;
  }

  update(delta, elapsed) {
    if (!this.group.visible) {
      this.selectionAnimationActive = false;
      return;
    }
    this.#syncGlobeRotation();
    this.#updateHover();
    this.selectionAnimationActive = false;
    for (const view of this.markerViews) {
      this.#updateView(view, delta);
      if (view.animationActive) this.selectionAnimationActive = true;
    }
  }

  selectEvent(eventId, elapsed = 0) {
    return this.highlightEvent(eventId);
  }

  highlightEvent(eventId) {
    const view = this.markerMap.get(String(eventId));
    if (!view) return null;
    this.selectedEvent = view.marker.event;
    this.selectionPresentationVisible = true;
    this.renderer.noteInteraction();
    return this.selectedEvent;
  }

  mirrorSelectedEvent(event) {
    this.selectedEvent = event ?? null;
    this.selectionPresentationVisible = Boolean(this.selectedEvent);
    return this.selectedEvent;
  }

  setSelectedEventSilently(eventId) {
    const view = this.markerMap.get(String(eventId));
    this.selectedEvent = view?.marker?.event ?? null;
    this.selectionPresentationVisible = Boolean(this.selectedEvent);
    return this.selectedEvent;
  }

  clearSelection() {
    this.selectedEvent = null;
    this.selectionPresentationVisible = false;
    this.renderer.noteInteraction();
  }

  fadeOutSelectedEvent() {
    this.selectionPresentationVisible = false;
    this.dirty = true;
  }

  setAttentionEmphasis(enabled) {
    this.attentionEmphasis = Boolean(enabled);
    this.dirty = true;
  }

  setHeroStudioCaptureState(state = "idle") {
    const supported = new Set(["idle", "target-selected", "endpoint-captured", "previewing"]);
    this.heroStudioCaptureState = supported.has(state) ? state : "idle";
    this.dirty = true;
  }

  playSelectedArrivalPulse() {
    if (!this.selectedEvent) return;
    const eventId = String(this.selectedEvent.id ?? this.selectedEvent.name);
    this.markerMap.get(eventId)?.globeMarker.playArrivalPulse();
    this.renderer.noteInteraction();
  }

  getActivityState() {
    return {
      hoverActive: Boolean(this.group.visible && this.hoveredEvent),
      selectionAnimationActive: Boolean(this.group.visible && this.selectionAnimationActive),
      attentionActive: Boolean(this.group.visible && this.attentionEmphasis && this.markerViews.length)
    };
  }

  getPerformanceStats() {
    let visiblePinCount = 0;
    let animatedRippleCount = 0;
    let visiblePinMeshCount = 0;
    if (this.group.visible) {
      for (const view of this.markerViews) {
        if (view.currentPresentationOpacity > 0.01) {
          visiblePinCount += 1;
          animatedRippleCount += view.globeMarker.getAnimatedRippleCount();
          visiblePinMeshCount += view.globeMarker.getMeshCount();
        }
      }
    }
    return {
      ...this.lifecycleStats,
      visiblePinCount,
      animatedRippleCount,
      pinMeshCount: visiblePinMeshCount,
      hoverActive: Boolean(this.hoveredEvent),
      selectionAnimationActive: this.selectionAnimationActive,
      activeListenerCount: 3
    };
  }

  setVisible(visible) {
    if (visible) this.#syncGlobeRotation();
    if (this.group.visible === visible) return;
    this.group.visible = visible;
    if (!visible) {
      this.hoveredEvent = null;
      this.callbacks.onEventHover?.(null);
    }
    this.dirty = true;
  }

  getMarkerWorldPosition(markerId, target = new THREE.Vector3()) {
    const view = this.markerMap.get(String(markerId));
    if (!view) return null;
    return view.markerGroup.getWorldPosition(target);
  }

  getMarkerTrueWorldPosition(markerId, target = new THREE.Vector3()) {
    const view = this.markerMap.get(String(markerId));
    if (!view) return null;
    this.group.updateWorldMatrix(true, false);
    target.copy(view.marker.trueAnchorPosition);
    return this.group.localToWorld(target);
  }

  getMarkerNavigationWorldPosition(markerId, target = new THREE.Vector3()) {
    const view = this.markerMap.get(String(markerId));
    if (!view) return null;
    this.group.updateWorldMatrix(true, false);
    target.copy(wgs84ToRenderedGlobeLocal(
      view.marker.event.lon,
      view.marker.event.lat,
      this.renderer.globeRadius,
      this.config
    ));
    return this.group.localToWorld(target);
  }

  measureSelectedLabelScreenRect(camera = this.renderer.camera) {
    if (!this.selectedEvent || !camera) return null;
    const eventId = String(this.selectedEvent.id ?? this.selectedEvent.name);
    const view = this.markerMap.get(eventId);
    const labelElement = view?.globeMarker?.label?.activeElement?.();
    if (labelElement) {
      const rect = this.renderer.renderer.domElement.getBoundingClientRect();
      const labelRect = labelElement.getBoundingClientRect();
      if (!rect.width || !rect.height || !labelRect.width || !labelRect.height) return null;
      const minX = (labelRect.left - rect.left) / rect.width;
      const maxX = (labelRect.right - rect.left) / rect.width;
      const minY = (labelRect.top - rect.top) / rect.height;
      const maxY = (labelRect.bottom - rect.top) / rect.height;
      return {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        minX,
        maxX,
        minY,
        maxY,
        widthPx: labelRect.width,
        heightPx: labelRect.height,
        viewportWidth: rect.width,
        viewportHeight: rect.height
      };
    }
    const sprite = view?.globeMarker?.label?.sprite;
    if (!sprite) return null;
    const rect = this.renderer.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    this.renderer.scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    sprite.updateMatrixWorld(true);

    sprite.getWorldPosition(this.tmpLabelWorld);
    this.tmpLabelRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.tmpLabelUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

    const width = sprite.scale.x;
    const height = sprite.scale.y;
    const center = sprite.center ?? { x: 0.5, y: 0.5 };
    this.tmpLabelCenter.copy(this.tmpLabelWorld)
      .addScaledVector(this.tmpLabelRight, (0.5 - center.x) * width)
      .addScaledVector(this.tmpLabelUp, (0.5 - center.y) * height);

    const corners = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5]
    ];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of corners) {
      this.tmpLabelCorner.copy(this.tmpLabelCenter)
        .addScaledVector(this.tmpLabelRight, x * width)
        .addScaledVector(this.tmpLabelUp, y * height)
        .project(camera);
      const screenX = (this.tmpLabelCorner.x + 1) / 2;
      const screenY = (1 - this.tmpLabelCorner.y) / 2;
      minX = Math.min(minX, screenX);
      maxX = Math.max(maxX, screenX);
      minY = Math.min(minY, screenY);
      maxY = Math.max(maxY, screenY);
    }

    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      minX,
      maxX,
      minY,
      maxY,
      widthPx: (maxX - minX) * rect.width,
      heightPx: (maxY - minY) * rect.height,
      viewportWidth: rect.width,
      viewportHeight: rect.height
    };
  }

  dispose() {
    const dom = this.renderer.renderer.domElement;
    dom.removeEventListener("pointermove", this.boundPointerMove);
    dom.removeEventListener("pointerleave", this.boundPointerLeave);
    dom.removeEventListener("click", this.boundClick);
    this.labelOverlayRoot?.removeEventListener("click", this.boundLabelActivate);
    this.labelOverlayRoot?.removeEventListener("keydown", this.boundLabelKeyDown);
    this.#clearMarkers();
    this.labelOverlayRoot?.remove();
    this.labelOverlayRoot = null;
    this.renderer.globe.remove(this.group);
    this.group.clear();
  }

  #handleLabelActivate(event) {
    const label = event.target?.closest?.('[data-marker-id]');
    if (!label || !this.labelOverlayRoot?.contains(label)) return;
    const view = this.markerMap.get(String(label.dataset.markerId));
    if (!view?.marker?.event) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    this.renderer.noteInteraction();
    this.callbacks.onEventLabelActivate?.(view.marker.event);
  }

  #handlePointerMove(event) {
    const rect = this.renderer.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
    this.dirty = true;
  }

  #handlePointerLeave() {
    this.pointer.set(100, 100);
    const hadHoveredEvent = Boolean(this.hoveredEvent);
    this.hoveredEvent = null;
    if (hadHoveredEvent) this.callbacks.onEventHover?.(null);
    this.dirty = true;
  }

  #handleClick(event) {
    if (!this.group.visible || !this.hoveredEvent) return;
    // This click belongs to the pin layer. Prevent the same DOM click from
    // falling through to discovery markers or the country surface underneath.
    event?.stopImmediatePropagation?.();
    this.renderer.noteInteraction();
    this.callbacks.onEventSelect?.(this.hoveredEvent);
  }

  #updateHover() {
    if (!this.dirty || !this.hitTargets.length) return;
    this.dirty = false;
    this.raycaster.setFromCamera(this.pointer, this.renderer.camera);
    const hits = this.raycaster.intersectObjects(this.hitTargets, false);
    const hit = this.#resolveBestPointerHit(hits);
    const nextEvent = hit?.object?.userData?.event ?? null;
    if (nextEvent !== this.hoveredEvent) {
      this.hoveredEvent = nextEvent;
      if (this.hoveredEvent) {
        const markerId = hit.object.userData.markerId ?? this.hoveredEvent.id ?? this.hoveredEvent.name;
        this.hoveredEvent.debugWorldPosition = this.getMarkerWorldPosition(markerId, this.tmpWorld)?.toArray() ?? null;
      }
      this.callbacks.onEventHover?.(this.hoveredEvent);
    }
  }

  #resolveBestPointerHit(hits) {
    if (!hits.length) return null;
    const hitTesting = this.config.pinPlacement?.hitTesting ?? {};
    if (hitTesting.screenSpaceSelection === false || hits.length === 1) return hits[0];

    const depthTieBreaker = hitTesting.depthTieBreaker ?? 0.015;
    const hoverHysteresis = hitTesting.hoverHysteresis ?? 0.18;
    const hoveredId = this.hoveredEvent
      ? String(this.hoveredEvent.id ?? this.hoveredEvent.name)
      : null;
    let bestHit = hits[0];
    let bestScore = Infinity;

    for (const hit of hits) {
      const markerId = String(hit.object.userData.markerId ?? "");
      const worldPosition = this.getMarkerWorldPosition(markerId, this.tmpWorld);
      if (!worldPosition) continue;
      this.tmpProjected.copy(worldPosition).project(this.renderer.camera);
      const dx = this.tmpProjected.x - this.pointer.x;
      const dy = this.tmpProjected.y - this.pointer.y;
      let score = dx * dx + dy * dy + hit.distance * depthTieBreaker * 0.001;
      if (markerId === hoveredId) score *= 1 - hoverHysteresis;
      if (score < bestScore) {
        bestScore = score;
        bestHit = hit;
      }
    }

    return bestHit;
  }

  #buildMarkerView(marker, style, entityType) {
    const globeMarker = new GlobeMarker({
      id: marker.id,
      labelTitle: marker.labelTitle,
      labelSubtitle: marker.labelSubtitle,
      labelCountryIso2: marker.labelCountryIso2,
      labelLogoUrl: marker.event?.organization?.logoImageUrl ?? marker.event?.listing?.logoImageUrl ?? marker.event?.logoImageUrl ?? "",
      position: marker.spreadAnchorPosition,
      radialDirection: marker.spreadRadialDirection,
      styleOverrides: style,
      markerType: "listing",
      variant: entityType,
      config: this.config,
      referenceDistance: this.labelReferenceDistance,
      labelOverlayRoot: this.labelOverlayRoot
    });
    globeMarker.group.userData.event = marker.event;
    globeMarker.hitTarget.userData.event = marker.event;
    globeMarker.hitTarget.userData.markerId = marker.id;
    this.group.add(globeMarker.group);
    const view = {
      marker,
      globeMarker,
      markerGroup: globeMarker.group,
      currentGeographicMix: 0,
      currentPresentationOpacity: this.config.pinPlacement.showOnlySelectedEvent ? 0 : 1,
      spreadQuaternion: makeSurfaceQuaternion(marker.spreadRadialDirection),
      trueQuaternion: makeSurfaceQuaternion(marker.trueRadialDirection)
    };
    this.markerViews.push(view);
    this.markerMap.set(marker.id, view);
    this.hitTargets.push(globeMarker.hitTarget);
  }

  #buildAnchorView(marker) {
    const anchor = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 12, 8),
      new THREE.MeshBasicMaterial({
        color: this.config.colors.lightText,
        transparent: true,
        opacity: 0.86,
        depthWrite: false
      })
    );
    anchor.position.copy(marker.surfacePosition);
    anchor.renderOrder = 21;
    this.group.add(anchor);
    this.anchorViews.push(anchor);
  }

  #updateView(view, deltaSeconds) {
    const eventId = String(view.marker.event.id ?? view.marker.event.name);
    const isHovered = this.hoveredEvent && String(this.hoveredEvent.id ?? this.hoveredEvent.name) === eventId;
    const isSelected = this.selectedEvent && String(this.selectedEvent.id ?? this.selectedEvent.name) === eventId;
    const selectedOnly = Boolean(this.config.pinPlacement.showOnlySelectedEvent);
    const presentationTarget = !selectedOnly || (isSelected && this.selectionPresentationVisible) ? 1 : 0;
    const fadeSeconds = presentationTarget > view.currentPresentationOpacity
      ? this.config.selection.fadeInSeconds
      : this.config.selection.fadeOutSeconds;
    const presentationLerpFactor = fadeSeconds > 0
      ? 1 - Math.pow(0.001, Math.min(deltaSeconds, 0.1) / fadeSeconds)
      : 1;
    view.currentPresentationOpacity = THREE.MathUtils.lerp(
      view.currentPresentationOpacity,
      presentationTarget,
      presentationLerpFactor
    );
    const isHeroTarget = Boolean(isSelected && this.heroStudioCaptureState !== "idle");
    const hasSavedHeroEndpoint = Boolean(
      isSelected && (this.heroStudioCaptureState === "endpoint-captured" || this.heroStudioCaptureState === "previewing")
    );
    const lerpFactor = 1 - Math.pow(0.001, Math.min(deltaSeconds, 0.1));
    view.currentGeographicMix = THREE.MathUtils.lerp(
      view.currentGeographicMix,
      isSelected ? 1 : 0,
      lerpFactor
    );
    view.markerGroup.position.lerpVectors(
      view.marker.spreadAnchorPosition,
      view.marker.trueAnchorPosition,
      view.currentGeographicMix
    );
    view.markerGroup.quaternion.slerpQuaternions(
      view.spreadQuaternion,
      view.trueQuaternion,
      view.currentGeographicMix
    );
    view.globeMarker.update({
      hovered: Boolean(isHovered),
      selected: Boolean(isSelected),
      attention: this.attentionEmphasis && !isSelected,
      heroTarget: isHeroTarget,
      saved: hasSavedHeroEndpoint,
      delta: deltaSeconds,
      cameraDistance: this.#getCameraZoomDistance(),
      camera: this.renderer.camera,
      domElement: this.renderer.renderer.domElement,
      globe: this.renderer.globe,
      presentationOpacity: view.currentPresentationOpacity
    });
    view.animationActive = Boolean(
      isHovered ||
      view.globeMarker.arrivalPulse > 0.01 ||
      Math.abs(view.currentPresentationOpacity - presentationTarget) > 0.01 ||
      Math.abs(view.currentGeographicMix - (isSelected ? 1 : 0)) > 0.01
    );
  }

  #getCameraZoomDistance() {
    const target = this.renderer.controls?.target ?? this.renderer.globe?.position ?? this.group.position;
    return this.renderer.camera.position.distanceTo(target);
  }

  #syncGlobeRotation() {
    this.group.rotation.y = this.renderer.visibleLandMesh?.rotation.y ?? 0;
    this.group.updateWorldMatrix(true, false);
  }

  #resolveLandSurfaceAnchor(lonDeg, latDeg) {
    return resolveRenderedGlobeLandSurfaceAnchor({
      lng: lonDeg,
      lat: latDeg,
      config: this.config,
      globeRadius: this.renderer.globeRadius,
      landHitMesh: this.renderer.landHitMesh,
      raycaster: this.raycaster,
      origin: this.tmpOrigin,
      direction: this.tmpDirection,
      candidate: this.tmpCandidate
    });
  }

  #logClickTravelVectors(view, focusWorldPosition) {
    if (!focusWorldPosition) return;
    const pinWorldPosition = this.getMarkerTrueWorldPosition(view.marker.id, this.tmpPinWorld);
    if (!pinWorldPosition) return;
    const globeCenter = this.renderer.globe.getWorldPosition(this.tmpWorld);
    const pinNormal = pinWorldPosition.clone().sub(globeCenter).normalize();
    const focusNormal = focusWorldPosition.clone().sub(globeCenter).normalize();
    console.info("[SwingSphere] Globe pin travel vectors", {
      clickedListingId: view.marker.event.listingId ?? view.marker.event.id ?? view.marker.id,
      clickedListingName: view.marker.event.name ?? view.marker.name,
      canonicalLngLat: {
        lng: view.marker.event.lon,
        lat: view.marker.event.lat
      },
      pinRenderedLngLat: {
        lng: view.marker.event.lon,
        lat: view.marker.event.lat
      },
      pinWorldPosition: pinWorldPosition.toArray(),
      focusWorldPosition: focusWorldPosition.toArray(),
      pinWorldNormalized: pinNormal.toArray(),
      focusWorldNormalized: focusNormal.toArray(),
      pinFocusDot: pinNormal.dot(focusNormal)
    });
  }

  #clearMarkers() {
    const disposeStartedAt = performance.now();
    const disposedPinCount = this.markerViews.length;
    for (const view of this.markerViews) {
      this.group.remove(view.markerGroup);
      view.globeMarker.dispose();
    }
    this.markerViews = [];
    this.markerMap.clear();
    this.hitTargets = [];
    this.hoveredEvent = null;
    this.selectedEvent = null;
    for (const anchor of this.anchorViews) {
      this.group.remove(anchor);
      disposeObject3D(anchor);
    }
    this.anchorViews = [];
    this.lifecycleStats.disposedPinCount += disposedPinCount;
    this.lifecycleStats.lastDisposeDurationMs = performance.now() - disposeStartedAt;
    this.lifecycleStats.constructedPinCount = 0;
    this.lifecycleStats.retainedPinMeshCount = 0;
    this.lifecycleStats.retainedLabelNodeCount = countDescendantElements(this.labelOverlayRoot);
    this.lifecycleStats.retainedAnchorCount = 0;
  }
}

function countDescendantElements(root) {
  if (!root) return 0;
  return root.querySelectorAll("*").length;
}

function buildRegionalDisplayCoordinates(events, spreadConfig = {}) {
  const coordinates = new Map();
  if (!spreadConfig.enabled || !events.length) return coordinates;

  const threshold = spreadConfig.proximityThresholdDeg ?? 1.5;
  const groups = [];

  // Group by geographic proximity
  for (const event of events) {
    let joinedGroup = false;
    for (const group of groups) {
      const centerLat = group.reduce((sum, e) => sum + e.lat, 0) / group.length;
      const centerLon = group.reduce((sum, e) => sum + e.lon, 0) / group.length;
      const dLat = event.lat - centerLat;
      const dLon = event.lon - centerLon;
      const dist = Math.sqrt(dLat * dLat + dLon * dLon);

      if (dist < threshold) {
        group.push(event);
        joinedGroup = true;
        break;
      }
    }
    if (!joinedGroup) {
      groups.push([event]);
    }
  }

  const ringCapacity = Math.max(2, Math.floor(spreadConfig.ringCapacity ?? 8));
  for (const group of groups) {
    if (group.length < 2) continue;
    
    const sorted = [...group].sort((a, b) => String(a.id ?? a.name).localeCompare(String(b.id ?? b.name)));
    const centerLat = sorted.reduce((sum, event) => sum + event.lat, 0) / sorted.length;
    const centerLon = sorted.reduce((sum, event) => sum + event.lon, 0) / sorted.length;
    const longitudeScale = Math.max(Math.cos(THREE.MathUtils.degToRad(centerLat)), 0.35);

    for (let index = 0; index < sorted.length; index += 1) {
      const ring = Math.floor(index / ringCapacity);
      const ringStart = ring * ringCapacity;
      const ringCount = Math.min(ringCapacity, sorted.length - ringStart);
      const slot = index - ringStart;
      const angle = (slot / ringCount) * Math.PI * 2 - Math.PI * 0.5;
      const radius = (spreadConfig.innerRadiusDeg ?? 0.4) + ring * (spreadConfig.ringStepDeg ?? 0.3);
      const event = sorted[index];
      
      coordinates.set(String(event.id ?? event.name), {
        lat: THREE.MathUtils.clamp(centerLat + Math.cos(angle) * radius, -89.5, 89.5),
        lon: centerLon + (Math.sin(angle) * radius) / longitudeScale
      });
    }
  }
  return coordinates;
}

function getEntityMarkerPalette(entityType, config, pin) {
  if (entityType === "club") {
    return { base: "#E3263E", active: "#FF5367" };
  }
  if (entityType === "promoter") {
    return { base: "#20B8C7", active: "#67E8F9" };
  }
  return { base: "#D6A62E", active: "#F4C95D" };
}

function formatLocationSubtitle(event) {
  return event?.listing?.geopoint?.address?.city ?? event?.city ?? "";
}

function resolveCountryIso2(event) {
  return normalizeCountryIso2(
    event?.countryIso2
      ?? event?.iso2
      ?? event?.listing?.countryIso2
      ?? event?.countryIso3
      ?? event?.iso3
      ?? event?.listing?.geopoint?.address?.country
  );
}

function normalizeCountryIso2(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  const iso3ToIso2 = {
    AUS: "AU",
    GBR: "GB",
    USA: "US"
  };
  const countryNameToIso2 = {
    AUSTRALIA: "AU",
    "UNITED KINGDOM": "GB",
    UK: "GB",
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    USA: "US"
  };
  return iso3ToIso2[normalized] ?? countryNameToIso2[normalized] ?? "";
}

function createLabelOverlayRoot(container) {
  const root = document.createElement("div");
  root.className = "swingsphere-globe-label-overlay";
  Object.assign(root.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    overflow: "visible",
    zIndex: "30",
    contain: "layout style"
  });
  if (container) {
    const position = getComputedStyle(container).position;
    if (position === "static") container.style.position = "relative";
    container.appendChild(root);
  }
  return root;
}

function isSpatialDebugEnabled() {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem("swingsphere.spatialDebug") === "true";
  } catch {
    return false;
  }
}

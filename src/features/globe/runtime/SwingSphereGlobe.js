import * as THREE from "three";
import { applyPresentationCompatibility, createGlobeRuntimeConfig } from "./GlobeRuntimeConfig.js";
import { cloneGlobePresentation, mergeGlobePresentation } from "./GlobePresentationConfig.js";
import { GlobeAssetLoader } from "./GlobeAssetLoader.js";
import { GlobeRenderer } from "./GlobeRenderer.js";
import { resolveAdaptiveClusterDecision } from "./mobileRuntimePolicy.js";
import { AtmosphereRenderer } from "./AtmosphereRenderer.js";
import { CountrySelectionManager } from "./CountrySelectionManager.js";
import { CountryGeoJsonBorderLayer } from "./CountryGeoJsonBorderLayer.js";
import { CountryVectorBorderLayer } from "./CountryVectorBorderLayer.js";
import { CountryVectorActivityLayer } from "./CountryVectorActivityLayer.js";
import { PinManager } from "./PinManager.js";
import { CameraFocusController, easeByName } from "./CameraFocusController.js";
import { ExplorerNavigationController } from "./ExplorerNavigationController.js";
import { ActivityRegionManager } from "./ActivityRegionManager.js";
import { AdministrativeBoundaryLayer } from "./AdministrativeBoundaryLayer.js";
import { GeospatialCalibrationLayer } from "./GeospatialCalibrationLayer.js";
import {
  geographicToLocalPosition,
  localPositionToLonLat,
  renderedGlobeLocalToWgs84,
  wgs84ToRenderedGlobeLocal,
  wrapDegrees
} from "./math/geoProjection.js";

const CALLBACK_NAMES = [
  "onReady",
  "onError",
  "onCountryHover",
  "onCountrySelect",
  "onCountryGeoJsonDiagnostics",
  "onEventHover",
  "onEventSelect",
  "onEventLabelActivate",
  "onActivityRegionSelect",
  "onDiscoveryModeChange",
  "onNavigationChange",
  "onFocusArrival",
  "onSurfaceDoubleClick",
  "onContextLost",
  "onContextRestored",
  "onPerformanceSnapshot",
  "onInteractionEnd"
];

export class SwingSphereGlobe {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.config = createGlobeRuntimeConfig(options.config ?? {});
    this.callbacks = CALLBACK_NAMES.reduce((callbacks, name) => {
      callbacks[name] = typeof options[name] === "function" ? options[name] : null;
      return callbacks;
    }, {});
    this.events = Array.isArray(options.events) ? options.events : [];
    this.countryActivityEvents = this.events;
    this.activityRegions = Array.isArray(options.activityRegions) ? options.activityRegions : [];
    this.clusterRegions = [];
    this.countryOverviewEvents = [];
    this.adaptiveClusteredRegionIds = new Set();
    this.lastAdaptiveClusterDistance = null;
    this.lastAdaptiveClusterCameraQuaternion = new THREE.Quaternion();
    this.hasAdaptiveClusterCameraQuaternion = false;
    this.adaptiveProjectionTarget = new THREE.Vector3();
    this.activeActivityRegion = null;
    this.directPinsVisible = false;
    this.countryOverviewVisible = false;
    this.lastNavigationSnapshot = null;
    this.navigationRaycaster = new THREE.Raycaster();
    this.navigationScreenCenter = new THREE.Vector2(0, 0);
    this.navigationGlobeCenter = new THREE.Vector3();
    this.navigationSphere = new THREE.Sphere();
    this.navigationIntersection = new THREE.Vector3();
    this.navigationYAxis = new THREE.Vector3(0, 1, 0);
    this.heroComposerTarget = new THREE.Vector3();
    this.eventNavigationTarget = new THREE.Vector3();
    this.heroStudioPoseListener = null;
    this.heroStudioLastPoseSignature = "";
    this.heroStudioPoseSource = "production";
    this.heroStudioDefaultPose = null;
    this.heroStudioPreparedEvent = null;
    this.ready = false;
    this.disposed = false;
    this.mounting = false;
  }

  async mount() {
    if (this.disposed || this.ready || this.mounting) return this;
    this.mounting = true;
    try {
      const loader = new GlobeAssetLoader(this.config);
      this.assets = await loader.load();
      this.#assertUsable();
      this.renderer = new GlobeRenderer({
        container: this.container,
        assets: this.assets,
        config: this.config,
        onInteractionEnd: () => this.callbacks.onInteractionEnd?.(),
        onContextLost: () => this.callbacks.onContextLost?.(),
        onContextRestored: () => this.callbacks.onContextRestored?.()
      });
      this.debugBaseTransforms = {
        land: captureTransform(this.renderer.visibleLandMesh),
        ocean: captureTransform(this.renderer.oceanMesh)
      };
      this.debugState = createDefaultDebugState();
      this.#createDebugCameraTarget();
      this.atmosphere = new AtmosphereRenderer({
        scene: this.renderer.scene,
        globe: this.renderer.globe,
        camera: this.renderer.camera,
        globeRadius: this.renderer.globeRadius,
        config: this.config
      });
      this.cameraFocus = new CameraFocusController({
        camera: this.renderer.camera,
        controls: this.renderer.controls,
        globe: this.renderer.globe,
        config: this.config,
        globeRadius: this.renderer.globeRadius
      });
      this.navigationController = new ExplorerNavigationController({
        cameraFocus: this.cameraFocus,
        config: this.config
      });
      const pinCallbacks = {
        ...this.callbacks,
        onEventSelect: (event) => {
          return this.#handleEventSelectionRequest(event);
        }
      };
      this.pinManager = new PinManager({
        renderer: this.renderer,
        config: this.config,
        callbacks: pinCallbacks
      });
      this.activityRegionManager = new ActivityRegionManager({
        renderer: this.renderer,
        config: this.config,
        onSelect: (region, worldPosition, elapsed) => {
          if (region.listingIds && region.listingIds.length === 1) {
            this.selectEvent(region.listingIds[0]);
            return;
          }
          this.#activateActivityRegion(region);
          this.callbacks.onActivityRegionSelect?.(region);
          this.navigationController.selectRegion({
            worldPosition,
            elapsed,
            focusDistance: this.config.progressiveDisclosure.clusterFocusDistance
          });
        }
      });
      if (this.config.countryGeoJson?.enabled) {
        this.countryGeoJsonBorders = new CountryGeoJsonBorderLayer({
          renderer: this.renderer,
          config: this.config,
          onDiagnostics: (diagnostics) => this.callbacks.onCountryGeoJsonDiagnostics?.(diagnostics)
        });
        await this.countryGeoJsonBorders.mount();
      }
      const wgs84BoundaryConfig = createWgs84BoundaryConfig(this.config);
      if (this.config.countryVectorBorders?.enabled) {
        this.countryVectorBorders = new CountryVectorBorderLayer({ renderer: this.renderer, config: wgs84BoundaryConfig });
        await this.countryVectorBorders.mount();
      }
      if (this.config.countryVectorActivity?.enabled) {
        this.countryVectorActivity = new CountryVectorActivityLayer({ renderer: this.renderer, config: wgs84BoundaryConfig });
        await this.countryVectorActivity.mount();
      }
      if (this.config.administrativeBoundaries?.enabled) {
        this.administrativeBoundaries = new AdministrativeBoundaryLayer({ renderer: this.renderer, config: wgs84BoundaryConfig });
        await this.administrativeBoundaries.mount();
      }
      if (this.config.geospatialCalibration?.enabled) {
        this.geospatialCalibration = new GeospatialCalibrationLayer({ renderer: this.renderer, config: this.config });
        this.geospatialCalibration.mount();
      }
      if (this.config.landCoastlineAudit?.enabled) {
        const { LandCoastlineAuditLayer } = await import("./LandCoastlineAuditLayer.js");
        this.landCoastlineAudit = new LandCoastlineAuditLayer({ renderer: this.renderer, config: this.config });
        await this.landCoastlineAudit.mount();
      }
      if (this.config.hybridBorderAudit?.enabled) {
        const { HybridCountryBorderAuditLayer } = await import("./HybridCountryBorderAuditLayer.js");
        this.hybridBorderAudit = new HybridCountryBorderAuditLayer({ renderer: this.renderer, config: this.config });
        await this.hybridBorderAudit.mount();
      }
      this.countrySelection = new CountrySelectionManager({
        renderer: this.renderer,
        assets: this.assets,
        config: this.config,
        callbacks: {
          ...this.callbacks,
          onCountryHover: (country, sample) => {
            this.countryGeoJsonBorders?.setHoveredCountry(country);
            this.countryVectorActivity?.setHoveredCountry(country);
            this.callbacks.onCountryHover?.(country, sample);
          },
          onCountrySelect: (country) => {
            this.countryGeoJsonBorders?.setSelectedCountry(country);
            this.countryVectorActivity?.setSelectedCountry(country);
            this.countryVectorBorders?.setSelectedCountry(country);
            this.hybridBorderAudit?.setSelectedCountry(country);
            this.callbacks.onCountrySelect?.(country);
          },
          onSurfaceDblClick: () => {
            this.returnToWorld();
            this.callbacks.onSurfaceDoubleClick?.();
          },
          onCountryFocusRequest: (worldPosition, elapsed, country) => {
            const activityFocus = this.#resolveCountryActivityFocus(country, worldPosition);
            this.navigationController.selectCountry({
              worldPosition: activityFocus.worldPosition,
              elapsed,
              focusDistance: activityFocus.focusDistance
            });
          }
        },
        pinManager: this.pinManager,
        activityRegionManager: this.activityRegionManager
      });
      this.renderer.setPerformanceStatsProvider(() => {
        const pinStats = this.pinManager?.getPerformanceStats?.() ?? {};
        const regionStats = this.activityRegionManager?.getPerformanceStats?.() ?? {};
        return {
          ...pinStats,
          ...regionStats,
          hoverActive: Boolean(pinStats.hoverActive || regionStats.hoverActive),
          activeListenerCount: (pinStats.activeListenerCount ?? 0) + (regionStats.activeListenerCount ?? 0)
        };
      });
      this.removePerformanceListener = this.renderer.addPerformanceListener((snapshot) => {
        this.callbacks.onPerformanceSnapshot?.(snapshot);
      });
      this.renderer.onInteraction = () => {
        this.countrySelection?.markDirty();
        if (this.pinManager) this.pinManager.dirty = true;
      };
      this.updateEvents(this.events);
      this.updateActivityRegions(this.activityRegions);
      let readyEmitted = false;
      let startupFrameCount = 0;
      this.removeFrameListener = this.renderer.addFrameListener(({ delta, elapsed }) => {
        const completedFocus = this.navigationController.update(elapsed);
        this.#updateProgressiveDisclosure();
        this.#refreshAdaptiveCountryOverviewIfNeeded(Boolean(completedFocus));
        this.#emitNavigationChange();
        if (completedFocus?.arrivalMode === "accurate-center") {
          this.pinManager.playSelectedArrivalPulse();
          this.#publishFocusArrivalDebug(completedFocus);
          this.callbacks.onFocusArrival?.({
            selectedEventId: this.pinManager?.selectedEvent
              ? String(this.pinManager.selectedEvent.listingId ?? this.pinManager.selectedEvent.id ?? this.pinManager.selectedEvent.name)
              : null,
            activeActivityRegionId: this.activeActivityRegion?.id ?? null
          });
        }
        this.atmosphere.update();
        this.pinManager.update(delta, elapsed);
        this.activityRegionManager.update(delta, this.activeActivityRegion?.id);
        this.countrySelection.update(delta, elapsed);
        this.countryGeoJsonBorders?.update(elapsed);
        this.countryVectorActivity?.update(elapsed);
        this.countryVectorBorders?.update(elapsed);
        this.administrativeBoundaries?.update(elapsed);
        this.geospatialCalibration?.update(elapsed);
        const pinActivity = this.pinManager?.getActivityState?.() ?? {};
        const regionActivity = this.activityRegionManager?.getActivityState?.() ?? {};
        this.renderer.setActivityState({
          cameraTravel: this.navigationController.isFocusActive(),
          hover: Boolean(
            pinActivity.hoverActive
            || regionActivity.hoverActive
            || this.countrySelection?.hoverRegion
          ),
          selectionAnimation: Boolean(pinActivity.selectionAnimationActive),
          ambientAnimation: Boolean(
            pinActivity.attentionActive
            || regionActivity.attentionActive
            || this.countryVectorBorders?.isAnimationActive?.()
          )
        });
        startupFrameCount += 1;
        // Keep the loading state through two completed WebGL/composer frames.
        // The first frame can pay shader compilation/render-target allocation
        // costs; revealing React overlays before that settles produces a
        // one-time hitch at the start of the globe's visible rotation.
        if (!readyEmitted && startupFrameCount >= 3) {
          readyEmitted = true;
          this.ready = true;
          this.heroStudioDefaultPose = this.#createHeroStudioPose();
          this.callbacks.onReady?.();
        }
        this.#emitHeroStudioPoseChange();
      });
      this.setQualityTier(this.config.quality?.currentTier ?? "high");
      this.renderer.start();
      this.mounting = false;
      return this;
    } catch (error) {
      this.mounting = false;
      this.#emitError(error);
      this.dispose();
      return this;
    }
  }

  updateEvents(events = []) {
    if (this.disposed) return;
    this.events = Array.isArray(events) ? events : [];
    this.countrySelection?.updateEvents(this.events);
    this.pinManager?.updateEvents(this.#getActiveRegionEvents());
  }

  setCountryActivityCountries(countries = []) {
    if (this.disposed) return;
    this.countryGeoJsonBorders?.setActivityCountries(countries);
    this.countryVectorActivity?.setActivityCountries(countries);
  }

  setDirectPinsVisible(visible) {
    if (this.disposed) return;
    this.directPinsVisible = Boolean(visible);
    this.pinManager?.setVisible(this.directPinsVisible || Boolean(this.pinManager?.selectedEvent));
    this.activityRegionManager?.setVisible(!this.directPinsVisible && !this.pinManager?.selectedEvent);
  }

  setCountryDiscoveryEmphasis(enabled) {
    if (this.disposed) return;
    const active = Boolean(enabled);
    this.activityRegionManager?.setAttentionEmphasis(active);
    this.pinManager?.setAttentionEmphasis(active);
  }

  setCountryActivityEvents(events = []) {
    if (this.disposed) return;
    this.countryActivityEvents = Array.isArray(events) ? events : [];
    this.countrySelection?.updateEvents(this.countryActivityEvents);
  }

  updateVisibleEvents(events = []) {
    if (this.disposed) return;
    this.events = Array.isArray(events) ? events : [];
    this.countryOverviewVisible = this.events.length > 0;
    this.#refreshCountryOverviewData();
    this.pinManager?.updateEvents(this.#getRenderableEvents());
    this.#syncDiscoveryLayerVisibility();
  }

  setAdministrativeBoundaryIds(ids = []) {
    if (this.disposed) return;
    const activeIds = Array.isArray(ids) ? ids : [];
    this.administrativeBoundaries?.setActiveIds(activeIds);
    if (this.config.administrativeBoundaries?.deemphasizeCountryHighlight) {
      this.countrySelection?.setHighlightVisible(activeIds.length === 0);
    }
  }

  setGeospatialCalibrationState({
    visible,
    longitudeOffsetDeg,
    latitudeOffsetDeg,
    pinLongitudeOffsetDeg,
    pinLatitudeOffsetDeg,
    geoJsonLongitudeOffsetDeg,
    geoJsonLatitudeOffsetDeg,
    countryAtlasLongitudeOffsetDeg,
    countryAtlasLatitudeOffsetDeg,
    showCountryIdTexture,
    showVisualCountryAtlas,
    showCountryHighlightMask,
    showAuthoritativeBorders
  } = {}) {
    if (this.disposed) return;

    // Keep the legacy shared offsets as fallbacks while allowing the hybrid
    // alignment bench to move each geospatial representation independently.
    const pinLongitude = Number.isFinite(pinLongitudeOffsetDeg) ? pinLongitudeOffsetDeg : longitudeOffsetDeg;
    const pinLatitude = Number.isFinite(pinLatitudeOffsetDeg) ? pinLatitudeOffsetDeg : latitudeOffsetDeg;
    const geoJsonLongitude = Number.isFinite(geoJsonLongitudeOffsetDeg) ? geoJsonLongitudeOffsetDeg : longitudeOffsetDeg;
    const geoJsonLatitude = Number.isFinite(geoJsonLatitudeOffsetDeg) ? geoJsonLatitudeOffsetDeg : latitudeOffsetDeg;

    const alignmentPatch = {};
    if (Number.isFinite(pinLongitude)) alignmentPatch.pinLongitudeOffsetDeg = pinLongitude;
    if (Number.isFinite(pinLatitude)) alignmentPatch.pinLatitudeOffsetDeg = pinLatitude;
    if (Object.keys(alignmentPatch).length) deepMerge(this.config, { alignment: alignmentPatch });

    if (typeof visible === "boolean") this.geospatialCalibration?.setVisible(visible);
    this.geospatialCalibration?.refreshPositions();

    if (Number.isFinite(geoJsonLongitude) || Number.isFinite(geoJsonLatitude)) {
      this.countryGeoJsonBorders?.updateAlignment({
        longitudeOffsetDeg: Number.isFinite(geoJsonLongitude) ? geoJsonLongitude : undefined,
        latitudeOffsetDeg: Number.isFinite(geoJsonLatitude) ? geoJsonLatitude : undefined
      });
    }

    const countryAtlas = {};
    if (Number.isFinite(countryAtlasLongitudeOffsetDeg)) countryAtlas.longitudeOffsetDeg = countryAtlasLongitudeOffsetDeg;
    if (Number.isFinite(countryAtlasLatitudeOffsetDeg)) countryAtlas.latitudeOffsetDeg = countryAtlasLatitudeOffsetDeg;
    if (
      Object.keys(countryAtlas).length
      || typeof showCountryIdTexture === "boolean"
      || typeof showVisualCountryAtlas === "boolean"
      || typeof showCountryHighlightMask === "boolean"
    ) {
      this.countrySelection?.updateDebugView({
        ...(Object.keys(countryAtlas).length ? { countryAtlas } : {}),
        ...(typeof showCountryIdTexture === "boolean" ? { showCountryIdTexture } : {}),
        ...(typeof showVisualCountryAtlas === "boolean" ? { showVisualCountryAtlas } : {}),
        ...(typeof showCountryHighlightMask === "boolean" ? { showCountryHighlightMask } : {})
      });
    }

    if (
      Number.isFinite(pinLongitude)
      || Number.isFinite(pinLatitude)
      || Number.isFinite(geoJsonLongitude)
      || Number.isFinite(geoJsonLatitude)
      || Object.keys(countryAtlas).length
    ) {
      const selectedEventId = this.pinManager?.selectedEvent
        ? String(this.pinManager.selectedEvent.id ?? this.pinManager.selectedEvent.name)
        : null;
      this.pinManager?.updateEvents(this.#getRenderableEvents());
      if (selectedEventId) this.pinManager?.setSelectedEventSilently(selectedEventId);
      this.activityRegionManager?.updateRegions(this.#getClusterRegions());
      this.#syncDiscoveryLayerVisibility();
      this.lastNavigationSnapshot = null;
    }

    if (typeof showAuthoritativeBorders === "boolean") {
      this.countryGeoJsonBorders?.setVisible(true);
      this.countryGeoJsonBorders?.updateStateStyles({ baseOpacity: showAuthoritativeBorders ? 0.72 : 0 });
      this.countryVectorBorders?.setVisible(!showAuthoritativeBorders);
      this.countryVectorActivity?.setVisible(!showAuthoritativeBorders);
      this.administrativeBoundaries?.setVisible(!showAuthoritativeBorders);
    }
    this.renderer?.noteInteraction?.();
  }

  updateActivityRegions(regions = []) {
    if (this.disposed) return;
    this.activityRegions = Array.isArray(regions) ? regions : [];
    this.#refreshCountryOverviewData();
    this.activityRegionManager?.updateRegions(this.#getClusterRegions());
    this.pinManager?.updateEvents(this.#getRenderableEvents());
    if (this.activeActivityRegion) {
      const previousRegion = this.activeActivityRegion;
      this.activeActivityRegion = this.activityRegions.find((region) => region.id === previousRegion.id) ?? null;
      if (!this.activeActivityRegion) {
        // The country/discovery scope changed underneath an active cluster.
        // Reset the runtime-owned disclosure mode instead of leaving stale
        // direct pins visible until React catches up.
        this.directPinsVisible = false;
        this.pinManager?.clearSelection();
        this.#syncDiscoveryLayerVisibility();
        this.callbacks.onDiscoveryModeChange?.(null);
      }
    }
    this.#syncDiscoveryLayerVisibility();
  }

  updateAtmosphereConfig(atmosphereConfig = {}) {
    if (this.disposed) return;
    deepMerge(this.config, atmosphereConfig);
    this.atmosphere?.updateConfig(this.config);
  }

  updatePresentationConfig(presentationConfig = {}, options = {}) {
    if (this.disposed) return null;
    this.config.presentation = mergeGlobePresentation(this.config.presentation, presentationConfig);
    applyPresentationCompatibility(this.config);
    const selectedEventId = this.pinManager?.selectedEvent
      ? String(this.pinManager.selectedEvent.id ?? this.pinManager.selectedEvent.name)
      : null;
    this.renderer?.applyPresentationConfig(this.config.presentation, {
      frameWorld: options.frameWorld !== false
    });
    this.atmosphere?.updatePresentationConfig(this.config.presentation);
    if (this.cameraFocus) this.cameraFocus.defaultCameraFov = this.config.renderer.cameraFov;
    this.pinManager?.updateEvents(this.#getRenderableEvents());
    if (selectedEventId) this.pinManager?.setSelectedEventSilently(selectedEventId);
    this.activityRegionManager?.updateRegions(this.#getClusterRegions());
    this.#syncDiscoveryLayerVisibility();
    this.countrySelection?.markDirty();
    this.lastNavigationSnapshot = null;
    this.#emitNavigationChange();
    return this.getPresentationConfig();
  }

  getPresentationConfig() {
    return cloneGlobePresentation(this.config.presentation);
  }

  updatePinAlignmentDebugConfig(debugConfig = {}) {
    if (this.disposed) return;
    const alignment = debugConfig.alignment ?? {};
    this.updateAlignmentDebugConfig({
      pins: {
        longitudeSign: alignment.pinLongitudeSign,
        longitudeOffsetDeg: alignment.pinLongitudeOffsetDeg,
        latitudeOffsetDeg: alignment.pinLatitudeOffsetDeg,
        latitudeSign: alignment.pinLatitudeSign
      },
      toggles: {
        showPinAnchors: debugConfig.pinPlacement?.showPinAnchors
      }
    });
  }

  updateAlignmentDebugConfig(debugConfig = {}) {
    if (this.disposed) return;
    this.debugState = mergeDebugState(this.debugState ?? createDefaultDebugState(), debugConfig);
    deepMerge(this.config, {
      alignment: {
        pinLongitudeSign: this.debugState.pins.longitudeSign,
        pinLongitudeOffsetDeg: this.debugState.pins.longitudeOffsetDeg,
        pinLatitudeOffsetDeg: this.debugState.pins.latitudeOffsetDeg,
        pinLatitudeSign: this.debugState.pins.latitudeSign
      },
      pinPlacement: {
        showPinAnchors: this.debugState.toggles.showPinAnchors,
        showEventLabels: this.debugState.toggles.showEventLabels
      }
    });
    this.#applyLandDebugState();
    this.#applyMeshVisibilityDebugState();
    this.countrySelection?.updateDebugView({
      countryAtlas: this.debugState.countryAtlas,
      showCountryHighlightMask: this.debugState.toggles.showCountryHighlightMask,
      showCountryIdTexture: this.debugState.toggles.showCountryIdTexture,
      showVisualCountryAtlas: this.debugState.toggles.showVisualCountryAtlas,
      countryIdTextureOpacity: this.debugState.opacity.countryIdTexture,
      visualAtlasOpacity: this.debugState.opacity.visualAtlas,
      highlightMaskOpacity: this.debugState.opacity.highlightMask
    });
    this.countryGeoJsonBorders?.updateAlignment(debugConfig.countryGeoJson ?? {});
    const selectedEventId = this.pinManager?.selectedEvent
      ? String(this.pinManager.selectedEvent.id ?? this.pinManager.selectedEvent.name)
      : null;
    this.pinManager?.updateEvents(this.#getRenderableEvents());
    if (selectedEventId) this.pinManager?.setSelectedEventSilently(selectedEventId);
    this.#syncDiscoveryLayerVisibility();
    this.#updateCameraTargetDebugMarker(this.pinManager?.selectedEvent ?? null);
  }

  updateDebugView(debugConfig = {}) {
    if (this.disposed) return;
    this.countrySelection?.updateDebugView(debugConfig);
  }

  setIdleMotionSuppressed(suppressed = false) {
    if (this.disposed) return;
    this.renderer?.setIdleMotionSuppressed(Boolean(suppressed));
  }

  start() {
    if (this.disposed) return;
    this.renderer?.start();
  }

  stop() {
    if (this.disposed) return;
    this.renderer?.stop();
  }

  setTransitionActive(active = false) {
    if (this.disposed) return;
    this.renderer?.setTransitionActive(active);
  }

  setQualityTier(tier = "high") {
    if (this.disposed) return;
    if (this.config.quality) this.config.quality.currentTier = tier;
    this.renderer?.setQualityTier(tier);
    this.atmosphere?.setQualityTier(tier);
  }

  getPerformanceSnapshot() {
    return this.renderer?.getPerformanceSnapshot?.() ?? null;
  }

  setIdleMotionSpeedMultiplier(multiplier = 1) {
    if (this.disposed) return;
    this.renderer?.setIdleMotionSpeedMultiplier(multiplier);
  }

  setHeroStudioPoseListener(listener = null) {
    this.heroStudioPoseListener = typeof listener === "function" ? listener : null;
    this.heroStudioLastPoseSignature = "";
    if (this.heroStudioPoseListener && this.#canUseRuntime()) this.#emitHeroStudioPoseChange(true);
  }

  setHeroStudioPlaybackActive(active = false) {
    if (!this.#canUseRuntime()) return;
    this.renderer.setControlsUpdateSuppressed(Boolean(active));
  }

  setHeroStudioControlsEnabled(enabled = true) {
    if (!this.#canUseRuntime() || this.renderer.controlsUpdateSuppressed) return;
    this.renderer.controls.enabled = Boolean(enabled);
  }

  getHeroStudioPose() {
    if (!this.#canUseRuntime()) return null;
    return this.#createHeroStudioPose();
  }

  applyHeroStudioPose(pose = null, options = {}) {
    if (!this.#canUseRuntime() || !pose?.camera || !pose?.globe) return null;
    const camera = this.renderer.camera;
    const controls = this.renderer.controls;
    const globe = this.renderer.globe;
    this.navigationController?.dispose();
    this.heroStudioPoseSource = options.source ?? "production";

    if (Array.isArray(pose.globe.position)) globe.position.fromArray(pose.globe.position);
    if (Array.isArray(pose.globe.quaternion)) globe.quaternion.fromArray(pose.globe.quaternion).normalize();
    if (Array.isArray(pose.globe.scale)) globe.scale.fromArray(pose.globe.scale);

    if (Number.isFinite(pose.camera.fov)) camera.fov = pose.camera.fov;
    if (Number.isFinite(pose.camera.near)) camera.near = pose.camera.near;
    if (Number.isFinite(pose.camera.far)) camera.far = pose.camera.far;
    if (Number.isFinite(pose.camera.zoom)) camera.zoom = pose.camera.zoom;
    applyCameraViewOffset(camera, pose.camera.viewOffset);
    if (Array.isArray(pose.camera.position)) camera.position.fromArray(pose.camera.position);
    if (Array.isArray(pose.camera.target)) controls.target.fromArray(pose.camera.target);
    controls.update();
    if (Array.isArray(pose.camera.quaternion)) camera.quaternion.fromArray(pose.camera.quaternion).normalize();
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    globe.updateMatrixWorld(true);

    if (pose.heroProfile) this.navigationController?.updateHeroArrivalProfile(pose.heroProfile);
    this.pinManager.dirty = true;
    this.countrySelection?.markDirty();
    const applied = this.#createHeroStudioPose({
      labelAnchor: pose.labelAnchor,
      heroProfile: pose.heroProfile
    });
    if (options.emit !== false) this.#emitHeroStudioPoseChange(true, applied);
    return applied;
  }

  previewHeroStudioPoseProgress(fromPose, toPose, progress = 0, ease = "cinematic") {
    if (!this.#canUseRuntime() || !fromPose || !toPose) return null;
    const normalized = THREE.MathUtils.clamp(progress, 0, 1);
    if (normalized >= 1) {
      return this.applyHeroStudioPose(toPose, { source: "playback" });
    }
    const eased = easeByName(normalized, ease);
    const cameraPosition = new THREE.Vector3().lerpVectors(
      new THREE.Vector3().fromArray(fromPose.camera.position),
      new THREE.Vector3().fromArray(toPose.camera.position),
      eased
    );
    const cameraQuaternion = new THREE.Quaternion().slerpQuaternions(
      new THREE.Quaternion().fromArray(fromPose.camera.quaternion),
      new THREE.Quaternion().fromArray(toPose.camera.quaternion),
      eased
    );
    const target = new THREE.Vector3().lerpVectors(
      new THREE.Vector3().fromArray(fromPose.camera.target),
      new THREE.Vector3().fromArray(toPose.camera.target),
      eased
    );
    const globePosition = new THREE.Vector3().lerpVectors(
      new THREE.Vector3().fromArray(fromPose.globe.position),
      new THREE.Vector3().fromArray(toPose.globe.position),
      eased
    );
    const globeQuaternion = new THREE.Quaternion().slerpQuaternions(
      new THREE.Quaternion().fromArray(fromPose.globe.quaternion),
      new THREE.Quaternion().fromArray(toPose.globe.quaternion),
      eased
    );
    const globeScale = new THREE.Vector3().lerpVectors(
      new THREE.Vector3().fromArray(fromPose.globe.scale),
      new THREE.Vector3().fromArray(toPose.globe.scale),
      eased
    );
    return this.applyHeroStudioPose({
      ...toPose,
      camera: {
        ...toPose.camera,
        position: cameraPosition.toArray(),
        quaternion: cameraQuaternion.toArray(),
        target: target.toArray(),
        fov: THREE.MathUtils.lerp(fromPose.camera.fov, toPose.camera.fov, eased),
        near: THREE.MathUtils.lerp(fromPose.camera.near, toPose.camera.near, eased),
        far: THREE.MathUtils.lerp(fromPose.camera.far, toPose.camera.far, eased),
        zoom: THREE.MathUtils.lerp(fromPose.camera.zoom, toPose.camera.zoom, eased),
        viewOffset: interpolateViewOffset(fromPose.camera.viewOffset, toPose.camera.viewOffset, eased, this.renderer.camera.aspect)
      },
      globe: {
        position: globePosition.toArray(),
        quaternion: globeQuaternion.toArray(),
        scale: globeScale.toArray()
      },
      labelAnchor: {
        x: THREE.MathUtils.lerp(fromPose.labelAnchor?.x ?? 0.5, toPose.labelAnchor?.x ?? 0.5, eased),
        y: THREE.MathUtils.lerp(fromPose.labelAnchor?.y ?? 0.44, toPose.labelAnchor?.y ?? 0.44, eased)
      }
    }, { source: "playback" });
  }

  rotateHeroStudioGlobe(deltaYaw = 0, deltaPitch = 0) {
    if (!this.#canUseRuntime()) return null;
    const globe = this.renderer.globe;
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaYaw);
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(this.renderer.camera.quaternion).normalize();
    const pitch = new THREE.Quaternion().setFromAxisAngle(cameraRight, deltaPitch);
    globe.quaternion.premultiply(yaw).premultiply(pitch).normalize();
    globe.updateMatrixWorld(true);
    this.heroStudioPoseSource = "production";
    this.pinManager.dirty = true;
    this.countrySelection?.markDirty();
    this.#emitHeroStudioPoseChange(true);
    return this.#createHeroStudioPose();
  }

  resetHeroStudioPose() {
    if (!this.#canUseRuntime() || !this.heroStudioDefaultPose) return null;
    this.renderer.setControlsUpdateSuppressed(false);
    return this.applyHeroStudioPose(this.heroStudioDefaultPose, { source: "reset" });
  }

  captureFinalHeroStudioPose() {
    if (!this.#canUseRuntime()) return null;
    const profile = this.captureHeroArrivalProfile();
    const pose = normalizeHeroStudioPoseToGlobeOrigin(this.#createHeroStudioPose({
      heroProfile: profile,
      capturedAt: new Date().toISOString()
    }));
    return { pose, profile };
  }

  prepareHeroStudioDestination(eventId) {
    if (!this.#canUseRuntime()) return null;
    const event = this.#findEvent(String(eventId));
    if (!event) return null;
    this.#ensureEventRenderable(String(eventId));
    this.heroStudioPreparedEvent = event;
    this.pinManager?.clearSelection();
    this.pinManager?.setHeroStudioCaptureState("idle");
    this.#clearCountrySelection();
    this.pinManager.dirty = true;
    this.#emitHeroStudioPoseChange(true);
    return event;
  }

  setHeroStudioCaptureState(state = "idle") {
    if (!this.#canUseRuntime()) return;
    this.pinManager?.setHeroStudioCaptureState(state);
  }

  selectHeroStudioDestination(eventId) {
    if (!this.#canUseRuntime()) return null;
    const event = this.#findEvent(String(eventId));
    if (!event) return null;
    this.#ensureEventRenderable(String(eventId));
    this.heroStudioPreparedEvent = event;
    const selected = this.pinManager?.highlightEvent(String(eventId))
      ?? this.pinManager?.mirrorSelectedEvent(event)
      ?? event;
    this.#highlightEventCountry(selected);
    this.pinManager.dirty = true;
    this.#emitHeroStudioPoseChange(true);
    return selected;
  }

  updateHeroArrivalProfile(profile = {}) {
    if (!this.#canUseRuntime()) return null;
    this.navigationController?.updateHeroArrivalProfile(profile);
    return this.previewHeroArrivalProfile(profile);
  }

  previewHeroArrivalProfile(profile = {}) {
    if (!this.#canUseRuntime()) return null;
    const target = this.#getSelectedHeroTarget(this.heroComposerTarget);
    if (!target) {
      this.navigationController?.updateHeroArrivalProfile(profile);
      return this.getHeroArrivalComposerSnapshot();
    }
    return this.navigationController?.previewHeroArrival(target, this.#withHeroCompositionMeasure(profile)) ?? null;
  }

  animateHeroArrivalPreview(profile = {}) {
    if (!this.#canUseRuntime()) return null;
    const target = this.#getSelectedHeroTarget(this.heroComposerTarget);
    if (!target) return this.previewHeroArrivalProfile(profile);
    return this.navigationController?.animateHeroArrivalPreview(
      target,
      this.#withHeroCompositionMeasure(profile),
      this.renderer.clock.elapsedTime
    ) ?? null;
  }

  previewHeroArrivalProgress(profile = {}, progress = 0) {
    if (!this.#canUseRuntime()) return null;
    const target = this.#getSelectedHeroTarget(this.heroComposerTarget);
    if (!target) return this.previewHeroArrivalProfile(profile);
    return this.navigationController?.previewHeroArrivalProgress(
      target,
      this.#withHeroCompositionMeasure(profile),
      progress
    ) ?? null;
  }

  captureHeroArrivalProfile() {
    if (!this.#canUseRuntime()) return null;
    const target = this.#getSelectedHeroTarget(this.heroComposerTarget);
    if (!target) return this.navigationController?.getHeroArrivalProfile() ?? null;
    const profile = this.navigationController?.captureHeroArrivalProfile(target) ?? null;
    if (profile) this.navigationController?.updateHeroArrivalProfile(profile);
    return profile;
  }

  getHeroArrivalComposerSnapshot() {
    if (!this.#canUseRuntime()) return null;
    const target = this.#getSelectedHeroTarget(this.heroComposerTarget);
    return this.navigationController?.getHeroArrivalDebug(target) ?? null;
  }

  selectEvent(eventId) {
    if (!this.#canUseRuntime()) return null;
    const requestedEventId = String(eventId);
    const event = this.#findEvent(requestedEventId);
    if (!event) return null;
    this.#ensureEventRenderable(requestedEventId);
    return this.#handleEventSelectionRequest(event);
  }

  fadeOutSelectedEvent() {
    if (!this.#canUseRuntime()) return;
    this.pinManager?.fadeOutSelectedEvent();
  }

  returnToWorld({ preserveSelection = false } = {}) {
    if (!this.#canUseRuntime()) return;
    const currentView = this.#createNavigationSnapshot();
    this.renderer.globe.updateWorldMatrix(true, false);
    const equatorWorldPosition = this.eventNavigationTarget.copy(wgs84ToRenderedGlobeLocal(
      currentView.lng,
      0,
      this.renderer.globeRadius,
      this.config
    ));
    this.renderer.globe.localToWorld(equatorWorldPosition);
    this.#showWorld({ preserveSelection });
    this.navigationController.returnToWorld(this.renderer.clock.elapsedTime, equatorWorldPosition);
  }

  selectCountry(countryIdOrIso) {
    if (!this.#canUseRuntime()) return null;
    return this.countrySelection.selectCountry(countryIdOrIso, this.renderer.clock.elapsedTime);
  }

  setCountrySelectionEventOnly(enabled) {
    if (!this.#canUseRuntime()) return;
    this.countrySelection.setEnabledEventOnly(enabled);
  }

  selectActivityRegion(regionId) {
    if (!this.#canUseRuntime()) return null;
    const region = this.activityRegions.find((candidate) => String(candidate.id) === String(regionId));
    if (!region) return null;
    if (region.listingIds?.length === 1) {
      this.selectEvent(region.listingIds[0]);
      return region;
    }
    this.#activateActivityRegion(region);
    const worldPosition = this.activityRegionManager?.getRegionWorldPosition(region.id);
    if (worldPosition) {
      this.navigationController.selectRegion({
        worldPosition,
        elapsed: this.renderer.clock.elapsedTime,
        focusDistance: this.config.progressiveDisclosure.clusterFocusDistance
      });
    }
    this.callbacks.onActivityRegionSelect?.(region);
    return region;
  }

  clearSelection() {
    if (this.disposed) return;
    this.renderer?.noteInteraction?.();
    this.#clearCountrySelection();
    this.pinManager?.clearSelection();
  }

  clearEventSelection() {
    if (this.disposed) return;
    this.pinManager?.clearSelection();
  }

  setCountryLayerVisibility({ atlasHighlight, geoJsonBorders } = {}) {
    if (this.disposed) return;
    if (typeof atlasHighlight === "boolean") {
      this.countrySelection?.setHighlightVisible(atlasHighlight);
    }
    if (typeof geoJsonBorders === "boolean") {
      this.countryGeoJsonBorders?.setVisible(geoJsonBorders);
    }
  }

  setCountryGeoJsonDiagnosticMode(enabled) {
    if (this.disposed) return;
    this.countryGeoJsonBorders?.setDiagnosticMode(enabled);
  }

  setCountryVectorBorderVisible(visible) {
    if (this.disposed) return;
    this.countryVectorBorders?.setVisible(visible);
  }

  setCountryVectorActivityVisible(visible) {
    if (this.disposed) return;
    this.countryVectorActivity?.setVisible(visible);
  }

  updateCountryVectorActivitySettings(settings = {}) {
    if (this.disposed) return;
    this.countryVectorActivity?.updateSettings(settings);
  }

  getCountryVectorActivityDiagnostics() {
    return this.countryVectorActivity?.getDiagnostics?.() ?? null;
  }

  updateCountryVectorBorderSettings(settings = {}) {
    if (this.disposed) return;
    this.countryVectorBorders?.updateSettings(settings);
  }

  setCountryVectorBorderSourceMode(mode) {
    if (this.disposed) return;
    this.countryVectorBorders?.setSourceMode(mode);
  }

  setCountryVectorBorderPreview(preview = null) {
    if (this.disposed) return;
    this.countryVectorBorders?.setBorderSurgeryPreview(preview);
  }

  projectBorderSurgeryControls(coordinates = [], width = 1, height = 1) {
    if (!this.#canUseRuntime() || !this.renderer?.camera || !this.renderer?.globe) return [];
    const viewportWidth = Math.max(1, Number(width) || 1);
    const viewportHeight = Math.max(1, Number(height) || 1);
    const radius = this.renderer.globeRadius * Number(this.config.countryVectorBorders?.radiusScale ?? 1.009);
    this.renderer.globe.updateMatrixWorld(true);
    this.renderer.camera.updateMatrixWorld(true);
    return coordinates.map((coordinate, index) => {
      const lng = Number(coordinate?.[0]);
      const lat = Number(coordinate?.[1]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return { index, visible: false };
      const local = wgs84ToRenderedGlobeLocal(lng, lat, radius, this.config);
      const world = this.renderer.globe.localToWorld(local.clone());
      const projected = world.project(this.renderer.camera);
      return {
        index,
        x: (projected.x * 0.5 + 0.5) * viewportWidth,
        y: (-projected.y * 0.5 + 0.5) * viewportHeight,
        depth: projected.z,
        visible: projected.z >= -1 && projected.z <= 1
      };
    });
  }

  borderSurgeryScreenPointToLandGeo(x, y, width = 1, height = 1) {
    if (!this.#canUseRuntime() || !this.renderer?.camera || !this.renderer?.landHitMesh || !this.renderer?.globe) return null;
    const viewportWidth = Math.max(1, Number(width) || 1);
    const viewportHeight = Math.max(1, Number(height) || 1);
    const ndc = new THREE.Vector2(
      (Number(x) / viewportWidth) * 2 - 1,
      -(Number(y) / viewportHeight) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    this.renderer.globe.updateMatrixWorld(true);
    this.renderer.landHitMesh.updateMatrixWorld(true);
    raycaster.setFromCamera(ndc, this.renderer.camera);
    const hit = raycaster.intersectObject(this.renderer.landHitMesh, false)[0];
    if (!hit?.point) return null;
    const local = hit.point.clone();
    this.renderer.globe.worldToLocal(local);
    return renderedGlobeLocalToWgs84(local, this.config);
  }

  setBorderSurgeryOrbitEnabled(enabled) {
    if (!this.renderer?.controls) return;
    this.renderer.controls.enabled = Boolean(enabled);
  }

  getCountryVectorBorderDiagnostics() {
    return this.countryVectorBorders?.getDiagnostics?.() ?? null;
  }

  setCountryVectorBorderRenderableCountries(countries = []) {
    if (this.disposed) return;
    this.countryVectorBorders?.setRenderableCountries(countries);
  }

  setLandCoastlineAuditLayers(layers = {}) {
    if (this.disposed) return;
    this.landCoastlineAudit?.setLayers(layers);
  }

  getLandCoastlineAuditDiagnostics() {
    return this.landCoastlineAudit?.getDiagnostics?.() ?? null;
  }

  setHybridBorderAuditLayers(layers = {}) {
    if (this.disposed) return;
    this.hybridBorderAudit?.setLayers(layers);
  }

  setHybridBorderAuditSourceColors(enabled) {
    if (this.disposed) return;
    this.hybridBorderAudit?.setSourceColors(enabled);
  }

  getHybridBorderAuditDiagnostics() {
    return this.hybridBorderAudit?.getDiagnostics?.() ?? null;
  }

  updateCountryGeoJsonStateStyles(config = {}) {
    if (this.disposed) return;
    this.countryGeoJsonBorders?.updateStateStyles(config);
  }

  updateCountryGeoJsonGlow(config = {}) {
    if (this.disposed) return;
    this.countryGeoJsonBorders?.updateGlow(config);
  }

  getCountryGeoJsonDiagnostics() {
    return this.countryGeoJsonBorders?.getDiagnostics?.() ?? null;
  }

  getNavigationSnapshot() {
    if (!this.renderer?.camera || !this.renderer?.controls) return null;
    return this.#createNavigationSnapshot();
  }

  getNavigationDistanceBounds() {
    if (!this.renderer?.controls) return null;
    return {
      min: this.renderer.controls.minDistance ?? this.config.renderer.controlsMinDistance,
      max: this.renderer.controls.maxDistance ?? this.config.renderer.controlsMaxDistance,
    };
  }

  setNavigationPose(pose = {}) {
    if (!this.#canUseRuntime()) return null;
    const lng = Number.isFinite(pose.lng) ? pose.lng : 0;
    const lat = Number.isFinite(pose.lat) ? pose.lat : 0;
    const minDistance = this.renderer.controls.minDistance ?? this.config.renderer.controlsMinDistance;
    const maxDistance = this.renderer.controls.maxDistance ?? this.config.renderer.controlsMaxDistance;
    const zoomIntent = THREE.MathUtils.clamp(Number.isFinite(pose.zoomIntent) ? pose.zoomIntent : 0.5, 0, 1);
    const distance = Number.isFinite(pose.distance)
      ? THREE.MathUtils.clamp(pose.distance, minDistance, maxDistance)
      : THREE.MathUtils.lerp(maxDistance, minDistance, zoomIntent);
    const target = pose.followVisualLandRotation === false
      ? wgs84ToRenderedGlobeLocal(lng, lat, this.renderer.globeRadius, this.config)
      : this.#wgs84ToCurrentVisualLocal(lng, lat, new THREE.Vector3());
    const globeCenter = this.renderer.globe.position;
    const surfaceDirection = target.clone().sub(globeCenter).normalize();
    const currentViewDirection = this.renderer.camera.position.clone().sub(this.renderer.controls.target).normalize();
    const viewDirection = surfaceDirection.clone();
    this.navigationController?.dispose();
    this.renderer.controls.target.copy(globeCenter);
    this.renderer.camera.position.copy(globeCenter).addScaledVector(viewDirection, distance);
    this.renderer.updateControlsProgrammatically();
    this.lastNavigationSnapshot = null;
    this.#emitNavigationChange();
    return this.#createNavigationSnapshot();
  }

  resize() {
    if (this.disposed) return;
    this.renderer?.resize();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    this.removeFrameListener?.();
    this.removePerformanceListener?.();
    this.countrySelection?.dispose();
    this.countryGeoJsonBorders?.dispose();
    this.countryVectorActivity?.dispose();
    this.countryVectorBorders?.dispose();
    this.administrativeBoundaries?.dispose();
    this.geospatialCalibration?.dispose();
    this.landCoastlineAudit?.dispose();
    this.hybridBorderAudit?.dispose();
    this.activityRegionManager?.dispose();
    this.pinManager?.dispose();
    this.navigationController?.dispose();
    this.atmosphere?.dispose();
    this.assets?.countryIdTexture?.dispose?.();
    this.assets?.visualAtlasTexture?.dispose?.();
    this.assets = null;
    this.renderer?.dispose();
  }

  #createHeroStudioPose(overrides = {}) {
    const camera = this.renderer.camera;
    const controls = this.renderer.controls;
    const globe = this.renderer.globe;
    const selected = this.pinManager?.selectedEvent ?? this.heroStudioPreparedEvent ?? null;
    const targetWorld = this.pinManager?.selectedEvent
      ? this.#getSelectedHeroTarget(new THREE.Vector3())
      : this.#getEventNavigationWorldPosition(this.heroStudioPreparedEvent, new THREE.Vector3());
    let targetLocal = null;
    if (targetWorld) {
      globe.updateWorldMatrix(true, false);
      targetLocal = globe.worldToLocal(targetWorld.clone()).toArray();
    }
    const profile = overrides.heroProfile ?? this.navigationController?.getHeroArrivalProfile() ?? null;
    const stage = profile?.heroStage ?? {};
    const composition = profile?.heroComposition ?? {};
    const labelAnchor = overrides.labelAnchor ?? {
      x: stage.labelAnchorX ?? composition.anchorX ?? 0.5,
      y: stage.labelAnchorY ?? composition.anchorY ?? 0.44
    };
    const view = camera.view?.enabled ? {
      enabled: true,
      fullWidth: camera.view.fullWidth,
      fullHeight: camera.view.fullHeight,
      offsetX: camera.view.offsetX,
      offsetY: camera.view.offsetY,
      width: camera.view.width,
      height: camera.view.height
    } : null;
    return {
      version: 1,
      camera: {
        position: camera.position.toArray(),
        quaternion: camera.quaternion.toArray(),
        target: controls.target.toArray(),
        fov: camera.fov,
        near: camera.near,
        far: camera.far,
        zoom: camera.zoom,
        viewOffset: view
      },
      globe: {
        position: globe.position.toArray(),
        quaternion: globe.quaternion.toArray(),
        scale: globe.scale.toArray()
      },
      destination: selected ? {
        id: String(selected.listingId ?? selected.id ?? selected.name),
        name: selected.name ?? String(selected.id),
        lat: selected.lat,
        lon: selected.lon
      } : null,
      destinationLocalPosition: targetLocal,
      destinationWorldPosition: targetWorld?.toArray() ?? null,
      labelAnchor,
      heroProfile: profile,
      capturedAt: overrides.capturedAt
    };
  }

  #emitHeroStudioPoseChange(force = false, suppliedPose = null) {
    if (!this.heroStudioPoseListener || !this.renderer?.camera || !this.renderer?.globe) return;
    const pose = suppliedPose ?? this.#createHeroStudioPose();
    const signature = heroStudioPoseSignature(pose);
    if (!force && signature === this.heroStudioLastPoseSignature) return;
    this.heroStudioLastPoseSignature = signature;
    const source = this.heroStudioPoseSource;
    this.heroStudioPoseSource = "production";
    this.heroStudioPoseListener(pose, { source });
  }

  #canUseRuntime() {
    return Boolean(!this.disposed && this.ready && this.renderer);
  }

  #activateActivityRegion(region) {
    if (!region) return;
    this.setCountryDiscoveryEmphasis(false);
    this.activeActivityRegion = region;
    this.directPinsVisible = true;
    this.pinManager.updateEvents(this.#getActiveRegionEvents());
    this.pinManager.setVisible(true);
    this.activityRegionManager.setVisible(false);
    this.#clearCountrySelection();
    if (region.countryIso2) {
      // Keep the country visually emphasized while drilling into a discovery
      // cluster. React may close the country detail panel, but the spatial
      // context should not appear to disappear underneath the user.
      const country = this.countrySelection?.highlightCountry(region.countryIso2) ?? null;
      this.countryGeoJsonBorders?.setSelectedCountry(country);
      this.countryVectorActivity?.setSelectedCountry(country);
      this.countryVectorBorders?.setSelectedCountry(country);
      this.hybridBorderAudit?.setSelectedCountry(country);
    }
    this.callbacks.onDiscoveryModeChange?.(region);
  }

  #showWorld({ preserveSelection = false } = {}) {
    this.setCountryDiscoveryEmphasis(false);
    this.activeActivityRegion = null;
    this.directPinsVisible = false;
    this.countryOverviewVisible = false;
    this.#clearCountrySelection();
    if (preserveSelection) {
      this.pinManager.setVisible(true);
      this.activityRegionManager.setVisible(false);
    } else {
      this.pinManager.clearSelection();
      this.pinManager.updateEvents([]);
      this.pinManager.setVisible(false);
      this.activityRegionManager.setVisible(false);
    }
    this.callbacks.onDiscoveryModeChange?.(null);
  }

  #clearCountrySelection() {
    this.countrySelection?.clearSelection();
    this.countryGeoJsonBorders?.setSelectedCountry(null);
    this.countryVectorActivity?.setSelectedCountry(null);
    this.countryVectorBorders?.setSelectedCountry(null);
    this.hybridBorderAudit?.setSelectedCountry(null);
  }

  #getActiveRegionEvents() {
    if (!this.activeActivityRegion) return this.events;
    const listingIds = new Set(this.activeActivityRegion.listingIds?.map(String) ?? []);
    return this.events.filter((event) => listingIds.has(String(event.listingId ?? event.id)));
  }

  #refreshCountryOverviewData() {
    const adaptive = this.config.progressiveDisclosure?.adaptiveCountryClustering;
    if (adaptive?.enabled && this.events.length && this.activityRegions.length) {
      const eventByListingId = new Map(
        this.events.map((event) => [String(event.listingId ?? event.id), event])
      );
      const clusteredRegionIds = new Set();
      const directListingIds = new Set();
      const enterDistancePx = Number(adaptive.enterDistancePx ?? 48);
      const exitDistancePx = Math.max(enterDistancePx, Number(adaptive.exitDistancePx ?? 64));

      for (const region of this.activityRegions) {
        const listingIds = (region.listingIds ?? []).map(String);
        if (listingIds.length <= 1) {
          listingIds.forEach((listingId) => directListingIds.add(listingId));
          continue;
        }

        const members = listingIds.map((listingId) => eventByListingId.get(listingId)).filter(Boolean);
        const keepClustered = this.adaptiveClusteredRegionIds.has(region.id);
        const minimumScreenDistance = this.#getMinimumEventScreenDistance(members);
        const shouldCluster = resolveAdaptiveClusterDecision({
          minimumScreenDistance,
          wasClustered: keepClustered,
          enterDistancePx,
          exitDistancePx,
        });

        if (shouldCluster) {
          clusteredRegionIds.add(region.id);
        } else {
          listingIds.forEach((listingId) => directListingIds.add(listingId));
        }
      }

      this.adaptiveClusteredRegionIds = clusteredRegionIds;
      this.clusterRegions = this.activityRegions.filter((region) => clusteredRegionIds.has(region.id));
      this.countryOverviewEvents = this.events.filter((event) =>
        directListingIds.has(String(event.listingId ?? event.id))
      );
      return;
    }

    this.clusterRegions = this.activityRegions.filter((region) => (region.listingIds?.length ?? 0) > 1);
    const singletonListingIds = new Set(
      this.activityRegions
        .filter((region) => region.listingIds?.length === 1)
        .flatMap((region) => region.listingIds.map(String))
    );
    this.countryOverviewEvents = this.events.filter((event) =>
      singletonListingIds.has(String(event.listingId ?? event.id))
    );
  }

  #getMinimumEventScreenDistance(events) {
    if (!Array.isArray(events) || events.length < 2) return Number.POSITIVE_INFINITY;
    const width = this.renderer?.container?.clientWidth || this.renderer?.renderer?.domElement?.clientWidth || 0;
    const height = this.renderer?.container?.clientHeight || this.renderer?.renderer?.domElement?.clientHeight || 0;
    if (!width || !height || !this.renderer?.camera) return null;

    const points = [];
    for (const event of events) {
      const worldPosition = this.#getEventNavigationWorldPosition(event, this.adaptiveProjectionTarget);
      if (!worldPosition) return null;
      const projected = worldPosition.clone().project(this.renderer.camera);
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || projected.z < -1 || projected.z > 1) return null;
      points.push({
        x: ((projected.x + 1) * 0.5) * width,
        y: ((1 - projected.y) * 0.5) * height
      });
    }

    let minimum = Number.POSITIVE_INFINITY;
    for (let left = 0; left < points.length - 1; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        minimum = Math.min(minimum, Math.hypot(
          points[left].x - points[right].x,
          points[left].y - points[right].y
        ));
      }
    }
    return minimum;
  }

  #refreshAdaptiveCountryOverviewIfNeeded(force = false) {
    const adaptive = this.config.progressiveDisclosure?.adaptiveCountryClustering;
    if (!adaptive?.enabled || !this.countryOverviewVisible || this.activeActivityRegion || this.pinManager?.selectedEvent) return;
    if (this.navigationController?.isFocusActive?.()) return;
    if (!force && this.renderer?.controlsActive) return;

    const distance = this.renderer.camera.position.distanceTo(this.renderer.controls.target);
    const recheckThreshold = Math.max(0.05, Number(adaptive.distanceRecheckThreshold ?? 0.35));
    const orientationRecheckRadians = THREE.MathUtils.degToRad(Math.max(0.5, Number(adaptive.orientationRecheckDegrees ?? 3)));
    const distanceChanged = this.lastAdaptiveClusterDistance == null
      || Math.abs(distance - this.lastAdaptiveClusterDistance) >= recheckThreshold;
    const orientationChanged = !this.hasAdaptiveClusterCameraQuaternion
      || this.lastAdaptiveClusterCameraQuaternion.angleTo(this.renderer.camera.quaternion) >= orientationRecheckRadians;
    if (!force && !distanceChanged && !orientationChanged) return;

    const previousClusterSignature = this.clusterRegions.map((region) => region.id).sort().join('|');
    const previousEventSignature = this.countryOverviewEvents
      .map((event) => String(event.listingId ?? event.id))
      .sort()
      .join('|');
    this.lastAdaptiveClusterDistance = distance;
    this.lastAdaptiveClusterCameraQuaternion.copy(this.renderer.camera.quaternion);
    this.hasAdaptiveClusterCameraQuaternion = true;
    this.#refreshCountryOverviewData();
    const nextClusterSignature = this.clusterRegions.map((region) => region.id).sort().join('|');
    const nextEventSignature = this.countryOverviewEvents
      .map((event) => String(event.listingId ?? event.id))
      .sort()
      .join('|');
    if (previousClusterSignature === nextClusterSignature && previousEventSignature === nextEventSignature) return;

    this.activityRegionManager?.updateRegions(this.#getClusterRegions());
    this.pinManager?.updateEvents(this.#getRenderableEvents());
    this.#syncDiscoveryLayerVisibility();
  }

  #getClusterRegions() {
    return this.clusterRegions;
  }

  #getCountryOverviewEvents() {
    return this.countryOverviewEvents;
  }

  #getRenderableEvents() {
    return this.activeActivityRegion
      ? this.#getActiveRegionEvents()
      : this.countryOverviewVisible
        ? this.#getCountryOverviewEvents()
        : [];
  }

  #syncDiscoveryLayerVisibility() {
    if (!this.pinManager || !this.activityRegionManager) return;
    const hasSelection = Boolean(this.pinManager.selectedEvent);
    const showOverview = this.countryOverviewVisible && !this.activeActivityRegion && !hasSelection;
    const showPins = this.directPinsVisible || hasSelection || (showOverview && this.#getCountryOverviewEvents().length > 0);
    const showClusters = showOverview && this.#getClusterRegions().length > 0;
    this.pinManager.setVisible(showPins);
    this.activityRegionManager.setVisible(showClusters);
  }

  #findEvent(eventId) {
    const requestedEventId = String(eventId);
    return this.events.find((event) => {
      const ids = [
        event.id,
        event.listingId,
        event.name
      ].filter((value) => value != null).map(String);
      return ids.includes(requestedEventId);
    }) ?? null;
  }

  #ensureEventRenderable(eventId) {
    const requestedEventId = String(eventId);
    const activeRegionContainsEvent = this.activeActivityRegion?.listingIds?.map(String).includes(requestedEventId) ?? false;
    if (activeRegionContainsEvent) return;

    const containingRegion = this.activityRegions.find((region) => region.listingIds?.map(String).includes(requestedEventId));
    if (containingRegion?.listingIds?.length > 1) {
      this.#activateActivityRegion(containingRegion);
      return;
    }

    if (containingRegion) {
      // A single-listing discovery marker is already the listing's spatial
      // representative. Selecting it should open/focus that listing without
      // turning the one-item marker into a new "region" and collapsing the
      // Nearby rail to a one-item scope.
      const event = this.#findEvent(requestedEventId);
      this.activeActivityRegion = null;
      this.directPinsVisible = false;
      this.pinManager.updateEvents(event ? [event] : this.events);
      this.pinManager.setVisible(true);
      this.activityRegionManager.setVisible(false);
      this.callbacks.onDiscoveryModeChange?.(null);
      return;
    }

    // Future/API-selected venues may not belong to a discovery region yet.
    // Keep global venue resolution independent of the regional render cache.
    this.pinManager.updateEvents(this.events);
    this.pinManager.setVisible(true);
  }

  #getEventNavigationWorldPosition(event, target = this.eventNavigationTarget) {
    if (!event || !Number.isFinite(event.lon) || !Number.isFinite(event.lat)) return null;
    this.renderer.globe.updateWorldMatrix(true, false);
    this.#wgs84ToCurrentVisualLocal(event.lon, event.lat, target);
    return this.renderer.globe.localToWorld(target);
  }

  #resolveCountryActivityFocus(country, fallbackWorldPosition) {
    const fallbackDistance = this.config.progressiveDisclosure.worldExitDistance;
    const compactActivityDistance = this.config.progressiveDisclosure.clusterFocusDistance;
    if (!country) return { worldPosition: fallbackWorldPosition, focusDistance: fallbackDistance };

    const countryKeys = new Set([
      country.id,
      country.iso2,
      country.iso3,
      country.countryIso2,
      country.countryIso3
    ].filter((value) => value != null).map((value) => String(value).trim().toUpperCase()));
    const activityEvents = this.countryActivityEvents?.length ? this.countryActivityEvents : this.events;
    const matchingEvents = activityEvents.filter((event) => {
      const eventKeys = [
        event.countryId,
        event.countryIso2,
        event.countryIso3,
        event.iso2,
        event.iso3,
        event.expectedIso3
      ].filter((value) => value != null).map((value) => String(value).trim().toUpperCase());
      return eventKeys.some((key) => countryKeys.has(key))
        && Number.isFinite(event.lon)
        && Number.isFinite(event.lat);
    });
    if (!matchingEvents.length) {
      return { worldPosition: fallbackWorldPosition, focusDistance: fallbackDistance };
    }

    this.renderer.globe.updateWorldMatrix(true, false);
    this.renderer.globe.getWorldPosition(this.navigationGlobeCenter);
    const globeCenter = this.navigationGlobeCenter;
    const directions = matchingEvents.map((event) => {
      const worldPosition = this.#getEventNavigationWorldPosition(event, new THREE.Vector3());
      return worldPosition?.clone().sub(globeCenter).normalize() ?? null;
    }).filter(Boolean);
    if (!directions.length) {
      return { worldPosition: fallbackWorldPosition, focusDistance: fallbackDistance };
    }

    const centroid = directions.reduce((sum, direction) => sum.add(direction), new THREE.Vector3());
    if (centroid.lengthSq() < 0.0001) {
      return { worldPosition: fallbackWorldPosition, focusDistance: this.renderer.controls.maxDistance };
    }
    centroid.normalize();
    const maxAngularSpread = directions.reduce(
      (maximum, direction) => Math.max(maximum, centroid.angleTo(direction)),
      0
    );
    const focusDistance = THREE.MathUtils.clamp(
      compactActivityDistance + maxAngularSpread * 5.5,
      compactActivityDistance,
      this.renderer.controls.maxDistance
    );
    return {
      worldPosition: globeCenter.clone().addScaledVector(centroid, this.renderer.globeRadius),
      focusDistance
    };
  }

  #getSelectedHeroTarget(target) {
    const selected = this.pinManager?.selectedEvent;
    if (!selected) return null;
    const eventId = String(selected.id ?? selected.name);
    return this.pinManager?.getMarkerNavigationWorldPosition(eventId, target)
      ?? this.#getEventNavigationWorldPosition(selected, target);
  }

  #withHeroCompositionMeasure(profile = {}) {
    return {
      ...profile,
      heroCompositionMeasure: () => this.pinManager?.measureSelectedLabelScreenRect(this.renderer.camera) ?? null
    };
  }

  #createNavigationSnapshot() {
    const camera = this.renderer.camera;
    const controls = this.renderer.controls;
    this.renderer.globe.getWorldPosition(this.navigationGlobeCenter);
    const globeCenter = this.navigationGlobeCenter;
    const cameraDirectionTarget = camera.position.clone()
      .sub(globeCenter)
      .normalize()
      .multiplyScalar(this.renderer.globeRadius)
      .add(globeCenter);
    const cameraDirection = this.#renderedLocalToWgs84(cameraDirectionTarget.clone().sub(globeCenter));
    const target = this.#getScreenCenterNavigationTarget(cameraDirectionTarget);
    const minDistance = this.renderer.controls.minDistance ?? this.config.renderer.controlsMinDistance;
    const maxDistance = this.renderer.controls.maxDistance ?? this.config.renderer.controlsMaxDistance;
    const distance = camera.position.distanceTo(controls.target);
    const distanceRange = Math.max(maxDistance - minDistance, 0.001);
    const zoomIntent = THREE.MathUtils.clamp(1 - ((distance - minDistance) / distanceRange), 0, 1);
    return {
      lng: target.lng,
      lat: target.lat,
      targetSource: target.targetSource,
      cameraDirectionLng: cameraDirection.lng,
      cameraDirectionLat: cameraDirection.lat,
      distance,
      zoomIntent,
      minDistance,
      maxDistance,
      activeActivityRegionId: this.activeActivityRegion?.id ?? null,
      selectedEventId: this.pinManager?.selectedEvent
        ? String(this.pinManager.selectedEvent.listingId ?? this.pinManager.selectedEvent.id ?? this.pinManager.selectedEvent.name)
        : null
    };
  }

  #getScreenCenterNavigationTarget(cameraDirectionTarget) {
    this.navigationRaycaster.setFromCamera(this.navigationScreenCenter, this.renderer.camera);
    this.navigationSphere.center.copy(this.navigationGlobeCenter);
    this.navigationSphere.radius = this.renderer.presentationRadius ?? this.renderer.globeRadius;
    const hit = this.navigationRaycaster.ray.intersectSphere(this.navigationSphere, this.navigationIntersection);
    if (hit) {
      return {
        ...this.#renderedLocalToWgs84(hit.clone().sub(this.navigationGlobeCenter)),
        targetSource: "screen-center-ray"
      };
    }

    const controlsTarget = this.renderer.controls?.target;
    if (controlsTarget && controlsTarget.lengthSq() > 0.0001) {
      const controlsSurfaceTarget = controlsTarget.clone()
        .sub(this.navigationGlobeCenter)
        .normalize()
        .multiplyScalar(this.renderer.globeRadius);
      return {
        ...this.#renderedLocalToWgs84(controlsSurfaceTarget),
        targetSource: "controls-target-fallback"
      };
    }

    return {
      ...this.#renderedLocalToWgs84(cameraDirectionTarget.clone().sub(this.navigationGlobeCenter)),
      targetSource: "camera-direction-fallback"
    };
  }

  #emitNavigationChange() {
    if (!this.callbacks.onNavigationChange || !this.renderer?.camera || !this.renderer?.controls) return;
    const snapshot = this.#createNavigationSnapshot();
    const previous = this.lastNavigationSnapshot;
    const hasMeaningfulChange =
      !previous ||
      Math.abs(previous.distance - snapshot.distance) > 0.015 ||
      Math.abs(previous.lng - snapshot.lng) > 0.05 ||
      Math.abs(previous.lat - snapshot.lat) > 0.05 ||
      previous.targetSource !== snapshot.targetSource ||
      previous.activeActivityRegionId !== snapshot.activeActivityRegionId ||
      previous.selectedEventId !== snapshot.selectedEventId;
    if (!hasMeaningfulChange) return;
    this.lastNavigationSnapshot = snapshot;
    this.callbacks.onNavigationChange(snapshot);
  }

  #publishFocusArrivalDebug(completedFocus) {
    if (!isSpatialDebugEnabled()) return;
    const snapshot = this.#createNavigationSnapshot();
    const canonical = this.#renderedLocalToWgs84(completedFocus.targetDirection.clone());
    const screenCenter = { lng: snapshot.lng, lat: snapshot.lat };
    const cameraDirection = {
      lng: snapshot.cameraDirectionLng,
      lat: snapshot.cameraDirectionLat
    };
    console.info("[SwingSphere] Globe focus arrival", {
      arrivalMode: completedFocus.arrivalMode,
      canonical,
      screenCenter,
      cameraDirection,
      screenCenterErrorMeters: Math.round(distanceMetersBetween(canonical, screenCenter)),
      cameraDirectionErrorMeters: Math.round(distanceMetersBetween(canonical, cameraDirection)),
      targetSource: snapshot.targetSource
    });
  }

  #wgs84ToCurrentVisualLocal(lng, lat, target = new THREE.Vector3()) {
    target.copy(wgs84ToRenderedGlobeLocal(
      lng,
      lat,
      this.renderer.globeRadius,
      this.config
    ));
    const landRotationY = Number(this.renderer.visibleLandMesh?.rotation?.y ?? 0);
    if (Math.abs(landRotationY) > 0.000001) {
      target.applyAxisAngle(this.navigationYAxis, landRotationY);
    }
    return target;
  }

  #renderedLocalToWgs84(localDirection) {
    const visualDirection = localDirection.clone().normalize();
    const landRotationY = Number(this.renderer.visibleLandMesh?.rotation?.y ?? 0);
    if (Math.abs(landRotationY) > 0.000001) {
      visualDirection.applyAxisAngle(this.navigationYAxis, -landRotationY);
    }
    return renderedGlobeLocalToWgs84(visualDirection, this.config);
  }

  #updateProgressiveDisclosure() {
    if (!this.pinManager || !this.activityRegionManager) return;
    if (!this.activeActivityRegion) {
      // Country overview can show singleton listing markers and genuine
      // multi-listing discovery clusters at the same time. A beacon never
      // stands in for a single listing.
      this.#syncDiscoveryLayerVisibility();
      return;
    }
    if (this.navigationController.isFocusActive()) return;
    const distance = this.renderer.camera.position.distanceTo(this.renderer.controls.target);
    if (distance >= this.config.progressiveDisclosure.worldEnterDistance) {
      this.#showWorld();
    }
  }

  #assertUsable() {
    if (this.disposed) throw new Error("SwingSphereGlobe was disposed before mount completed.");
    if (!this.container) throw new Error("SwingSphereGlobe requires a mount container.");
  }

  #emitError(error) {
    this.callbacks.onError?.(error);
  }

  #handleEventSelectionRequest(event) {
    if (!event) return null;
    this.setCountryDiscoveryEmphasis(false);
    const eventId = String(event.id ?? event.name);
    const previousEvent = this.pinManager?.selectedEvent ?? null;
    const previousEventId = previousEvent ? String(previousEvent.id ?? previousEvent.name) : null;
    const activeListingIds = this.activeActivityRegion
      ? new Set(this.activeActivityRegion.listingIds?.map(String) ?? [])
      : null;
    const previousListingId = previousEvent ? String(previousEvent.listingId ?? previousEvent.id ?? previousEvent.name) : null;
    const nextListingId = String(event.listingId ?? event.id ?? event.name);
    const shouldRetargetNearby = Boolean(
      previousEventId
      && previousEventId !== eventId
      && activeListingIds?.has(previousListingId)
      && activeListingIds?.has(nextListingId)
    );
    const previousWorldPosition = shouldRetargetNearby
      ? this.pinManager?.getMarkerNavigationWorldPosition(previousEventId)
      : null;

    const selectedEvent = this.pinManager?.highlightEvent(eventId)
      ?? this.pinManager?.mirrorSelectedEvent(event)
      ?? event;
    this.#highlightEventCountry(selectedEvent);
    const shouldFocus = this.callbacks.onEventSelect?.(selectedEvent) !== false;
    if (!shouldFocus) return selectedEvent;
    const focusWorldPosition = this.pinManager.getMarkerNavigationWorldPosition(eventId)
      ?? this.#getEventNavigationWorldPosition(selectedEvent);
    if (shouldRetargetNearby && previousWorldPosition && focusWorldPosition) {
      this.navigationController.selectNearbyVenue({
        fromWorldPosition: previousWorldPosition,
        worldPosition: focusWorldPosition,
        elapsed: this.renderer.clock.elapsedTime
      });
    } else {
      this.navigationController.selectVenue({
        worldPosition: focusWorldPosition,
        elapsed: this.renderer.clock.elapsedTime,
        heroCompositionMeasure: () => this.pinManager.measureSelectedLabelScreenRect(this.renderer.camera)
      });
    }
    return selectedEvent;
  }

  #highlightEventCountry(event) {
    const countryKey = resolveEventCountryKey(event);
    if (shouldLogHighlightTrace()) {
      console.debug("[SwingSphere event-highlight] event selection", {
        eventId: event?.id,
        listingId: event?.listingId,
        name: event?.name,
        countryId: event?.countryId,
        countryIso3: event?.countryIso3,
        iso3: event?.iso3,
        expectedIso3: event?.expectedIso3,
        countryIso2: event?.countryIso2,
        iso2: event?.iso2,
        resolvedCountryKey: countryKey
      });
    }
    if (countryKey == null) return null;
    const region = this.countrySelection?.highlightCountry(countryKey) ?? null;
    this.countryGeoJsonBorders?.setSelectedCountry(region);
    this.countryVectorActivity?.setSelectedCountry(region);
    this.countryVectorBorders?.setSelectedCountry(region);
    this.hybridBorderAudit?.setSelectedCountry(region);
    this.#updateCameraTargetDebugMarker(event);
    if (shouldLogHighlightTrace()) {
      console.debug("[SwingSphere event-highlight] result", {
        resolved: Boolean(region),
        region: region ? {
          id: region.id,
          name: region.name,
          iso2: region.iso2,
          iso3: region.iso3,
          rgb: region.rgb
        } : null
      });
    }
    return region;
  }

  #createDebugCameraTarget() {
    this.cameraTargetDebugMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 16, 12),
      new THREE.MeshBasicMaterial({
        color: this.config.colors.lightText,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })
    );
    this.cameraTargetDebugMesh.name = "swingsphere-debug-camera-target";
    this.cameraTargetDebugMesh.renderOrder = 40;
    this.cameraTargetDebugMesh.visible = false;
    this.renderer.globe.add(this.cameraTargetDebugMesh);
  }

  #updateCameraTargetDebugMarker(event) {
    if (!this.cameraTargetDebugMesh) return;
    const show = Boolean(this.debugState?.toggles?.showCameraTarget && event);
    this.cameraTargetDebugMesh.visible = show;
    if (!show) return;
    const targetEvent = {
      ...event,
      lon: event.lon + this.debugState.cameraTargets.longitudeOffsetDeg,
      lat: event.lat + this.debugState.cameraTargets.latitudeOffsetDeg
    };
    const direction = geographicToLocalPosition(targetEvent.lon, targetEvent.lat, this.renderer.globeRadius * 1.04, this.config);
    this.cameraTargetDebugMesh.position.copy(direction);
  }

  #applyLandDebugState() {
    applyDebugTransform(this.renderer.visibleLandMesh, this.debugBaseTransforms.land, this.debugState.land);
  }

  #applyMeshVisibilityDebugState() {
    if (this.renderer.visibleLandMesh) this.renderer.visibleLandMesh.visible = this.debugState.toggles.showLandMesh;
    if (this.renderer.oceanMesh) this.renderer.oceanMesh.visible = this.debugState.toggles.showOceanMesh;
  }
}

export function mount(container, options = {}) {
  const globe = new SwingSphereGlobe(container, options);
  void globe.mount();
  return globe;
}

export function createWgs84BoundaryConfig(config) {
  const countryGeoJson = config?.countryGeoJson ?? {};
  return {
    ...config,
    alignment: {
      ...config?.alignment,
      // Vector country borders, activity outlines, and administrative boundaries
      // are WGS84 geometry. They follow the authoritative GeoJSON calibration,
      // never the independently calibrated pin offset.
      pinLongitudeOffsetDeg: Number(countryGeoJson.longitudeOffsetDeg ?? 0),
      pinLatitudeOffsetDeg: Number(countryGeoJson.latitudeOffsetDeg ?? 0)
    }
  };
}

function deepMerge(target, source) {
  Object.entries(source ?? {}).forEach(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = deepMerge(target[key] ?? {}, value);
    } else {
      target[key] = value;
    }
  });
  return target;
}

function resolveEventCountryKey(event) {
  if (!event || typeof event !== "object") return null;
  return event.countryId
    ?? event.countryIso3
    ?? event.iso3
    ?? event.expectedIso3
    ?? event.countryIso2
    ?? event.iso2
    ?? null;
}

function shouldLogHighlightTrace() {
  if (typeof window === "undefined") return false;
  return window.localStorage?.getItem("swingsphere.globeV1.highlightTrace") === "true";
}

function captureTransform(object) {
  return {
    rotation: object.rotation.clone(),
    scale: object.scale.clone()
  };
}

function applyDebugTransform(object, base, layer) {
  if (!object || !base || !layer) return;
  object.rotation.copy(base.rotation);
  object.rotation.x += THREE.MathUtils.degToRad(layer.latitudeOffsetDeg);
  object.rotation.y += THREE.MathUtils.degToRad(layer.longitudeOffsetDeg);
  const xSign = layer.longitudeSign * (layer.flipU ? -1 : 1);
  const ySign = layer.flipV ? -1 : 1;
  object.scale.set(base.scale.x * xSign, base.scale.y * ySign, base.scale.z);
}

function createDefaultLayerAlignment() {
  return {
    longitudeSign: 1,
    longitudeOffsetDeg: 0,
    latitudeOffsetDeg: 0,
    flipU: false,
    flipV: false
  };
}

function createDefaultDebugState() {
  return {
    land: createDefaultLayerAlignment(),
    countryAtlas: {
      ...createDefaultLayerAlignment(),
      longitudeSign: -1
    },
    pins: {
      longitudeSign: -1,
      longitudeOffsetDeg: 0,
      latitudeOffsetDeg: 0,
      latitudeSign: 1
    },
    cameraTargets: {
      longitudeOffsetDeg: 0,
      latitudeOffsetDeg: 0
    },
    toggles: {
      showLandMesh: true,
      showOceanMesh: true,
      showCountryIdTexture: false,
      showVisualCountryAtlas: false,
      showCountryHighlightMask: false,
      showPinAnchors: false,
      showEventLabels: false,
      showCameraTarget: false
    },
    opacity: {
      countryIdTexture: 0.86,
      visualAtlas: 0.86,
      highlightMask: 1
    }
  };
}

function mergeDebugState(current, patch) {
  return {
    land: { ...current.land, ...definedEntries(patch.land) },
    countryAtlas: { ...current.countryAtlas, ...definedEntries(patch.countryAtlas) },
    pins: { ...current.pins, ...definedEntries(patch.pins) },
    cameraTargets: { ...current.cameraTargets, ...definedEntries(patch.cameraTargets) },
    toggles: { ...current.toggles, ...definedEntries(patch.toggles) },
    opacity: { ...current.opacity, ...definedEntries(patch.opacity) }
  };
}

function definedEntries(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function isSpatialDebugEnabled() {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem("swingsphere.spatialDebug") === "true";
  } catch {
    return false;
  }
}

function distanceMetersBetween(a, b) {
  const earthRadiusMeters = 6371008.8;
  const lat1 = THREE.MathUtils.degToRad(a.lat);
  const lat2 = THREE.MathUtils.degToRad(b.lat);
  const deltaLat = THREE.MathUtils.degToRad(b.lat - a.lat);
  const deltaLng = THREE.MathUtils.degToRad(b.lng - a.lng);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
}

function applyCameraViewOffset(camera, view) {
  if (!view?.enabled) {
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    return;
  }
  camera.setViewOffset(
    Math.max(1, view.fullWidth),
    Math.max(1, view.fullHeight),
    view.offsetX ?? 0,
    view.offsetY ?? 0,
    Math.max(1, view.width ?? view.fullWidth),
    Math.max(1, view.height ?? view.fullHeight)
  );
  camera.updateProjectionMatrix();
}

function interpolateViewOffset(fromView, toView, progress, aspect = 1) {
  const fullHeight = toView?.fullHeight ?? fromView?.fullHeight ?? 1000;
  const fullWidth = toView?.fullWidth ?? fromView?.fullWidth ?? Math.max(1, fullHeight * aspect);
  const from = fromView?.enabled ? fromView : {
    offsetX: 0,
    offsetY: 0,
    width: fullWidth,
    height: fullHeight
  };
  const to = toView?.enabled ? toView : {
    offsetX: 0,
    offsetY: 0,
    width: fullWidth,
    height: fullHeight
  };
  const hasOffset = Boolean(fromView?.enabled || toView?.enabled);
  if (!hasOffset) return null;
  return {
    enabled: true,
    fullWidth,
    fullHeight,
    offsetX: THREE.MathUtils.lerp(from.offsetX ?? 0, to.offsetX ?? 0, progress),
    offsetY: THREE.MathUtils.lerp(from.offsetY ?? 0, to.offsetY ?? 0, progress),
    width: THREE.MathUtils.lerp(from.width ?? fullWidth, to.width ?? fullWidth, progress),
    height: THREE.MathUtils.lerp(from.height ?? fullHeight, to.height ?? fullHeight, progress)
  };
}

function normalizeHeroStudioPoseToGlobeOrigin(pose) {
  if (!pose?.camera || !pose?.globe) return pose;
  const origin = new THREE.Vector3().fromArray(pose.globe.position ?? [0, 0, 0]);
  if (origin.lengthSq() < 1e-12) {
    pose.globe.position = [0, 0, 0];
    return pose;
  }
  const subtractOrigin = (value) => Array.isArray(value)
    ? new THREE.Vector3().fromArray(value).sub(origin).toArray()
    : value;
  return {
    ...pose,
    camera: {
      ...pose.camera,
      position: subtractOrigin(pose.camera.position),
      target: subtractOrigin(pose.camera.target)
    },
    globe: {
      ...pose.globe,
      position: [0, 0, 0]
    },
    destinationWorldPosition: subtractOrigin(pose.destinationWorldPosition)
  };
}

function heroStudioPoseSignature(pose) {
  const values = [
    ...pose.camera.position,
    ...pose.camera.quaternion,
    ...pose.camera.target,
    pose.camera.fov,
    pose.camera.viewOffset?.offsetX ?? 0,
    pose.camera.viewOffset?.offsetY ?? 0,
    ...pose.globe.position,
    ...pose.globe.quaternion,
    ...pose.globe.scale
  ];
  return `${pose.destination?.id ?? "none"}:${values.map((value) => Number(value).toFixed(5)).join(":")}`;
}

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { applyGraphiteFacetBoost } from "./shaders/graphiteFacetBoost.js";
import { createEnvironmentBackgroundTexture } from "./shaders/backgroundGlowShader.js";
import { disposeObject3D } from "./math/objectPools.js";
import { shouldIgnoreProgrammaticControlsChange } from "./mobileRuntimePolicy.js";

export class GlobeRenderer {
  constructor({ container, assets, config, onInteraction = null, onInteractionEnd = null, onContextLost = null, onContextRestored = null }) {
    if (!container) throw new Error("GlobeRenderer requires a container.");
    this.container = container;
    this.assets = assets;
    this.config = config;
    this.onInteraction = onInteraction;
    this.onInteractionEnd = onInteractionEnd;
    this.onContextLost = onContextLost;
    this.onContextRestored = onContextRestored;
    this.frameListeners = new Set();
    this.resizeListeners = new Set();
    this.performanceListeners = new Set();
    this.performanceStatsProvider = null;
    this.eventListenerDisposers = [];
    this.running = false;
    this.requestedRunning = false;
    this.disposed = false;
    this.contextLost = false;
    this.idleMotionSuppressed = false;
    this.idleMotionSpeedMultiplier = 1;
    this.controlsUpdateSuppressed = false;
    this.programmaticControlsUpdateDepth = 0;
    this.animationFrame = 0;
    this.clock = new THREE.Clock();
    this.lastRenderedAt = 0;
    this.lastPerformancePublishAt = 0;
    this.performanceSamples = [];
    this.renderedFrames = 0;
    this.skippedFrames = 0;
    this.contextLossCount = 0;
    this.currentFramePolicy = "suspended";
    this.currentTargetFps = 0;
    this.interactionActiveUntil = performance.now() + 1500;
    this.activityState = {
      cameraTravel: false,
      hover: false,
      selectionAnimation: false,
      ambientAnimation: false,
      transition: false
    };
    this.qualityTier = config.quality?.currentTier ?? "high";
    this.fullBloomConfig = {
      strength: config.quality?.highBloom?.strength ?? config.bloom.strength,
      radius: config.quality?.highBloom?.radius ?? config.bloom.radius,
      threshold: config.quality?.highBloom?.threshold ?? config.bloom.threshold
    };
    this.bloomResolutionScale = THREE.MathUtils.clamp(Number(config.bloom?.resolutionScale ?? 1), 0.35, 1);
    this.lights = {};
    this.visualIdleMotion = {
      landSpeed: config.idleMotion.idleRotationSpeed,
      oceanSpeed: -config.idleMotion.idleRotationSpeed,
      lastInteractionAt: -Infinity
    };

    this.#createRenderer();
    this.#createScene();
    this.#createCamera();
    this.#createControls();
    this.#createComposer();
    this.#createGlobe();
    this.#createLights();
    this.resize();
  }

  addFrameListener(listener) {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  addResizeListener(listener) {
    this.resizeListeners.add(listener);
    return () => this.resizeListeners.delete(listener);
  }

  addPerformanceListener(listener) {
    this.performanceListeners.add(listener);
    listener(this.getPerformanceSnapshot());
    return () => this.performanceListeners.delete(listener);
  }

  setPerformanceStatsProvider(provider) {
    this.performanceStatsProvider = typeof provider === "function" ? provider : null;
  }

  setActivityState(state = {}) {
    Object.assign(this.activityState, state);
  }

  setTransitionActive(active = false) {
    this.activityState.transition = Boolean(active);
    if (active) this.noteInteraction();
  }

  applyPresentationConfig(presentation = this.config.presentation, { frameWorld = false } = {}) {
    if (!presentation || !this.camera || !this.controls || !this.globe) return;
    const camera = presentation.camera;
    const globeScale = Number.isFinite(presentation.globeScale) ? presentation.globeScale : 1;
    this.globe.scale.setScalar(globeScale);
    this.presentationRadius = this.globeRadius * globeScale;
    this.camera.fov = camera.fieldOfView;
    this.camera.near = this.config.renderer.cameraNear;
    this.camera.far = this.config.renderer.cameraFar;
    this.controls.minDistance = camera.minDistanceWorld;
    const configuredWorldDistance = Number(camera.defaultDistanceWorld) || 8;
    const fittedWorldDistance = this.config.renderer?.fitWorldToViewport
      ? this.#resolveViewportFitDistance(this.config.renderer.worldViewportFill)
      : configuredWorldDistance;
    const worldDistance = Math.max(configuredWorldDistance, fittedWorldDistance);
    this.controls.maxDistance = Math.max(camera.maxDistanceWorld, worldDistance * 1.08);
    if (this.config.renderer?.fitWorldToViewport) {
      this.config.progressiveDisclosure.worldDistance = worldDistance;
    }
    if (frameWorld) {
      this.globe.getWorldPosition(this.tmpPresentationCenter);
      this.tmpPresentationDirection.copy(this.camera.position).sub(this.controls.target).normalize();
      if (this.tmpPresentationDirection.lengthSq() < 0.0001) this.tmpPresentationDirection.set(0, 0, 1);
      this.controls.target.copy(this.tmpPresentationCenter);
      this.camera.position.copy(this.tmpPresentationCenter)
        .addScaledVector(this.tmpPresentationDirection, worldDistance);
    }
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.noteInteraction();
  }

  #resolveViewportFitDistance(fill = 0.82) {
    const safeFill = THREE.MathUtils.clamp(Number(fill) || 0.82, 0.55, 0.94);
    const verticalHalfFov = THREE.MathUtils.degToRad(this.camera.fov) * 0.5;
    const horizontalHalfFov = Math.atan(
      Math.tan(verticalHalfFov) * Math.max(this.camera.aspect || 1, 0.05)
    );
    const limitingHalfFov = Math.max(0.001, Math.min(verticalHalfFov, horizontalHalfFov));
    const targetAngularRadius = Math.atan(Math.tan(limitingHalfFov) * safeFill);

    this.globe.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3();
    if (this.oceanMesh) bounds.expandByObject(this.oceanMesh);
    if (this.visibleLandMesh) bounds.expandByObject(this.visibleLandMesh);
    const sphere = bounds.isEmpty() ? null : bounds.getBoundingSphere(new THREE.Sphere());
    const renderedRadius = sphere?.radius || this.presentationRadius || this.globeRadius || 1;
    return renderedRadius / Math.max(Math.sin(targetAngularRadius), 0.001);
  }

  setQualityTier(tier = "high") {
    const normalizedTier = ["high", "balanced", "low"].includes(tier) ? tier : "high";
    this.qualityTier = normalizedTier;
    if (this.config.quality) this.config.quality.currentTier = normalizedTier;
    const cap = normalizedTier === "high" ? 1.5 : normalizedTier === "balanced" ? 1.25 : 1;
    this.config.renderer.maxPixelRatio = cap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.#applyBloomSettingsForQuality();
    this.resize();
    this.noteInteraction();
  }

  setBloomSettings(settings = {}) {
    const wasEnabled = Boolean(this.bloomPass?.enabled);
    const strength = Number(settings.strength);
    const radius = Number(settings.radius);
    const threshold = Number(settings.threshold);
    const resolutionScale = Number(settings.resolutionScale);

    if (Number.isFinite(strength)) this.fullBloomConfig.strength = THREE.MathUtils.clamp(strength, 0, 4);
    if (Number.isFinite(radius)) this.fullBloomConfig.radius = THREE.MathUtils.clamp(radius, 0, 1);
    if (Number.isFinite(threshold)) this.fullBloomConfig.threshold = THREE.MathUtils.clamp(threshold, 0, 1);
    if (Number.isFinite(resolutionScale)) {
      this.bloomResolutionScale = THREE.MathUtils.clamp(resolutionScale, 0.35, 1);
    }

    Object.assign(this.config.bloom, {
      strength: this.fullBloomConfig.strength,
      radius: this.fullBloomConfig.radius,
      threshold: this.fullBloomConfig.threshold,
      resolutionScale: this.bloomResolutionScale
    });
    if (this.config.quality?.highBloom) {
      Object.assign(this.config.quality.highBloom, {
        strength: this.fullBloomConfig.strength,
        radius: this.fullBloomConfig.radius,
        threshold: this.fullBloomConfig.threshold
      });
    }

    this.#applyBloomSettingsForQuality();
    if (this.qualityTier !== "low") this.bloomPass.enabled = wasEnabled;
    this.#resizeBloomPass();
    this.noteInteraction();
  }

  #applyBloomSettingsForQuality() {
    if (this.qualityTier === "low") {
      this.bloomPass.enabled = false;
      return;
    }
    const multiplier = this.qualityTier === "balanced" ? 0.54 : 1;
    this.bloomPass.enabled = this.config.renderEffects?.bloom !== false && this.fullBloomConfig.strength > 0;
    this.bloomPass.strength = this.fullBloomConfig.strength * multiplier;
    this.bloomPass.radius = this.qualityTier === "balanced"
      ? Math.min(this.fullBloomConfig.radius, 0.28)
      : this.fullBloomConfig.radius;
    this.bloomPass.threshold = this.qualityTier === "balanced"
      ? Math.max(this.fullBloomConfig.threshold, 0.36)
      : this.fullBloomConfig.threshold;
  }

  getPerformanceSnapshot() {
    const now = performance.now();
    const recentSamples = this.performanceSamples.filter((sample) => now - sample.at <= 8_000);
    const interactiveSamples = recentSamples.filter((sample) => sample.phase === "interactive");
    const transitionSamples = recentSamples.filter((sample) => sample.phase === "transition");
    const frameTimes = recentSamples.map((sample) => sample.frameTimeMs).filter(Number.isFinite);
    const renderCosts = recentSamples.map((sample) => sample.renderCostMs).filter(Number.isFinite);
    const info = this.renderer.info;
    const provided = this.performanceStatsProvider?.() ?? {};
    return {
      capturedAt: now,
      sampleWindowMs: recentSamples.length > 1 ? recentSamples.at(-1).at - recentSamples[0].at : 0,
      loopRunning: this.running,
      requestedRunning: this.requestedRunning,
      framePolicy: this.running ? this.currentFramePolicy : "suspended",
      targetFps: this.running ? this.currentTargetFps : 0,
      renderedFrames: this.renderedFrames,
      skippedFrames: this.skippedFrames,
      pixelRatio: this.renderer.getPixelRatio(),
      qualityTier: this.qualityTier,
      averageFps: fpsFromSamples(recentSamples),
      averageFrameTimeMs: average(frameTimes),
      recentWorstFrameTimeMs: frameTimes.length ? Math.max(...frameTimes) : null,
      approximateOnePercentLowFps: onePercentLowFps(frameTimes),
      averageRenderCostMs: average(renderCosts),
      interactiveAverageFps: fpsFromSamples(interactiveSamples),
      interactiveLowestFps: lowestFps(interactiveSamples),
      interactiveSampleCount: interactiveSamples.length,
      transitionAverageFps: fpsFromSamples(transitionSamples),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      sourceEventCount: provided.sourceEventCount ?? 0,
      constructedPinCount: provided.constructedPinCount ?? 0,
      retainedPinMeshCount: provided.retainedPinMeshCount ?? 0,
      retainedLabelNodeCount: provided.retainedLabelNodeCount ?? 0,
      retainedAnchorCount: provided.retainedAnchorCount ?? 0,
      estimatedSurfaceRaycastCount: provided.estimatedSurfaceRaycastCount ?? 0,
      pinRebuildCount: provided.rebuildCount ?? 0,
      disposedPinCount: provided.disposedPinCount ?? 0,
      lastPinBuildDurationMs: provided.lastBuildDurationMs ?? 0,
      lastPinDisposeDurationMs: provided.lastDisposeDurationMs ?? 0,
      sourceRegionCount: provided.sourceRegionCount ?? 0,
      constructedRegionCount: provided.constructedRegionCount ?? 0,
      retainedRegionMeshCount: provided.retainedRegionMeshCount ?? 0,
      estimatedRegionSurfaceRaycastCount: provided.estimatedRegionSurfaceRaycastCount ?? 0,
      regionRebuildCount: provided.regionRebuildCount ?? 0,
      disposedRegionCount: provided.disposedRegionCount ?? 0,
      lastRegionBuildDurationMs: provided.lastRegionBuildDurationMs ?? 0,
      lastRegionDisposeDurationMs: provided.lastRegionDisposeDurationMs ?? 0,
      visibleRegionCount: provided.visibleRegionCount ?? 0,
      visiblePinCount: provided.visiblePinCount ?? 0,
      animatedRippleCount: provided.animatedRippleCount ?? 0,
      pinMeshCount: provided.pinMeshCount ?? 0,
      contextLossCount: this.contextLossCount,
      activeListenerCount: this.eventListenerDisposers.length + (provided.activeListenerCount ?? 0),
      cameraTravelActive: Boolean(this.activityState.cameraTravel),
      hoverActive: Boolean(this.activityState.hover),
      selectionAnimationActive: Boolean(this.activityState.selectionAnimation),
      transitionActive: Boolean(this.activityState.transition)
    };
  }

  start() {
    if (this.disposed) return;
    this.requestedRunning = true;
    this.#resume();
  }

  #resume() {
    if (this.running || this.disposed || this.contextLost || document.hidden) return;
    this.running = true;
    const elapsedTime = this.clock.elapsedTime;
    this.clock.start();
    this.clock.elapsedTime = elapsedTime;
    this.lastRenderedAt = 0;
    this.animationFrame = requestAnimationFrame(this.#animate);
  }

  stop() {
    this.requestedRunning = false;
    this.#suspend();
  }

  #suspend() {
    this.running = false;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.currentFramePolicy = "suspended";
    this.currentTargetFps = 0;
    this.#publishPerformance(true);
  }

  resize() {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    const viewOffsetMinWidth = Number(this.config.renderer.viewOffsetMinWidth ?? 0);
    const viewOffsetX = width >= viewOffsetMinWidth
      ? Number(this.config.renderer.viewOffsetX ?? 0)
      : 0;
    if (Number.isFinite(viewOffsetX) && Math.abs(viewOffsetX) > 0.0001) {
      this.camera.setViewOffset(width, height, -Math.round(width * viewOffsetX), 0, width, height);
    } else {
      this.camera.clearViewOffset();
    }
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.#resizeBloomPass(width, height);
    this.resizeListeners.forEach((listener) => listener({ width, height }));
    this.interactionActiveUntil = performance.now() + 750;
  }

  #resizeBloomPass(width = this.container.clientWidth || window.innerWidth, height = this.container.clientHeight || window.innerHeight) {
    if (!this.bloomPass) return;
    const scale = THREE.MathUtils.clamp(Number(this.bloomResolutionScale ?? 1), 0.35, 1);
    this.bloomPass.setSize(
      Math.max(1, Math.round(width * scale)),
      Math.max(1, Math.round(height * scale))
    );
  }

  noteInteraction() {
    this.visualIdleMotion.lastInteractionAt = this.clock.elapsedTime;
    this.interactionActiveUntil = performance.now() + 1500;
    this.onInteraction?.();
  }

  setIdleMotionSuppressed(suppressed) {
    this.idleMotionSuppressed = Boolean(suppressed);
    if (this.idleMotionSuppressed) {
      this.visualIdleMotion.lastInteractionAt = this.clock.elapsedTime;
    }
  }

  setControlsUpdateSuppressed(suppressed) {
    this.controlsUpdateSuppressed = Boolean(suppressed);
    this.controls.enabled = !this.controlsUpdateSuppressed;
  }

  updateControlsProgrammatically() {
    this.programmaticControlsUpdateDepth += 1;
    try {
      this.controls.update();
    } finally {
      this.programmaticControlsUpdateDepth = Math.max(0, this.programmaticControlsUpdateDepth - 1);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.eventListenerDisposers.splice(0).forEach((disposeListener) => disposeListener());
    this.containerResizeObserver?.disconnect?.();
    this.containerResizeObserver = null;
    this.controls.dispose();
    this.composer.renderTarget1?.dispose?.();
    this.composer.renderTarget2?.dispose?.();
    this.scene.background?.dispose?.();
    disposeObject3D(this.globe);
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.frameListeners.clear();
    this.resizeListeners.clear();
    this.performanceListeners.clear();
    this.performanceStatsProvider = null;
  }

  #animate = (now) => {
    if (!this.running || this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.#animate);
    const { policy, targetFps } = this.#resolveFramePolicy(now);
    this.currentFramePolicy = policy;
    this.currentTargetFps = targetFps;
    const minimumInterval = 1000 / targetFps;
    if (this.lastRenderedAt > 0 && now - this.lastRenderedAt < minimumInterval * 0.9) {
      this.skippedFrames += 1;
      this.#publishPerformance();
      return;
    }
    const frameTimeMs = this.lastRenderedAt > 0 ? now - this.lastRenderedAt : minimumInterval;
    this.lastRenderedAt = now;
    const delta = this.clock.getDelta();
    const elapsed = this.clock.elapsedTime;
    this.#updateControlsRotationSpeed();
    if (!this.controlsUpdateSuppressed) this.controls.update();
    this.#updateVisualIdleMotion(delta, elapsed);
    this.frameListeners.forEach((listener) => listener({ delta, elapsed }));
    this.renderer.info.reset();
    const renderStartedAt = performance.now();
    this.composer.render();
    const renderCostMs = performance.now() - renderStartedAt;
    this.renderedFrames += 1;
    this.performanceSamples.push({
      at: now,
      frameTimeMs,
      renderCostMs,
      phase: this.activityState.transition ? "transition" : policy
    });
    if (this.performanceSamples.length > 600) this.performanceSamples.splice(0, this.performanceSamples.length - 600);
    this.#publishPerformance();
  };

  #createRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.config.renderer.antialias,
      alpha: this.config.renderer.alpha,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.config.renderer.maxPixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.config.renderer.toneMappingExposure;
    this.renderer.info.autoReset = false;
    Object.assign(this.renderer.domElement.style, {
      display: "block",
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%"
    });
    this.container.appendChild(this.renderer.domElement);
    this.boundResize = () => this.resize();
    this.containerResizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => this.resize())
      : null;
    this.containerResizeObserver?.observe(this.container);
    this.boundVisibilityChange = () => {
      if (document.hidden) {
        this.#suspend();
      } else if (this.requestedRunning) {
        this.#resume();
      }
    };
    this.boundContextLost = (event) => {
      event.preventDefault();
      this.contextLost = true;
      this.contextLossCount += 1;
      this.#suspend();
      this.onContextLost?.();
    };
    this.boundContextRestored = () => {
      this.contextLost = false;
      this.renderer.resetState();
      this.resize();
      this.onContextRestored?.();
      if (this.requestedRunning) this.#resume();
    };
    this.#listen(window, "resize", this.boundResize);
    this.#listen(document, "visibilitychange", this.boundVisibilityChange);
    this.#listen(this.renderer.domElement, "webglcontextlost", this.boundContextLost);
    this.#listen(this.renderer.domElement, "webglcontextrestored", this.boundContextRestored);
    this.boundActivityEvent = () => this.noteInteraction();
    for (const eventName of ["pointermove", "pointerdown", "pointerup", "wheel", "touchstart", "touchmove", "touchend"]) {
      this.#listen(this.renderer.domElement, eventName, this.boundActivityEvent, { passive: true });
    }
    this.#listen(window, "keydown", this.boundActivityEvent);
  }

  #createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = this.config.background.enabled === false || this.config.renderEffects?.backgroundGradient === false
      ? null
      : createEnvironmentBackgroundTexture(this.config);
  }

  #createCamera() {
    this.camera = new THREE.PerspectiveCamera(
      this.config.renderer.cameraFov,
      1,
      this.config.renderer.cameraNear,
      this.config.renderer.cameraFar
    );
    this.camera.position.fromArray(this.config.renderer.cameraPosition);
  }

  #createControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = this.config.orbitControls.dampingFactor ?? 0.065;
    this.controls.zoomSpeed = this.config.orbitControls.zoomSpeed ?? 0.58;
    this.controls.minDistance = this.config.renderer.controlsMinDistance;
    this.controls.maxDistance = this.config.renderer.controlsMaxDistance;
    this.controls.rotateSpeed = this.config.orbitControls.rotateSpeed;
    this.boundControlStart = () => {
      this.controlsActive = true;
      if (this.config.renderer?.clearViewOffsetOnInteraction && this.camera.view?.enabled) {
        this.camera.clearViewOffset();
        this.camera.updateProjectionMatrix();
      }
      this.noteInteraction();
    };
    this.boundControlEnd = () => {
      this.controlsActive = false;
      this.noteInteraction();
      this.onInteractionEnd?.();
    };
    this.boundInteraction = () => {
      if (shouldIgnoreProgrammaticControlsChange(this.programmaticControlsUpdateDepth)) return;
      this.noteInteraction();
    };
    this.#listen(this.controls, "start", this.boundControlStart);
    this.#listen(this.controls, "end", this.boundControlEnd);
    this.#listen(this.controls, "change", this.boundInteraction);
  }

  #updateControlsRotationSpeed() {
    const controlsConfig = this.config.orbitControls;
    const zoomConfig = controlsConfig.zoomAwareRotation;
    if (!zoomConfig.enabled) {
      this.controls.rotateSpeed = controlsConfig.rotateSpeed;
      return;
    }

    const distance = this.camera.position.distanceTo(this.controls.target);
    const distanceRange = Math.max(zoomConfig.worldDistance - zoomConfig.cityDistance, 0.001);
    const normalizedDistance = THREE.MathUtils.clamp(
      (distance - zoomConfig.cityDistance) / distanceRange,
      0,
      1
    );
    const smoothDistance = normalizedDistance * normalizedDistance * (3 - 2 * normalizedDistance);
    const curvedDistance = Math.pow(smoothDistance, Math.max(zoomConfig.curvePower, 0.001));
    const speedMultiplier = THREE.MathUtils.lerp(
      zoomConfig.citySpeedMultiplier,
      zoomConfig.worldSpeedMultiplier,
      curvedDistance
    );
    this.controls.rotateSpeed = controlsConfig.rotateSpeed * speedMultiplier;
  }

  #createComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloomWidth = Math.max(1, Math.round((this.container.clientWidth || window.innerWidth) * this.bloomResolutionScale));
    const bloomHeight = Math.max(1, Math.round((this.container.clientHeight || window.innerHeight) * this.bloomResolutionScale));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(bloomWidth, bloomHeight),
      this.config.bloom.strength,
      this.config.bloom.radius,
      this.config.bloom.threshold
    );
    this.bloomPass.enabled = this.config.renderEffects?.bloom !== false && this.config.bloom.strength > 0;
    this.composer.addPass(this.bloomPass);
  }

  #createGlobe() {
    this.globe = new THREE.Group();
    this.scene.add(this.globe);
    this.oceanMesh = this.assets.oceanMesh;
    this.landMesh = this.assets.landMesh;
    this.visibleLandMesh = this.landMesh;
    this.landHitMesh = this.landMesh.clone(false);
    this.landHitMesh.name = "stationary-country-hit-mesh";
    this.landHitMesh.material = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false
    });
    this.landHitMesh.visible = true;

    this.oceanMesh.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.config.colors.ocean),
      emissive: new THREE.Color("#08080a"),
      emissiveIntensity: this.config.renderEffects?.oceanEmissive === false ? 0 : this.config.materials.ocean.emissiveStrength,
      roughness: this.config.materials.ocean.roughness,
      metalness: this.config.materials.ocean.metalness,
      flatShading: true,
      envMapIntensity: 0.1
    });
    applyGraphiteFacetBoost(this.oceanMesh.material, {
      strength: this.config.renderEffects?.graphiteFacet === false ? 0 : this.config.materials.ocean.graphiteFacetBoost,
      rimStrength: 0.042,
      rimPower: 1.85
    });

    this.landMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.config.colors.land),
      emissive: new THREE.Color("#08080a"),
      emissiveIntensity: this.config.renderEffects?.landEmissive === false ? 0 : this.config.materials.land.emissiveStrength,
      roughness: this.config.materials.land.roughness,
      metalness: this.config.materials.land.metalness,
      flatShading: true,
      envMapIntensity: 0.16
    });
    applyGraphiteFacetBoost(this.landMaterial, {
      strength: this.config.renderEffects?.graphiteFacet === false ? 0 : this.config.materials.land.graphiteFacetBoost,
      rimStrength: 0.058,
      rimPower: 1.7
    });
    this.visibleLandMesh.material = this.landMaterial;
    this.globe.add(this.oceanMesh, this.visibleLandMesh);
    this.#frameGlobe(this.oceanMesh, this.visibleLandMesh);
    this.landHitMesh.position.copy(this.visibleLandMesh.position);
    this.landHitMesh.quaternion.copy(this.visibleLandMesh.quaternion);
    this.landHitMesh.scale.copy(this.visibleLandMesh.scale);
    this.globe.add(this.landHitMesh);
    this.globeRadius = this.visibleLandMesh.geometry.boundingSphere?.radius ?? 2.55;
    this.presentationRadius = this.globeRadius;
    this.tmpPresentationCenter = new THREE.Vector3();
    this.tmpPresentationDirection = new THREE.Vector3();
    this.applyPresentationConfig(this.config.presentation);
  }

  #createLights() {
    const cfg = this.config.lights;
    this.lights.ambient = new THREE.AmbientLight(cfg.ambient.color, cfg.ambient.intensity);
    this.lights.ambient.visible = cfg.ambient.enabled !== false && Number(cfg.ambient.intensity) > 0;
    this.lights.hemisphere = new THREE.HemisphereLight(
      cfg.hemisphere.skyColor,
      cfg.hemisphere.groundColor,
      cfg.hemisphere.intensity
    );
    this.lights.hemisphere.visible = cfg.hemisphere.enabled !== false && Number(cfg.hemisphere.intensity) > 0;
    this.scene.add(this.lights.ambient, this.lights.hemisphere);
    this.#addDirectional("directionalKey", cfg.directionalKey);
    this.#addDirectional("softKey", cfg.softKey);
    this.#addDirectional("fill", cfg.fill);
    this.#addDirectional("undersideFill", cfg.undersideFill);
    this.#addDirectional("rearFill", cfg.rearFill);
    this.#addDirectional("crimsonRim", cfg.crimsonRim);
    this.#addDirectional("crimsonBack", cfg.crimsonBack);
    this.#addDirectional("crimsonBounce", cfg.crimsonBounce);
  }

  #addDirectional(name, cfg) {
    if (!cfg || cfg.enabled === false || Number(cfg.intensity) <= 0) return;
    const light = new THREE.DirectionalLight(cfg.color, cfg.intensity);
    light.position.set(cfg.x, cfg.y, cfg.z);
    this.lights[name] = light;
    this.scene.add(light);
  }

  #frameGlobe(...meshes) {
    const box = new THREE.Box3();
    const center = new THREE.Vector3();
    meshes.forEach((mesh) => box.expandByObject(mesh));
    box.getCenter(center);
    this.globe.position.copy(center).multiplyScalar(-1);
  }

  setIdleMotionSpeedMultiplier(multiplier = 1) {
    // The mobile entrance deliberately accelerates the existing idle-spin
    // system, then eases it back to 1x so the direction/phase stays continuous.
    // Keep a generous safety ceiling while preventing unbounded values.
    const previousMultiplier = this.idleMotionSpeedMultiplier;
    this.idleMotionSpeedMultiplier = Number.isFinite(multiplier)
      ? THREE.MathUtils.clamp(multiplier, 0, 120)
      : 1;
    // Finishing an accelerated entrance should flow directly into idle motion,
    // rather than inheriting a stale interaction hold from startup/layout work.
    if (previousMultiplier > 1 && this.idleMotionSpeedMultiplier <= 1) {
      this.visualIdleMotion.lastInteractionAt = -Infinity;
    }
  }

  #resolveFramePolicy(now) {
    const interactive =
      this.controlsActive ||
      now < this.interactionActiveUntil ||
      this.activityState.cameraTravel ||
      this.activityState.hover ||
      this.activityState.selectionAnimation ||
      this.activityState.transition;
    if (interactive) return { policy: "interactive", targetFps: 60 };
    if (this.activityState.ambientAnimation) return { policy: "ambient", targetFps: 30 };

    const reducedMotion = Boolean(this.config.motion?.reduced);
    const ambientMotionAvailable =
      !reducedMotion &&
      !this.idleMotionSuppressed &&
      Math.abs(this.config.idleMotion.idleRotationSpeed * this.idleMotionSpeedMultiplier) > 0.000001;
    const timeSinceInteraction = Math.max(0, now - (this.interactionActiveUntil - 1500));
    if (ambientMotionAvailable && timeSinceInteraction < 8_000) {
      return { policy: "ambient", targetFps: 30 };
    }
    return { policy: "long-idle", targetFps: 12 };
  }

  #publishPerformance(force = false) {
    const now = performance.now();
    if (!force && now - this.lastPerformancePublishAt < 750) return;
    this.lastPerformancePublishAt = now;
    const snapshot = this.getPerformanceSnapshot();
    this.performanceListeners.forEach((listener) => listener(snapshot));
  }

  #listen(target, eventName, listener, options) {
    target.addEventListener(eventName, listener, options);
    this.eventListenerDisposers.push(() => target.removeEventListener(eventName, listener, options));
  }

  #updateVisualIdleMotion(delta, elapsed) {
    const motion = this.config.idleMotion;
    const speedMultiplier = this.idleMotionSpeedMultiplier;
    // An accelerated cinematic entrance is intentional motion and must not be
    // blocked by the normal post-touch idle delay. Positive land rotation reads
    // rightward while the ocean intentionally counter-rotates leftward.
    const interactionHeld = speedMultiplier <= 1 && elapsed - this.visualIdleMotion.lastInteractionAt < motion.idleResumeDelaySeconds;
    const idleSuppressed = this.idleMotionSuppressed;
    const landTargetSpeed = interactionHeld || idleSuppressed ? 0 : motion.idleRotationSpeed * speedMultiplier;
    const oceanTargetSpeed = idleSuppressed ? 0 : -motion.idleRotationSpeed * speedMultiplier * (interactionHeld ? motion.oceanInteractionSpeedRatio : 1);
    const easeSeconds = interactionHeld ? motion.landInteractionEaseSeconds : motion.idleResumeEaseSeconds;
    this.visualIdleMotion.landSpeed = easeScalar(this.visualIdleMotion.landSpeed, landTargetSpeed, delta, easeSeconds);
    this.visualIdleMotion.oceanSpeed = easeScalar(this.visualIdleMotion.oceanSpeed, oceanTargetSpeed, delta, easeSeconds);
    if (this.visibleLandMesh) this.visibleLandMesh.rotation.y += this.visualIdleMotion.landSpeed * delta;
    if (this.oceanMesh) this.oceanMesh.rotation.y += this.visualIdleMotion.oceanSpeed * delta;
  }
}

function easeScalar(current, target, delta, durationSeconds) {
  if (durationSeconds <= 0 || Math.abs(current - target) < 0.000001) return target;
  const alpha = 1 - Math.exp((-delta * 4.6) / durationSeconds);
  return THREE.MathUtils.lerp(current, target, THREE.MathUtils.clamp(alpha, 0, 1));
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fpsFromSamples(samples) {
  const averageFrameTime = average(samples.map((sample) => sample.frameTimeMs).filter(Number.isFinite));
  return averageFrameTime && averageFrameTime > 0 ? 1000 / averageFrameTime : null;
}

function lowestFps(samples) {
  if (!samples.length) return null;
  const worstFrameTime = Math.max(...samples.map((sample) => sample.frameTimeMs));
  return worstFrameTime > 0 ? 1000 / worstFrameTime : null;
}

function onePercentLowFps(frameTimes) {
  if (frameTimes.length < 20) return null;
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const percentileIndex = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));
  const p99FrameTime = sorted[percentileIndex];
  return p99FrameTime > 0 ? 1000 / p99FrameTime : null;
}

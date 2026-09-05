export class ExplorerNavigationController {
  constructor({ cameraFocus, config }) {
    this.cameraFocus = cameraFocus;
    this.config = config;
  }

  selectVenue({ worldPosition, elapsed = 0, heroCompositionMeasure = null }) {
    if (!worldPosition) return;
    this.cameraFocus?.focus(worldPosition, elapsed, {
      arrivalMode: "accurate-center",
      heroCompositionMeasure
    });
  }

  selectNearbyVenue({ fromWorldPosition, worldPosition, elapsed = 0 }) {
    if (!fromWorldPosition || !worldPosition) return;
    this.cameraFocus?.focusNearby(fromWorldPosition, worldPosition, elapsed);
  }

  selectRegion({ worldPosition, elapsed = 0, focusDistance = null }) {
    if (!worldPosition) return;
    this.cameraFocus?.focus(worldPosition, elapsed, {
      focusDistance: Number.isFinite(focusDistance)
        ? focusDistance
        : this.config.progressiveDisclosure.clusterFocusDistance,
      arrivalMode: "accurate-center",
      heroArrival: false
    });
  }

  selectCountry({ worldPosition, elapsed = 0, focusDistance = null }) {
    if (!worldPosition) return;
    this.cameraFocus?.focus(worldPosition, elapsed, {
      // Country selection is an orientation step, not a venue arrival. Keep it
      // meaningfully farther out than cluster/listing focus so drilling into a
      // discovery marker produces a visible second level instead of replaying
      // nearly the same camera move. Large activity footprints can request a
      // wider framing distance so all active areas remain in view.
      focusDistance: Number.isFinite(focusDistance)
        ? focusDistance
        : this.config.progressiveDisclosure.worldExitDistance,
      durationMs: this.config.selection?.focusDurationMs
    });
  }

  returnToWorld(elapsed = 0, worldPosition = null) {
    this.cameraFocus?.focusWorld(elapsed, { worldPosition });
  }

  update(elapsed = 0) {
    return this.cameraFocus?.update(elapsed) ?? null;
  }

  dispose() {
    this.cameraFocus?.dispose();
  }

  isFocusActive() {
    return Boolean(this.cameraFocus?.animation?.active);
  }

  updateHeroArrivalProfile(profile = {}) {
    return this.cameraFocus?.updateHeroArrivalProfile(profile);
  }

  previewHeroArrival(worldTarget, profile = {}) {
    return this.cameraFocus?.previewHeroArrival(worldTarget, profile) ?? null;
  }

  animateHeroArrivalPreview(worldTarget, profile = {}, elapsed = 0) {
    return this.cameraFocus?.animateHeroArrivalPreview(worldTarget, profile, elapsed) ?? null;
  }

  previewHeroArrivalProgress(worldTarget, profile = {}, progress = 0) {
    return this.cameraFocus?.previewHeroArrivalProgress(worldTarget, profile, progress) ?? null;
  }

  captureHeroArrivalProfile(worldTarget) {
    return this.cameraFocus?.captureHeroArrivalProfile(worldTarget) ?? null;
  }

  getHeroArrivalProfile() {
    return this.cameraFocus?.getHeroArrivalProfile() ?? null;
  }

  getHeroArrivalDebug(worldTarget = null) {
    return this.cameraFocus?.getHeroArrivalDebug(worldTarget) ?? null;
  }
}

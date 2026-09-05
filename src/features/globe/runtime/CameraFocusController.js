import * as THREE from "three";

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class CameraFocusController {
  constructor({ camera, controls, globe, config, globeRadius }) {
    this.camera = camera;
    this.controls = controls;
    this.globe = globe;
    this.config = config;
    this.globeRadius = globeRadius;
    this.defaultCameraDistance = camera.position.distanceTo(controls.target);
    this.defaultCameraFov = camera.fov;
    this.animation = {
      active: false,
      startedAt: 0,
      duration: 1.2,
      fromCameraPosition: new THREE.Vector3(),
      toCameraPosition: new THREE.Vector3(),
      fromTarget: new THREE.Vector3(),
      toTarget: new THREE.Vector3(),
      arcOffset: new THREE.Vector3(),
      targetDirection: new THREE.Vector3(),
      heroArrival: false,
      arrivalMode: "cinematic-offset",
      ease: "cinematic",
      fromFov: camera.fov,
      toFov: camera.fov,
      fromViewOffset: null,
      toViewOffset: null
    };
    this.tmpGlobeCenter = new THREE.Vector3();
    this.tmpTargetDirection = new THREE.Vector3();
    this.tmpRight = new THREE.Vector3();
    this.tmpUpTangent = new THREE.Vector3();
    this.tmpComposedDirection = new THREE.Vector3();
    this.tmpCurrentDirection = new THREE.Vector3();
    this.tmpFocusCamera = new THREE.Vector3();
    this.tmpFocusOffset = new THREE.Vector3();
    this.tmpBaseCameraPosition = new THREE.Vector3();
    this.tmpHeroViewDirection = new THREE.Vector3();
    this.tmpHeroCameraPosition = new THREE.Vector3();
    this.tmpHeroWorldTarget = new THREE.Vector3();
    this.tmpHeroProjection = new THREE.Vector3();
    this.tmpSavedCameraPosition = new THREE.Vector3();
    this.tmpSavedControlsTarget = new THREE.Vector3();
    this.tmpCorrectionDirection = new THREE.Vector3();
    this.tmpCorrectionCandidate = new THREE.Vector3();
    this.tmpHeroHeadingQuaternion = new THREE.Quaternion();
    this.tmpHeroStageRight = new THREE.Vector3();
    this.tmpHeroStageUp = new THREE.Vector3();
    this.tmpHeroCorrectionRight = new THREE.Vector3();
    this.tmpHeroCorrectionUp = new THREE.Vector3();
  }

  focusNearby(fromWorldTarget, worldTarget, elapsed = 0) {
    if (!fromWorldTarget || !worldTarget) return;
    this.update(elapsed);
    this.globe.getWorldPosition(this.tmpGlobeCenter);

    this.tmpTargetDirection.copy(worldTarget).sub(this.tmpGlobeCenter).normalize();
    this.tmpCurrentDirection.copy(fromWorldTarget).sub(this.tmpGlobeCenter).normalize();
    if (this.tmpTargetDirection.lengthSq() < 0.0001 || this.tmpCurrentDirection.lengthSq() < 0.0001) return;

    const angularDistance = this.tmpCurrentDirection.angleTo(this.tmpTargetDirection);
    const duration = this.config.motion?.reduced
      ? 0.001
      : THREE.MathUtils.lerp(
        0.28,
        0.62,
        THREE.MathUtils.clamp(angularDistance / THREE.MathUtils.degToRad(12), 0, 1)
      );

    const rotation = new THREE.Quaternion().setFromUnitVectors(this.tmpCurrentDirection, this.tmpTargetDirection);
    this.animation.active = true;
    this.animation.startedAt = elapsed;
    this.animation.duration = duration;
    this.animation.arrivalMode = "nearby-retarget";
    this.animation.ease = "smooth";
    this.animation.heroArrival = false;
    this.animation.targetDirection.copy(this.tmpTargetDirection);
    this.animation.fromCameraPosition.copy(this.camera.position);
    this.animation.fromTarget.copy(this.controls.target);
    this.animation.fromFov = this.camera.fov;
    this.animation.toFov = this.camera.fov;
    this.animation.fromViewOffset = this.#captureHeroProjection();
    this.animation.toViewOffset = cloneViewOffset(this.animation.fromViewOffset);
    this.animation.arcOffset.set(0, 0, 0);

    this.animation.toCameraPosition.copy(this.camera.position)
      .sub(this.tmpGlobeCenter)
      .applyQuaternion(rotation)
      .add(this.tmpGlobeCenter);
    this.animation.toTarget.copy(this.controls.target)
      .sub(this.tmpGlobeCenter)
      .applyQuaternion(rotation)
      .add(this.tmpGlobeCenter);
  }

  focus(worldTarget, elapsed = 0, overrides = {}) {
    const focus = this.config.cameraFocus;
    if (!worldTarget || !focus.enableAutoFocus) return;
    this.update(elapsed);
    this.globe.getWorldPosition(this.tmpGlobeCenter);
    this.tmpTargetDirection.copy(worldTarget).sub(this.tmpGlobeCenter).normalize();
    this.tmpRight.crossVectors(WORLD_UP, this.tmpTargetDirection).normalize();
    if (this.tmpRight.lengthSq() < 0.0001) this.tmpRight.set(1, 0, 0);
    this.tmpUpTangent.crossVectors(this.tmpTargetDirection, this.tmpRight).normalize();
    this.tmpComposedDirection.copy(this.tmpTargetDirection)
      .addScaledVector(this.tmpRight, focus.offsetX)
      .addScaledVector(this.tmpUpTangent, focus.offsetY)
      .normalize();
    const arrivalMode = overrides.arrivalMode === "accurate-center"
      ? "accurate-center"
      : "cinematic-offset";
    this.tmpCurrentDirection.copy(this.camera.position).sub(this.controls.target).normalize();
    const angularDistance = this.tmpCurrentDirection.angleTo(this.tmpComposedDirection);
    const configuredDistance = Number.isFinite(overrides.focusDistance)
      ? overrides.focusDistance
      : Number.isFinite(focus.focusDistance)
      ? focus.focusDistance
      : this.defaultCameraDistance * (1 - focus.zoomAmount);
    const targetDistance = THREE.MathUtils.clamp(
      configuredDistance,
      this.controls.minDistance,
      this.controls.maxDistance
    );
    const currentDistance = this.camera.position.distanceTo(this.controls.target);
    const angularTravel = THREE.MathUtils.clamp(angularDistance / Math.PI, 0, 1);
    const travelProfile = smootherstep(angularTravel);
    const zoomTravel = THREE.MathUtils.clamp(Math.abs(currentDistance - targetDistance) / Math.max(this.controls.maxDistance - this.controls.minDistance, 0.001), 0, 1);
    const requestedDurationMs = Number.isFinite(overrides.durationMs) ? overrides.durationMs : focus.durationMs;
    const baseDuration = (requestedDurationMs / 1000) / Math.max(focus.rotationSpeedMultiplier, 0.001);
    const cinematicDuration = THREE.MathUtils.lerp(1.05, 3.15, travelProfile) + zoomTravel * 0.35;
    const duration = this.config.motion?.reduced
      ? 0.001
      : THREE.MathUtils.clamp(
        Math.max(baseDuration * THREE.MathUtils.lerp(0.78, 1.08, travelProfile), cinematicDuration),
        1.05,
        3.45
      );
    this.animation.active = true;
    this.animation.startedAt = elapsed;
    this.animation.duration = duration;
    this.animation.arrivalMode = arrivalMode;
    this.animation.ease = focus.heroArrival?.ease ?? "cinematic";
    this.animation.heroArrival = false;
    this.animation.targetDirection.copy(this.tmpTargetDirection);
    this.animation.fromCameraPosition.copy(this.camera.position);
    this.animation.fromFov = this.camera.fov;
    this.animation.toFov = this.camera.fov;
    this.animation.fromViewOffset = this.#captureHeroProjection();
    this.animation.toViewOffset = cloneViewOffset(this.animation.fromViewOffset);
    this.tmpFocusCamera.copy(this.tmpGlobeCenter)
      .addScaledVector(this.tmpComposedDirection, targetDistance)
      .addScaledVector(WORLD_UP, focus.cameraYOffset ?? 0);
    this.tmpFocusOffset.copy(this.tmpFocusCamera)
      .sub(this.tmpGlobeCenter)
      .normalize()
      .multiplyScalar(targetDistance);
    if (arrivalMode === "accurate-center") {
      const hero = focus.heroArrival ?? {};
      const heroArrivalEnabled = overrides.heroArrival !== false && hero.enabled !== false;
      if (heroArrivalEnabled) {
        if (Number.isFinite(hero.fov)) {
          this.camera.fov = hero.fov;
          this.camera.updateProjectionMatrix();
        }
        this.#composeHeroCameraPosition(
          worldTarget,
          { centerDistance: targetDistance, ...hero },
          this.animation.toCameraPosition,
          overrides.heroCompositionMeasure
        );
        this.animation.toFov = this.camera.fov;
        this.animation.toViewOffset = this.#captureHeroProjection();
        this.animation.toTarget.copy(this.tmpGlobeCenter);
        this.animation.heroArrival = true;
      } else {
        this.animation.toViewOffset = null;
        this.animation.toCameraPosition.copy(this.tmpGlobeCenter)
          .addScaledVector(this.tmpTargetDirection, targetDistance);
        this.animation.toTarget.copy(this.tmpGlobeCenter);
      }
      this.animation.arcOffset.copy(this.tmpGlobeCenter)
        .add(this.tmpFocusOffset)
        .sub(this.animation.toCameraPosition);
    } else {
      this.animation.toViewOffset = null;
      this.animation.toCameraPosition.copy(this.tmpGlobeCenter).add(this.tmpFocusOffset);
      this.animation.arcOffset.set(0, 0, 0);
      this.animation.toTarget.copy(this.tmpGlobeCenter);
    }
    this.animation.fromTarget.copy(this.controls.target);
    this.camera.fov = this.animation.fromFov;
    this.#applyHeroProjectionState(this.animation.fromViewOffset);
    this.camera.updateProjectionMatrix();
  }

  updateHeroArrivalProfile(profile = {}) {
    const focus = this.config.cameraFocus;
    focus.heroArrival = {
      ...(focus.heroArrival ?? {}),
      ...definedEntries(profile)
    };
    if (Number.isFinite(profile.durationMs)) focus.durationMs = profile.durationMs;
    if (Number.isFinite(profile.focusDistance)) focus.focusDistance = profile.focusDistance;
    if (Number.isFinite(profile.offsetX)) focus.offsetX = profile.offsetX;
    if (Number.isFinite(profile.offsetY)) focus.offsetY = profile.offsetY;
    if (Number.isFinite(profile.cameraYOffset)) focus.cameraYOffset = profile.cameraYOffset;
    if (Number.isFinite(profile.fov)) {
      this.camera.fov = profile.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  getHeroArrivalProfile() {
    const focus = this.config.cameraFocus;
    return {
      ...(focus.heroArrival ?? {}),
      durationMs: focus.durationMs,
      focusDistance: focus.focusDistance,
      offsetX: focus.offsetX,
      offsetY: focus.offsetY,
      cameraYOffset: focus.cameraYOffset,
      fov: this.camera.fov
    };
  }

  previewHeroArrival(worldTarget, profile = {}) {
    if (!worldTarget) return null;
    this.updateHeroArrivalProfile(profile);
    this.animation.active = false;
    this.#composeHeroCameraPosition(worldTarget, this.getHeroArrivalProfile(), this.tmpHeroCameraPosition, profile.heroCompositionMeasure);
    this.controls.target.copy(this.tmpGlobeCenter);
    this.camera.position.copy(this.tmpHeroCameraPosition);
    this.controls.update();
    return this.getHeroArrivalDebug(worldTarget);
  }

  animateHeroArrivalPreview(worldTarget, profile = {}, elapsed = 0) {
    if (!worldTarget) return null;
    this.updateHeroArrivalProfile(profile);
    this.update(elapsed);
    this.animation.active = true;
    this.animation.startedAt = elapsed;
    this.animation.duration = Math.max((profile.durationMs ?? this.config.cameraFocus.durationMs ?? 1200) / 1000, 0.001);
    this.animation.arrivalMode = "accurate-center";
    this.animation.ease = profile.ease ?? this.config.cameraFocus.heroArrival?.ease ?? "cinematic";
    this.animation.heroArrival = true;
    this.animation.arcOffset.set(0, 0, 0);
    this.globe.getWorldPosition(this.tmpGlobeCenter);
    this.animation.fromCameraPosition.copy(this.camera.position);
    this.animation.fromTarget.copy(this.tmpGlobeCenter);
    this.#composeHeroCameraPosition(worldTarget, this.getHeroArrivalProfile(), this.animation.toCameraPosition, profile.heroCompositionMeasure);
    this.animation.toTarget.copy(this.tmpGlobeCenter);
    this.animation.targetDirection.copy(worldTarget).sub(this.tmpGlobeCenter).normalize();
    this.controls.target.copy(this.tmpGlobeCenter);
    this.controls.update();
    return this.getHeroArrivalDebug(worldTarget);
  }

  previewHeroArrivalProgress(worldTarget, profile = {}, progress = 0) {
    if (!worldTarget) return null;
    this.updateHeroArrivalProfile(profile);
    this.animation.active = false;
    this.globe.getWorldPosition(this.tmpGlobeCenter);
    this.#composeHeroCameraPosition(
      worldTarget,
      this.getHeroArrivalProfile(),
      this.tmpHeroCameraPosition,
      profile.heroCompositionMeasure
    );

    const worldDistance = Number.isFinite(this.config.progressiveDisclosure?.worldDistance)
      ? this.config.progressiveDisclosure.worldDistance
      : this.defaultCameraDistance;
    this.tmpBaseCameraPosition.fromArray(this.config.renderer?.cameraPosition ?? [0, 0.45, worldDistance]);
    if (this.tmpBaseCameraPosition.lengthSq() < 0.0001) this.tmpBaseCameraPosition.set(0, 0, 1);
    this.tmpBaseCameraPosition.normalize().multiplyScalar(worldDistance).add(this.tmpGlobeCenter);

    const normalizedProgress = THREE.MathUtils.clamp(progress, 0, 1);
    const easedProgress = easeByName(
      normalizedProgress,
      profile.ease ?? this.config.cameraFocus.heroArrival?.ease ?? "cinematic"
    );
    this.camera.position.lerpVectors(this.tmpBaseCameraPosition, this.tmpHeroCameraPosition, easedProgress);
    this.controls.target.copy(this.tmpGlobeCenter);
    this.controls.update();

    if (normalizedProgress >= 1) {
      this.camera.position.copy(this.tmpHeroCameraPosition);
      this.controls.target.copy(this.tmpGlobeCenter);
      this.controls.update();
    }
    return this.getHeroArrivalDebug(worldTarget);
  }

  captureHeroArrivalProfile(worldTarget) {
    if (!worldTarget) return this.getHeroArrivalProfile();
    this.globe.getWorldPosition(this.tmpGlobeCenter);
    this.tmpTargetDirection.copy(worldTarget).sub(this.tmpGlobeCenter).normalize();
    this.#prepareHeroBasis();

    const currentProfile = this.getHeroArrivalProfile();
    const verticalOffset = Number.isFinite(currentProfile.verticalOffset) ? currentProfile.verticalOffset : 0;
    const cameraOffset = this.tmpHeroCameraPosition.copy(this.camera.position)
      .sub(this.tmpGlobeCenter)
      .addScaledVector(WORLD_UP, -verticalOffset);
    const centerDistance = cameraOffset.length();
    const viewDirection = cameraOffset.normalize();
    const forward = Math.max(0.001, viewDirection.dot(this.tmpTargetDirection));
    const tangentOffset = viewDirection.dot(this.tmpUpTangent) / forward;
    const sideOffset = viewDirection.dot(this.tmpRight) / forward;

    if (currentProfile.mode === "destinationTilt") {
      const cameraDirection = this.tmpCurrentDirection.copy(this.camera.position)
        .sub(this.tmpGlobeCenter)
        .normalize();
      const radial = THREE.MathUtils.clamp(cameraDirection.dot(this.tmpTargetDirection), -1, 1);
      const tangent = this.tmpHeroViewDirection.copy(cameraDirection)
        .addScaledVector(this.tmpTargetDirection, -radial);
      const tangentLength = tangent.length();
      const currentStage = currentProfile.heroStage ?? {};
      let tiltDegrees = Number.isFinite(currentStage.tiltDegrees) ? currentStage.tiltDegrees : 0;
      let headingDegrees = Number.isFinite(currentStage.headingDegrees) ? currentStage.headingDegrees : 0;
      if (tangentLength > 0.0001) {
        this.tmpHeroStageUp.copy(tangent).normalize().multiplyScalar(-1);
        tiltDegrees = THREE.MathUtils.radToDeg(Math.atan2(tangentLength, radial));
        this.tmpComposedDirection.crossVectors(this.tmpUpTangent, this.tmpHeroStageUp);
        headingDegrees = THREE.MathUtils.radToDeg(Math.atan2(
          this.tmpTargetDirection.dot(this.tmpComposedDirection),
          THREE.MathUtils.clamp(this.tmpUpTangent.dot(this.tmpHeroStageUp), -1, 1)
        ));
      }
      const projectedCenter = this.tmpHeroProjection.copy(this.tmpGlobeCenter).project(this.camera);
      const globeScreenX = THREE.MathUtils.clamp((projectedCenter.x + 1) / 2, 0.1, 0.9);
      const globeScreenY = THREE.MathUtils.clamp((1 - projectedCenter.y) / 2, 0.1, 2);
      const composition = currentProfile.heroComposition ?? {};
      return {
        ...currentProfile,
        centerDistance: Number(this.camera.position.distanceTo(this.tmpGlobeCenter).toFixed(3)),
        fov: Number(this.camera.fov.toFixed(2)),
        heroStage: {
          ...currentStage,
          distance: Number(this.camera.position.distanceTo(this.tmpGlobeCenter).toFixed(3)),
          tiltDegrees: Number(tiltDegrees.toFixed(2)),
          headingDegrees: Number(headingDegrees.toFixed(2)),
          globeScreenX: Number(globeScreenX.toFixed(4)),
          globeScreenY: Number(globeScreenY.toFixed(4)),
          labelAnchorX: Number((currentStage.labelAnchorX ?? composition.anchorX ?? 0.5).toFixed(4)),
          labelAnchorY: Number((currentStage.labelAnchorY ?? composition.anchorY ?? 0.44).toFixed(4))
        }
      };
    }

    return {
      ...currentProfile,
      centerDistance: Number(centerDistance.toFixed(3)),
      tangentOffset: Number(tangentOffset.toFixed(3)),
      sideOffset: Number(sideOffset.toFixed(3)),
      verticalOffset: Number(verticalOffset.toFixed(3)),
      fov: Number(this.camera.fov.toFixed(2))
    };
  }

  getHeroArrivalDebug(worldTarget = null) {
    const target = worldTarget ?? this.tmpHeroWorldTarget;
    const distanceFromCenter = this.camera.position.distanceTo(this.controls.target);
    const screenPosition = target
      ? this.tmpHeroProjection.copy(target).project(this.camera)
      : null;
    this.globe.getWorldPosition(this.tmpGlobeCenter);
    return {
      cameraPosition: this.camera.position.toArray(),
      cameraDistance: distanceFromCenter,
      orbitTarget: this.controls.target.toArray(),
      globeCenter: this.tmpGlobeCenter.toArray(),
      targetScreenPosition: screenPosition
        ? {
            x: (screenPosition.x + 1) / 2,
            y: (1 - screenPosition.y) / 2
          }
        : null,
      pitch: this.#estimatePitchDegrees(),
      yaw: this.#estimateYawDegrees(target),
      fov: this.camera.fov,
      currentHeroProfile: this.getHeroArrivalProfile()
    };
  }

  focusWorld(elapsed = 0, { worldPosition = null } = {}) {
    this.update(elapsed);
    this.globe.getWorldPosition(this.tmpGlobeCenter);

    // Preserve the exact user-authored view as the animation origin. Resetting the
    // controls target before these snapshots caused a visible snap back to the
    // previous hero pivot before the world-return flight began.
    this.animation.fromCameraPosition.copy(this.camera.position);
    this.animation.fromTarget.copy(this.controls.target);
    if (worldPosition) {
      this.tmpCurrentDirection.copy(worldPosition).sub(this.tmpGlobeCenter).normalize();
    } else {
      const configuredWorldCamera = this.config.renderer?.cameraPosition ?? [0, 0.45, this.defaultCameraDistance];
      this.tmpCurrentDirection.fromArray(configuredWorldCamera).sub(this.tmpGlobeCenter).normalize();
    }
    if (this.tmpCurrentDirection.lengthSq() < 0.0001) {
      this.tmpCurrentDirection.set(0, 0, 1);
    }

    const worldDistance = this.config.progressiveDisclosure.worldDistance;
    this.animation.active = true;
    this.animation.startedAt = elapsed;
    this.animation.duration = this.config.motion?.reduced
      ? 0.001
      : this.config.cameraFocus.durationMs / 1000;
    this.animation.arrivalMode = "cinematic-offset";
    this.animation.heroArrival = false;
    this.animation.arcOffset.set(0, 0, 0);
    this.animation.fromFov = this.camera.fov;
    this.animation.toFov = this.defaultCameraFov;
    this.animation.fromViewOffset = this.#captureHeroProjection();
    this.animation.toViewOffset = null;
    this.animation.toCameraPosition.copy(this.tmpGlobeCenter)
      .addScaledVector(this.tmpCurrentDirection, worldDistance);
    this.animation.toTarget.copy(this.tmpGlobeCenter);
  }

  update(elapsed) {
    if (!this.animation.active) return;
    const progress = THREE.MathUtils.clamp(
      (elapsed - this.animation.startedAt) / Math.max(this.animation.duration, 0.001),
      0,
      1
    );
    const eased = easeByName(progress, this.animation.ease);
    this.tmpBaseCameraPosition.lerpVectors(this.animation.fromCameraPosition, this.animation.toCameraPosition, eased);
    if (this.animation.arrivalMode === "accurate-center") {
      const arcWeight = cinematicArcWeight(progress);
      this.camera.position.copy(this.tmpBaseCameraPosition).addScaledVector(this.animation.arcOffset, arcWeight);
    } else {
      this.camera.position.copy(this.tmpBaseCameraPosition);
    }
    this.controls.target.lerpVectors(this.animation.fromTarget, this.animation.toTarget, eased);
    this.camera.fov = THREE.MathUtils.lerp(this.animation.fromFov, this.animation.toFov, eased);
    this.#applyHeroProjectionState(interpolateViewOffset(
      this.animation.fromViewOffset,
      this.animation.toViewOffset,
      eased,
      this.camera.aspect
    ));
    this.camera.updateProjectionMatrix();
    this.controls.update();
    if (progress >= 1) {
      this.animation.active = false;
      this.camera.position.copy(this.animation.toCameraPosition);
      this.controls.target.copy(this.animation.toTarget);
      this.camera.fov = this.animation.toFov;
      this.#applyHeroProjectionState(this.animation.toViewOffset);
      this.camera.updateProjectionMatrix();
      this.controls.update();
      return {
        arrivalMode: this.animation.arrivalMode,
        heroArrival: this.animation.heroArrival,
        targetDirection: this.animation.targetDirection.clone()
      };
    }
    return null;
  }

  dispose() {
    this.animation.active = false;
  }

  #composeHeroCameraPosition(worldTarget, hero, target, heroCompositionMeasure = null) {
    const mode = hero.mode === "destinationTilt" ? "destinationTilt" : "legacy";
    if (mode === "destinationTilt") {
      return this.#composeDestinationTiltHeroCameraPosition(worldTarget, hero, target, heroCompositionMeasure);
    }
    this.#clearHeroProjection();
    return this.#composeLegacyHeroCameraPosition(worldTarget, hero, target, heroCompositionMeasure);
  }

  #composeLegacyHeroCameraPosition(worldTarget, hero, target, heroCompositionMeasure = null) {
    this.globe.getWorldPosition(this.tmpGlobeCenter);
    this.tmpTargetDirection.copy(worldTarget).sub(this.tmpGlobeCenter).normalize();
    this.#prepareHeroBasis();
    this.tmpHeroCorrectionRight.copy(this.tmpRight);
    this.tmpHeroCorrectionUp.copy(this.tmpUpTangent);
    const minDistance = Math.max(this.controls.minDistance, 0.001);
    const heroDistance = THREE.MathUtils.clamp(
      Number.isFinite(hero.centerDistance)
        ? hero.centerDistance
        : Number.isFinite(hero.viewDistance)
          ? hero.viewDistance
          : this.config.cameraFocus.focusDistance,
      minDistance,
      this.controls.maxDistance
    );
    const horizonBias = Number.isFinite(hero.horizonBias) ? hero.horizonBias : 0;
    const screenX = Number.isFinite(hero.destinationScreenX) ? hero.destinationScreenX : 0.5;
    const screenY = Number.isFinite(hero.destinationScreenY) ? hero.destinationScreenY : 0.5;
    const tangentOffset = (Number.isFinite(hero.tangentOffset) ? hero.tangentOffset : 0.3)
      + horizonBias
      + (Number.isFinite(hero.lookAtOffset) ? hero.lookAtOffset : 0)
      + ((0.5 - screenY) * 0.45);
    const sideOffset = (Number.isFinite(hero.sideOffset) ? hero.sideOffset : 0.025)
      + (Number.isFinite(hero.horizontalOffset) ? hero.horizontalOffset : 0)
      + ((screenX - 0.5) * 0.45);
    const verticalOffset = Number.isFinite(hero.verticalOffset)
      ? hero.verticalOffset
      : this.config.cameraFocus.cameraYOffset ?? -0.34;
    this.tmpHeroViewDirection.copy(this.tmpTargetDirection)
      .addScaledVector(this.tmpUpTangent, tangentOffset)
      .addScaledVector(this.tmpRight, sideOffset)
      .normalize();
    target.copy(this.tmpGlobeCenter)
      .addScaledVector(this.tmpHeroViewDirection, heroDistance)
      .addScaledVector(WORLD_UP, verticalOffset);
    this.#applyHeroCompositionCorrection(hero, target, heroCompositionMeasure);
    return target;
  }

  #composeDestinationTiltHeroCameraPosition(worldTarget, hero, target, heroCompositionMeasure = null) {
    this.globe.getWorldPosition(this.tmpGlobeCenter);
    this.tmpTargetDirection.copy(worldTarget).sub(this.tmpGlobeCenter).normalize();
    this.#prepareHeroBasis();

    const stage = hero.heroStage ?? {};
    const minDistance = Math.max(this.controls.minDistance, 0.001);
    const heroDistance = THREE.MathUtils.clamp(
      Number.isFinite(stage.distance)
        ? stage.distance
        : Number.isFinite(hero.centerDistance)
          ? hero.centerDistance
          : this.config.cameraFocus.focusDistance,
      minDistance,
      this.controls.maxDistance
    );
    const tiltRad = THREE.MathUtils.degToRad(Number.isFinite(stage.tiltDegrees) ? stage.tiltDegrees : 18);
    const headingRad = THREE.MathUtils.degToRad(Number.isFinite(stage.headingDegrees) ? stage.headingDegrees : 0);

    this.tmpHeroHeadingQuaternion.setFromAxisAngle(this.tmpTargetDirection, headingRad);
    this.tmpHeroStageRight.copy(this.tmpRight).applyQuaternion(this.tmpHeroHeadingQuaternion).normalize();
    this.tmpHeroStageUp.copy(this.tmpUpTangent).applyQuaternion(this.tmpHeroHeadingQuaternion).normalize();
    this.tmpHeroCorrectionRight.copy(this.tmpHeroStageRight);
    this.tmpHeroCorrectionUp.copy(this.tmpHeroStageUp);

    this.tmpHeroViewDirection.copy(this.tmpTargetDirection)
      .multiplyScalar(Math.cos(tiltRad))
      .addScaledVector(this.tmpHeroStageUp, -Math.sin(tiltRad))
      .normalize();

    target.copy(this.tmpGlobeCenter).addScaledVector(this.tmpHeroViewDirection, heroDistance);
    if (hero.useViewOffset === false) {
      this.#clearHeroProjection();
    } else {
      this.#applyHeroProjection(hero);
    }
    this.#applyHeroCompositionCorrection(this.#createDestinationTiltComposition(hero), target, heroCompositionMeasure);
    return target;
  }

  #createDestinationTiltComposition(hero) {
    const stage = hero.heroStage ?? {};
    const composition = hero.heroComposition ?? {};
    return {
      ...hero,
      heroComposition: {
        ...composition,
        subject: composition.subject ?? "label",
        anchorX: Number.isFinite(stage.labelAnchorX)
          ? stage.labelAnchorX
          : Number.isFinite(composition.anchorX)
            ? composition.anchorX
            : 0.5,
        anchorY: Number.isFinite(stage.labelAnchorY)
          ? stage.labelAnchorY
          : Number.isFinite(composition.anchorY)
            ? composition.anchorY
            : 0.44,
        tolerancePx: Number.isFinite(composition.tolerancePx) ? composition.tolerancePx : 3,
        maxCorrectionDegrees: Math.min(
          Number.isFinite(composition.maxCorrectionDegrees) ? composition.maxCorrectionDegrees : 3,
          4
        )
      }
    };
  }

  #applyHeroProjection(hero) {
    const stage = hero.heroStage ?? {};
    const screenX = THREE.MathUtils.clamp(Number.isFinite(stage.globeScreenX) ? stage.globeScreenX : 0.5, 0.1, 0.9);
    const screenY = THREE.MathUtils.clamp(Number.isFinite(stage.globeScreenY) ? stage.globeScreenY : 0.62, 0.1, 2);
    const fullHeight = 1000;
    const fullWidth = Math.max(1, fullHeight * (this.camera.aspect || 1));
    const offsetX = (0.5 - screenX) * fullWidth;
    // Positive Three.js offsetY moves rendered content upward. Invert the
    // normalized screen delta so globeScreenY=0.9 actually frames Earth lower.
    const offsetY = (0.5 - screenY) * fullHeight;
    this.camera.setViewOffset(fullWidth, fullHeight, offsetX, offsetY, fullWidth, fullHeight);
    this.camera.updateProjectionMatrix();
  }

  #captureHeroProjection() {
    const view = this.camera.view;
    if (!view?.enabled) return null;
    return {
      enabled: true,
      fullWidth: view.fullWidth,
      fullHeight: view.fullHeight,
      offsetX: view.offsetX,
      offsetY: view.offsetY,
      width: view.width,
      height: view.height
    };
  }

  #applyHeroProjectionState(view) {
    if (!view?.enabled) {
      this.camera.clearViewOffset();
      return;
    }
    this.camera.setViewOffset(
      Math.max(1, view.fullWidth),
      Math.max(1, view.fullHeight),
      view.offsetX ?? 0,
      view.offsetY ?? 0,
      Math.max(1, view.width ?? view.fullWidth),
      Math.max(1, view.height ?? view.fullHeight)
    );
  }

  #clearHeroProjection() {
    if (!this.camera.view) return;
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  #applyHeroCompositionCorrection(hero, cameraPosition, measureSubject) {
    const composition = hero.heroComposition ?? {};
    if (composition.subject !== "label" || typeof measureSubject !== "function") return;
    const anchorX = Number.isFinite(composition.anchorX) ? composition.anchorX : 0.5;
    const anchorY = Number.isFinite(composition.anchorY) ? composition.anchorY : 0.44;
    const tolerancePx = Number.isFinite(composition.tolerancePx) ? composition.tolerancePx : 3;
    const maxCorrectionRad = THREE.MathUtils.degToRad(
      Number.isFinite(composition.maxCorrectionDegrees) ? composition.maxCorrectionDegrees : 8
    );
    const sampleStep = THREE.MathUtils.degToRad(0.75);
    const distance = cameraPosition.distanceTo(this.tmpGlobeCenter);
    this.tmpCorrectionDirection.copy(cameraPosition).sub(this.tmpGlobeCenter).normalize();
    this.tmpSavedCameraPosition.copy(this.camera.position);
    this.tmpSavedControlsTarget.copy(this.controls.target);

    let totalSide = 0;
    let totalTangent = 0;
    for (let index = 0; index < 6; index += 1) {
      const current = this.#measureHeroCompositionAtDirection(this.tmpCorrectionDirection, distance, measureSubject);
      if (!current) break;
      const toleranceX = tolerancePx / Math.max(current.viewportWidth ?? 1, 1);
      const toleranceY = tolerancePx / Math.max(current.viewportHeight ?? 1, 1);
      const errorX = anchorX - current.x;
      const errorY = anchorY - current.y;
      if (Math.abs(errorX) <= toleranceX && Math.abs(errorY) <= toleranceY) break;

      const sideSampleDirection = this.tmpCorrectionCandidate.copy(this.tmpCorrectionDirection)
        .addScaledVector(this.tmpHeroCorrectionRight, sampleStep)
        .normalize();
      const tangentSampleDirection = this.tmpHeroViewDirection.copy(this.tmpCorrectionDirection)
        .addScaledVector(this.tmpHeroCorrectionUp, sampleStep)
        .normalize();
      const sideSample = this.#measureHeroCompositionAtDirection(sideSampleDirection, distance, measureSubject);
      const tangentSample = this.#measureHeroCompositionAtDirection(tangentSampleDirection, distance, measureSubject);
      if (!sideSample || !tangentSample) break;

      const a = (sideSample.x - current.x) / sampleStep;
      const b = (tangentSample.x - current.x) / sampleStep;
      const c = (sideSample.y - current.y) / sampleStep;
      const d = (tangentSample.y - current.y) / sampleStep;
      const determinant = a * d - b * c;
      if (Math.abs(determinant) < 0.00001) break;

      let sideDelta = (errorX * d - b * errorY) / determinant;
      let tangentDelta = (a * errorY - errorX * c) / determinant;
      const remaining = Math.max(maxCorrectionRad - Math.hypot(totalSide, totalTangent), 0);
      const nextMagnitude = Math.hypot(sideDelta, tangentDelta);
      if (nextMagnitude > remaining && nextMagnitude > 0) {
        const scale = remaining / nextMagnitude;
        sideDelta *= scale;
        tangentDelta *= scale;
      }
      totalSide += sideDelta;
      totalTangent += tangentDelta;
      this.tmpCorrectionDirection
        .addScaledVector(this.tmpHeroCorrectionRight, sideDelta)
        .addScaledVector(this.tmpHeroCorrectionUp, tangentDelta)
        .normalize();
      if (Math.hypot(totalSide, totalTangent) >= maxCorrectionRad - 0.0001) break;
    }

    cameraPosition.copy(this.tmpGlobeCenter).addScaledVector(this.tmpCorrectionDirection, distance);
    this.camera.position.copy(this.tmpSavedCameraPosition);
    this.controls.target.copy(this.tmpSavedControlsTarget);
    this.controls.update();
  }

  #measureHeroCompositionAtDirection(direction, distance, measureSubject) {
    this.camera.position.copy(this.tmpGlobeCenter).addScaledVector(direction, distance);
    this.controls.target.copy(this.tmpGlobeCenter);
    this.controls.update();
    return measureSubject();
  }

  #prepareHeroBasis() {
    this.tmpRight.crossVectors(WORLD_UP, this.tmpTargetDirection).normalize();
    if (this.tmpRight.lengthSq() < 0.0001) this.tmpRight.set(1, 0, 0);
    this.tmpUpTangent.crossVectors(this.tmpTargetDirection, this.tmpRight).normalize();
  }

  #estimatePitchDegrees() {
    this.tmpCurrentDirection.copy(this.camera.position).sub(this.controls.target).normalize();
    return THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(this.tmpCurrentDirection.y, -1, 1)));
  }

  #estimateYawDegrees(worldTarget) {
    if (!worldTarget) return 0;
    this.globe.getWorldPosition(this.tmpGlobeCenter);
    this.tmpTargetDirection.copy(worldTarget).sub(this.tmpGlobeCenter).normalize();
    this.#prepareHeroBasis();
    this.tmpCurrentDirection.copy(this.camera.position).sub(this.tmpGlobeCenter).normalize();
    return THREE.MathUtils.radToDeg(Math.atan2(
      this.tmpCurrentDirection.dot(this.tmpRight),
      this.tmpCurrentDirection.dot(this.tmpTargetDirection)
    ));
  }
}

export function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

export function smootherstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function easeInOutCinematic(value) {
  const t = smootherstep(value);
  return t < 0.5
    ? 2 * t * t
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function easeByName(value, name = "cinematic") {
  if (name === "cubic") return easeInOutCubic(value);
  if (name === "smooth") return smootherstep(value);
  return easeInOutCinematic(value);
}

export function cinematicArcWeight(progress) {
  const t = THREE.MathUtils.clamp(progress, 0, 1);
  const fadeOut = 1 - smootherstep((t - 0.62) / 0.38);
  return Math.sin(t * Math.PI) * fadeOut;
}

function cloneViewOffset(view) {
  return view?.enabled ? { ...view } : null;
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
  if (!fromView?.enabled && !toView?.enabled) return null;
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

function definedEntries(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

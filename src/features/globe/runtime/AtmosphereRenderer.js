import * as THREE from "three";
import { createAtmosphereMaterial, createCrimsonRimMaterial } from "./shaders/atmosphereShader.js";
import { createBackgroundGlowMaterial } from "./shaders/backgroundGlowShader.js";
import { disposeObject3D } from "./math/objectPools.js";

export class AtmosphereRenderer {
  constructor({ scene, globe, camera, globeRadius, config }) {
    this.scene = scene;
    this.globe = globe;
    this.camera = camera;
    this.globeRadius = globeRadius;
    this.config = config;
    this.group = new THREE.Group();
    this.backgroundGroup = new THREE.Group();
    this.tmpGlobePosition = new THREE.Vector3();
    this.tmpCameraDirection = new THREE.Vector3();
    this.tmpCameraUp = new THREE.Vector3();
    this.tmpGlowPosition = new THREE.Vector3();
    this.presentationScale = config.presentation?.globeScale ?? 1;
    this.qualityTier = config.quality?.currentTier ?? "high";
    scene.add(this.backgroundGroup);
    globe.add(this.group);
    this.#createAtmosphere();
    if (this.config.background.enabled !== false) this.#createBackgroundGlow();
    this.#applyEffectVisibility();
  }

  update() {
    if (!this.backgroundGroup.visible || !this.backgroundGlowMesh || !this.backgroundHazeMesh) return;
    this.globe.getWorldPosition(this.tmpGlobePosition);
    this.tmpCameraDirection.copy(this.camera.position).sub(this.tmpGlobePosition).normalize();
    this.tmpCameraUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();
    const presentationRadius = this.globeRadius * this.presentationScale;
    this.tmpGlowPosition.copy(this.tmpGlobePosition)
      .addScaledVector(this.tmpCameraDirection, -presentationRadius * 1.18)
      .addScaledVector(this.tmpCameraUp, -presentationRadius * 0.15);
    this.backgroundGlowMesh.position.copy(this.tmpGlowPosition);
    this.backgroundHazeMesh.position.copy(this.tmpGlowPosition).addScaledVector(this.tmpCameraDirection, -presentationRadius * 0.04);
    this.backgroundGlowMesh.quaternion.copy(this.camera.quaternion);
    this.backgroundHazeMesh.quaternion.copy(this.camera.quaternion);
  }

  dispose() {
    this.scene.remove(this.backgroundGroup);
    this.globe.remove(this.group);
    disposeObject3D(this.group);
    disposeObject3D(this.backgroundGroup);
  }

  updateConfig(config) {
    this.config = config;
    this.#applyShellConfig(this.innerMesh, this.innerMaterial, config.atmosphere.inner);
    this.#applyShellConfig(this.outerMesh, this.outerMaterial, config.atmosphere.outer);
    this.rimMesh.scale.setScalar(config.crimsonRim.radius);
    this.#applyUniforms(this.rimMaterial, config.crimsonRim);
    this.#applyEffectVisibility();
  }

  updatePresentationConfig(presentation = this.config.presentation) {
    this.presentationScale = Number.isFinite(presentation?.globeScale) ? presentation.globeScale : 1;
    this.backgroundGlowMesh?.scale.setScalar(this.presentationScale);
    this.backgroundHazeMesh?.scale.setScalar(this.presentationScale);
    this.update();
  }

  setQualityTier(tier = "high") {
    this.qualityTier = tier;
    this.#applyEffectVisibility();
  }

  #applyEffectVisibility() {
    const isLow = this.qualityTier === "low";
    const effects = this.config.renderEffects ?? {};
    this.innerMesh.visible = effects.innerAtmosphere !== false;
    this.rimMesh.visible = effects.crimsonRimShell !== false;
    this.outerMesh.visible = !isLow && effects.outerAtmosphere !== false;
    if (this.backgroundHazeMesh) this.backgroundHazeMesh.visible = !isLow && effects.backgroundHaze !== false;
    if (this.backgroundGlowMesh) this.backgroundGlowMesh.visible = !isLow && effects.backgroundGlow !== false;
    this.backgroundGroup.visible = !isLow && Boolean(
      (this.backgroundHazeMesh && effects.backgroundHaze !== false)
      || (this.backgroundGlowMesh && effects.backgroundGlow !== false)
    );
  }

  #createAtmosphere() {
    const radius = this.globeRadius;
    const geometry = new THREE.SphereGeometry(radius, 96, 48);
    this.innerMaterial = createAtmosphereMaterial(this.config);
    this.innerMesh = new THREE.Mesh(geometry, this.innerMaterial);
    this.innerMesh.scale.setScalar(this.config.atmosphere.inner.radius);
    this.outerMaterial = createAtmosphereMaterial(this.config, { outerLayer: true });
    this.outerMesh = new THREE.Mesh(geometry, this.outerMaterial);
    this.outerMesh.scale.setScalar(this.config.atmosphere.outer.radius);
    this.rimMaterial = createCrimsonRimMaterial(this.config);
    this.rimMesh = new THREE.Mesh(geometry, this.rimMaterial);
    this.rimMesh.scale.setScalar(this.config.crimsonRim.radius);
    this.group.add(this.innerMesh, this.outerMesh, this.rimMesh);
  }

  #applyShellConfig(mesh, material, shell) {
    mesh.scale.setScalar(shell.radius);
    this.#applyUniforms(material, shell);
  }

  #applyUniforms(material, values) {
    Object.entries(values).forEach(([key, value]) => {
      if (material.uniforms[key] && typeof value === "number") {
        material.uniforms[key].value = value;
      }
    });
  }

  #createBackgroundGlow() {
    const backgroundAtmosphere = this.config.background.atmosphere;
    this.backgroundHazeMaterial = createBackgroundGlowMaterial({
      centerColor: new THREE.Color("#3c3d43"),
      outerColor: new THREE.Color("#101722"),
      opacity: 0.058,
      crimsonMix: 0.0,
      falloffStart: 0.12,
      falloffEnd: 1.0,
      falloffPower: 1.8
    });
    this.backgroundHazeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.globeRadius * 8.0, this.globeRadius * 8.0, 1, 1),
      this.backgroundHazeMaterial
    );
    this.backgroundHazeMesh.renderOrder = -11;
    this.backgroundGlowMaterial = createBackgroundGlowMaterial({
      centerColor: new THREE.Color("#5a2029"),
      outerColor: new THREE.Color("#20262f"),
      opacity: backgroundAtmosphere.opacity,
      crimsonMix: 0.18,
      falloffStart: 0.32,
      falloffEnd: 0.96,
      falloffPower: backgroundAtmosphere.feather
    });
    this.backgroundGlowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.globeRadius * backgroundAtmosphere.radius, this.globeRadius * backgroundAtmosphere.radius, 1, 1),
      this.backgroundGlowMaterial
    );
    this.backgroundGlowMesh.renderOrder = -10;
    this.backgroundGroup.add(this.backgroundHazeMesh, this.backgroundGlowMesh);
    this.updatePresentationConfig(this.config.presentation);
    this.update();
  }
}
